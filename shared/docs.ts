/** The kinds of files the Documents package works with. */
export type DocKind = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'pptx' | 'md' | 'txt'

export const KIND_LABEL: Record<DocKind, string> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  csv: 'CSV',
  pptx: 'PowerPoint',
  md: 'Markdown',
  txt: 'Text',
}

/** What a document can be converted into. */
export type ConvertTarget = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md'
export const CONVERT_TARGETS: ConvertTarget[] = ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md']

/** Which conversions exist (from → to), for the agent and the quick actions. Pure. */
export function canConvert(from: DocKind, to: ConvertTarget, hasLibreOffice: boolean): boolean {
  if (from === to) return false
  switch (to) {
    case 'pdf':
      return from === 'pptx' ? hasLibreOffice : true
    case 'docx':
      return from !== 'pptx' || hasLibreOffice
    case 'xlsx':
      return from === 'csv'
    case 'csv':
      return from === 'xlsx'
    case 'txt':
    case 'md':
      return true
  }
}

/** "340 KB". Pure. */
export { fileSize as sizeLabel } from './format'

/** A file in the Documents workspace. */
export type DocEntry = {
  id: string
  name: string
  path: string
  kind: DocKind
  /** Added by you, or made by an operation (saved in the output folder). */
  origin: 'added' | 'made'
  /** When it was added or made (epoch ms). */
  at: number
  size: number
  /** PDFs: number of pages. */
  pages?: number
  /** Moved or deleted since it was added. */
  missing?: boolean
}

/** A saved instruction to run on chosen files ("Merge these and number the pages"). */
export type DocRecipe = { id: string; name: string; instruction: string }

export type DocsView = {
  files: DocEntry[]
  recipes: DocRecipe[]
  /** Where results are saved. */
  outDir: string
  /** LibreOffice found (exact Office conversions). */
  libreOffice: boolean
}

/** Quick actions that need no AI (the Documents tab's buttons). */
export type DocAction =
  | { op: 'merge'; ids: string[] }
  | { op: 'pages'; id: string; pages: string; mode: 'keep' | 'delete' }
  | { op: 'rotate'; id: string; degrees: number }
  | { op: 'split'; id: string; every: number }
  | { op: 'convert'; id: string; to: ConvertTarget }
  | { op: 'numbers'; id: string }

/** What adding files did: the ones now listed, and the ones left out (with why). */
export type DocsAdded = { added: DocEntry[]; skipped: { path: string; why: string }[] }

/** A quick action's result: the new files, and anything worth knowing about them. */
export type DocActionResult = { made: DocEntry[]; note?: string }
