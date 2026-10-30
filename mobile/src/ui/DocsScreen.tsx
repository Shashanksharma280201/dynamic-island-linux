import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { ConvertTarget, DocAction, DocActionResult, DocEntry, DocKind, DocsView } from '../../../shared/docs'
import type { DropLink } from '../link'
import { Btn, Card, Empty, ErrorLine, Page, ago, s as k, useAction, useCall } from './kit'
import { C, kindColor } from './theme'

const TARGETS: ConvertTarget[] = ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md']
/** What a file can become (as the island's Documents tab decides; it checks again). */
function targets(from: DocKind, libreOffice: boolean): ConvertTarget[] {
  return TARGETS.filter((to) => {
    if (from === to) return false
    if (to === 'pdf') return from === 'pptx' ? libreOffice : true
    if (to === 'docx') return from !== 'pptx' || libreOffice
    if (to === 'xlsx') return from === 'csv'
    if (to === 'csv') return from === 'xlsx'
    return true
  })
}

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)

/** The island's Documents: the files there, and what it can do with them (no AI needed), right from your phone. */
export function DocsScreen({ link, top, onBack }: { link: DropLink; top: number; onBack: () => void }) {
  const { data, error, reload } = useCall<DocsView>(link, 'docs.view', [], { topic: 'docs' })
  const act = useAction(link)
  const [open, setOpen] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const files = (data?.files ?? []).filter((f) => !f.missing)

  const run = async (key: string, a: DocAction) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const r = await act.run<DocActionResult>(key, 'docs.action', a)
    if (r) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setNote(r.note ?? `Made ${r.made.map((m) => m.name).join(', ')}`)
      setPicked([])
      void reload()
    }
  }
  const pdfs = picked.filter((id) => files.find((f) => f.id === id)?.kind === 'pdf')

  return (
    <Page title="Documents" sub={data ? `${files.length} files on ${link.pairing.name}` : undefined} top={top} onBack={onBack} onRefresh={reload}>
      {!data && !error && <Empty busy title="Getting your documents…" />}
      <ErrorLine message={error || act.error} />
      {!!note && (
        <Animated.Text entering={FadeInDown} style={st.note}>
          {note}
        </Animated.Text>
      )}
      {data && !files.length && <Empty title="No documents yet" text="Add files to the island’s Documents tab on your computer (or send them from Files here first), then convert, merge and more from here." />}
      {pdfs.length >= 2 && <Btn kind="primary" label={`Merge ${pdfs.length} PDFs`} busy={act.busy === 'merge'} onPress={() => void run('merge', { op: 'merge', ids: pdfs })} />}
      {files.map((f) => (
        <FileCard
          key={f.id}
          f={f}
          open={open === f.id}
          picked={picked.includes(f.id)}
          libreOffice={!!data?.libreOffice}
          busy={act.busy}
          onToggle={() => setOpen(open === f.id ? null : f.id)}
          onPick={() => setPicked(picked.includes(f.id) ? picked.filter((x) => x !== f.id) : [...picked, f.id])}
          onRun={run}
          onSend={async () => {
            if ((await act.run('send' + f.id, 'docs.toPhone', f.id)) !== null) setNote(`${f.name} is on its way to this phone.`)
          }}
          onRemove={() =>
            Alert.alert(`Take ${f.name} off the list?`, 'The file stays on your computer.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => void act.run('remove', 'docs.remove', [f.id]).then(() => reload()) },
            ])
          }
        />
      ))}
    </Page>
  )
}

function FileCard({ f, open, picked, libreOffice, busy, onToggle, onPick, onRun, onSend, onRemove }: { f: DocEntry; open: boolean; picked: boolean; libreOffice: boolean; busy: string; onToggle: () => void; onPick: () => void; onRun: (key: string, a: DocAction) => void; onSend: () => void; onRemove: () => void }) {
  const color = kindColor(f.name)
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut} layout={LinearTransition.springify().damping(20)}>
      <Card style={[open && { borderColor: `${color}66` }]}>
        <Pressable onPress={onToggle} onLongPress={onPick} style={st.head}>
          <View style={[st.tile, { backgroundColor: color }]}>
            <Text style={st.tileText}>{f.kind.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={k.rowTitle} numberOfLines={1}>
              {f.name}
            </Text>
            <Text style={k.rowSub}>{[size(f.size), f.pages ? `${f.pages} pages` : '', f.origin === 'made' ? 'made here' : '', ago(f.at)].filter(Boolean).join(' · ')}</Text>
          </View>
          {f.kind === 'pdf' && (
            <Pressable hitSlop={10} onPress={onPick} style={[st.pick, picked && { backgroundColor: C.blue, borderColor: C.blue }]}>
              {picked && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>✓</Text>}
            </Pressable>
          )}
        </Pressable>
        {open && (
          <Animated.View entering={FadeInDown.duration(220)} style={{ gap: 10, marginTop: 12 }}>
            <Text style={k.kicker}>Convert to</Text>
            <View style={st.chips}>
              {targets(f.kind, libreOffice).map((to) => (
                <Btn key={to} small label={to.toUpperCase()} busy={busy === `convert${f.id}${to}`} onPress={() => onRun(`convert${f.id}${to}`, { op: 'convert', id: f.id, to })} />
              ))}
            </View>
            {f.kind === 'pdf' && (
              <View style={st.chips}>
                <Btn small label="Page numbers" busy={busy === `numbers${f.id}`} onPress={() => onRun(`numbers${f.id}`, { op: 'numbers', id: f.id })} />
                <Btn small label="Rotate 90°" busy={busy === `rotate${f.id}`} onPress={() => onRun(`rotate${f.id}`, { op: 'rotate', id: f.id, degrees: 90 })} />
              </View>
            )}
            <View style={st.chips}>
              <Btn small kind="accent" label="Send to this phone" busy={busy === 'send' + f.id} onPress={onSend} />
              <Btn small kind="danger" label="Remove" onPress={onRemove} />
            </View>
          </Animated.View>
        )}
      </Card>
    </Animated.View>
  )
}

const st = StyleSheet.create({
  note: { color: C.green, fontSize: 14, fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 44, height: 52, borderRadius: 10, justifyContent: 'flex-end', padding: 6 },
  tileText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  pick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.text3, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
