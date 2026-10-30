import { app, clipboard, ipcMain, nativeImage, shell, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { EXT_COLOR, askPrompt, editDraft, extOf, resultName, ringFile, type RingFile } from '@shared/dragActions'
import type { Activity, JobState } from '@shared/types'
import { convertDocument, viaLibreOffice, type ConvertDeps, type ConvertTarget } from './docs/convert'
import { anyText, convertSheet, type SheetTarget } from './anyDoc'
import { freshPath, kindOf, stem } from './docs/files'
import { encodeImage, imageToPdf } from './imageOps'
import type { RingDrop } from './dragRing'
import type { TransientCards } from './transient'
import { JOB } from './ringChannels'

type Deps = ConvertDeps & {
  cards: TransientCards
  /** Where results go: next to the original, or Downloads. */
  saveTo: () => 'next' | 'downloads'
  /** Ghostscript, for shrinking PDFs properly (pdf-lib otherwise). */
  ghostscript: () => string | null
  /** tesseract and pdftoppm: Copy text reads images and scans with them. */
  tesseract: () => string | null
  pdftoppm: () => string | null
  ask: (prompt: string) => void
  edit: (draft: string) => void
  language: () => string
  trash: (path: string) => Promise<void>
  /** Dragging a result out of the island: the ring stays out of it. */
  ownDrag: () => void
  /** The island's window: the only page whose buttons these are. */
  island: () => BrowserWindow
}

const WORKING_MS = 10 * 60_000
const DONE_MS = 9000
const ERROR_MS = 12_000

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp']
const isImage = (f: RingFile) => IMAGE_EXTS.includes(f.ext)

const FORMAT: Record<string, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', csv: 'CSV', txt: 'Text', md: 'Markdown', png: 'PNG', jpg: 'JPEG', webp: 'WebP' }

const sizeText = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/**
 * Runs what was picked on the drag actions ring, and shows it on the island:
 * a pill while it works, then the result to open, show, undo or drag out.
 * Every result is a new file next to the original; nothing is overwritten.
 */
export class DragJobs {
  private seq = 0
  /** Files each job made (for Undo, Open, Show, dragging out). */
  private made = new Map<string, string[]>()

  constructor(private d: Deps) {
    const island = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => e.sender === this.d.island().webContents
    ipcMain.handle(JOB.OPEN, async (e, id) => {
      const f = this.first(id)
      if (island(e) && f) await shell.openPath(f)
    })
    ipcMain.handle(JOB.SHOW, (e, id) => {
      const f = this.first(id)
      if (island(e) && f) shell.showItemInFolder(f)
    })
    ipcMain.handle(JOB.UNDO, async (e, id) => {
      if (!island(e)) return
      for (const f of this.made.get(String(id)) ?? []) await this.d.trash(f).catch(() => {})
      this.made.delete(String(id))
      this.d.cards.dismiss(String(id))
    })
    ipcMain.on(JOB.DRAG, (e, id) => {
      const f = this.first(id)
      if (!island(e) || !f) return
      this.d.ownDrag()
      const icon = nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 0xd8), { width: 16, height: 16 })
      e.sender.startDrag({ file: f, icon })
    })
  }

  /** Another feature's card (a file from your phone…): `made` can be opened, shown, undone or dragged out like a result. */
  present(id: string, job: JobState, made?: string[]): void {
    if (made?.length) this.made.set(id, made)
    this.show(id, job)
  }

  private first(id: unknown): string | null {
    return this.made.get(String(id))?.[0] ?? null
  }

  private show(id: string, job: JobState): void {
    const ms = job.phase === 'working' ? WORKING_MS : job.phase === 'error' ? ERROR_MS : DONE_MS
    const a: Activity = { id, kind: 'job', priority: job.phase === 'error' ? 6 : 5, job }
    this.d.cards.show(a, ms)
  }

  run(drop: RingDrop): void {
    const files = drop.paths.map(ringFile)
    if (!files.length) return
    if (drop.slot === 'ask') return this.d.ask(askPrompt(drop.choice ?? 'summarize', files, this.d.language()))
    if (drop.slot === 'edit') return this.d.edit(editDraft(files))
    const id = `job-${Date.now()}-${++this.seq}`
    void this.work(id, drop, files)
  }

  private async work(id: string, drop: RingDrop, files: RingFile[]): Promise<void> {
    const sub = files.length === 1 ? files[0].name : `${files.length} files`
    const title =
      drop.slot === 'convert'
        ? `Converting to ${FORMAT[drop.choice ?? ''] ?? drop.choice}`
        : drop.slot === 'shrink'
          ? files.length === 1
            ? 'Making a smaller copy'
            : `Shrinking ${files.length} files`
          : drop.slot === 'capture'
            ? 'Copying the image'
            : 'Copying the text'
    this.show(id, { title, sub, phase: 'working', progress: files.length > 1 ? 0 : undefined })
    try {
      if (drop.slot === 'text') {
        const parts: string[] = []
        for (const f of files) parts.push(await this.textOf(f))
        const text = files.length === 1 ? parts[0] : parts.map((t, i) => `${files[i].name}\n\n${t}`).join('\n\n')
        if (!text.trim()) throw new Error('There’s no text in it to copy (a scan, perhaps).')
        clipboard.writeText(text)
        return this.show(id, { title: 'Text copied', sub, phase: 'done', note: `${text.length.toLocaleString('en')} characters, ready to paste anywhere` })
      }
      if (drop.slot === 'capture') {
        const png = await encodeImage(files[0].path, 'png')
        clipboard.writeImage(nativeImage.createFromBuffer(png.bytes))
        return this.show(id, { title: 'Image copied', sub, phase: 'done', note: 'Paste it into any app' })
      }
      const made: string[] = []
      let note = ''
      for (const [i, f] of files.entries()) {
        const r = drop.slot === 'convert' ? await this.convert(f, drop.choice ?? '') : await this.shrink(f)
        made.push(r.path)
        note = r.note
        if (files.length > 1) this.show(id, { title, sub, phase: 'working', progress: (i + 1) / files.length })
      }
      this.made.set(id, made)
      const last = made[made.length - 1]
      const ext = extOf(last)
      const where = dirname(last) === dirname(files[0].path) ? 'next to the original' : 'in Downloads'
      this.show(id, {
        title: drop.slot === 'convert' ? `Converted to ${FORMAT[ext] ?? ext.toUpperCase()}` : files.length === 1 ? 'Smaller copy saved' : `${made.length} smaller copies saved`,
        sub,
        phase: 'done',
        result: {
          path: last,
          name: made.length === 1 ? basename(last) : `${made.length} files`,
          ext,
          color: EXT_COLOR[ext] ?? '#8e8e93',
          meta: note || (made.length === 1 ? `Saved ${where}` : `Saved ${where.replace('the original', 'the originals')}`),
        },
      })
    } catch (e: any) {
      this.show(id, { title: drop.slot === 'convert' ? 'Couldn’t convert it' : drop.slot === 'shrink' ? 'Couldn’t make it smaller' : 'Couldn’t copy it', sub, phase: 'error', note: String(e?.message ?? e).slice(0, 240) })
    }
  }

  /** The folder a result goes in: next to the original unless that can't be written. */
  private async folderFor(src: string): Promise<string> {
    if (this.d.saveTo() === 'downloads') return app.getPath('downloads')
    try {
      await access(dirname(src), constants.W_OK)
      return dirname(src)
    } catch {
      return app.getPath('downloads')
    }
  }

  private async save(src: string, bytes: Uint8Array, name: string): Promise<string> {
    const ext = extOf(name)
    const path = freshPath(await this.folderFor(src), name.slice(0, -(ext.length + 1)), ext)
    await writeFile(path, bytes)
    return path
  }

  private async convert(f: RingFile, to: string): Promise<{ path: string; note: string }> {
    if (isImage(f)) {
      if (to === 'pdf') return { path: await this.save(f.path, await imageToPdf(f.path), resultName(f.base, 'convert', 'pdf')), note: '' }
      if (to !== 'png' && to !== 'jpg' && to !== 'webp') throw new Error(`An image can’t be turned into ${to.toUpperCase()}.`)
      const r = await encodeImage(f.path, to, { quality: 0.92 })
      return { path: await this.save(f.path, r.bytes, resultName(f.base, 'convert', to)), note: '' }
    }
    if (f.kind === 'sheet') {
      const r = await convertSheet(f.path, f.ext, to as SheetTarget, f.base, this.d)
      return { path: await this.save(f.path, r.bytes, resultName(f.base, 'convert', to)), note: r.note }
    }
    if (!kindOf(f.path)) return this.convertOther(f, to)
    const r = await convertDocument(f.path, to as ConvertTarget, this.d)
    return { path: await this.save(f.path, r.bytes, resultName(stem(f.path), 'convert', r.ext)), note: r.note ?? '' }
  }

  private async shrink(f: RingFile): Promise<{ path: string; note: string }> {
    const before = (await stat(f.path)).size
    let bytes: Uint8Array
    if (isImage(f)) {
      const to = f.ext === 'png' ? 'png' : f.ext === 'webp' ? 'webp' : 'jpg'
      bytes = (await encodeImage(f.path, to, { maxSide: 2560, quality: 0.78 })).bytes
    } else if (f.ext === 'pdf') {
      bytes = await this.shrinkPdf(f.path)
    } else throw new Error('Nothing to shrink in this kind of file.')
    if (bytes.length >= before * 0.97) throw new Error('It’s already about as small as it gets.')
    const path = await this.save(f.path, bytes, resultName(f.base, 'shrink', f.ext === 'jpeg' ? 'jpg' : f.ext))
    return { path, note: `${sizeText(before)} → ${sizeText(bytes.length)}, next to the original` }
  }

  private async shrinkPdf(path: string): Promise<Uint8Array> {
    const gs = this.d.ghostscript()
    if (gs) {
      const dir = await mkdtemp(join(tmpdir(), 'island-shrink-'))
      const out = join(dir, 'out.pdf')
      try {
        await new Promise<void>((res, rej) =>
          execFile(gs, ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dPDFSETTINGS=/ebook', '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${out}`, path], { timeout: 180_000 }, (e) => (e ? rej(e) : res())),
        )
        return new Uint8Array(await readFile(out))
      } catch {
        // fall back to the simple way below
      } finally {
        void rm(dir, { recursive: true, force: true })
      }
    }
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(await readFile(path), { ignoreEncryption: true })
    return doc.save({ useObjectStreams: true })
  }

  /** Files the documents engine doesn't open (OpenDocument, RTF, old Office, web pages, code): LibreOffice, or their text. */
  private async convertOther(f: RingFile, to: string): Promise<{ path: string; note: string }> {
    const soffice = this.d.soffice()
    const name = resultName(f.base, 'convert', to)
    if (soffice && (to === 'pdf' || to === 'docx' || to === 'pptx') && f.kind !== 'text') return { path: await this.save(f.path, await viaLibreOffice(soffice, f.path, to), name), note: '' }
    const text = await this.textOf(f)
    if (to === 'txt' || to === 'md') return { path: await this.save(f.path, new Uint8Array(Buffer.from(text + '\n')), name), note: to === 'md' ? 'Its text, as Markdown' : '' }
    if (to === 'pdf') {
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const html = `<!doctype html><meta charset="utf-8"><title>${f.base.replace(/</g, '')}</title><body style="margin:0"><pre style="white-space:pre-wrap;font:10pt/1.5 'DejaVu Sans Mono',monospace;margin:0">${esc}</pre>`
      return { path: await this.save(f.path, await this.d.printPdf(html), name), note: f.kind === 'text' ? '' : 'Its text only' }
    }
    throw new Error(`That can’t be turned into ${to.toUpperCase()} here.`)
  }

  private async textOf(f: RingFile): Promise<string> {
    // Sheets come as tab-separated rows (they paste into any spreadsheet as a table); images and scans are read by OCR.
    return anyText(f.path, f.ext, this.d)
  }
}
