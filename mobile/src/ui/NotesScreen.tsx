import { useEffect, useRef, useState } from 'react'
import { Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeInDown, SlideInRight, SlideOutRight } from 'react-native-reanimated'
import type { Note, NoteSummary } from '../../../shared/types'
import type { DropLink } from '../link'
import { Btn, Card, Empty, ErrorLine, Page, ago, s as k, useAction, useCall } from './kit'
import { C } from './theme'

/** Your notes on the computer (Markdown files): find, read, write. */
export function NotesScreen({ link, top, onBack }: { link: DropLink; top: number; onBack: () => void }) {
  const { data, error, reload } = useCall<NoteSummary[]>(link, 'notes.list')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | 'new' | null>(null)
  const shown = (data ?? []).filter((n) => !q || `${n.title} ${n.preview}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <View style={{ flex: 1 }}>
      <Page title="Notes" sub={data ? `${data.length} on ${link.pairing.name}` : undefined} top={top} onBack={onBack} onRefresh={reload} right={<Btn small kind="primary" label="New" onPress={() => setOpen('new')} />}>
        <TextInput style={st.search} placeholder="Search notes" placeholderTextColor={C.text3} value={q} onChangeText={setQ} />
        {!data && !error && <Empty busy title="Getting your notes…" />}
        <ErrorLine message={error} />
        {data && !shown.length && <Empty title={q ? 'Nothing matches' : 'No notes yet'} text={q ? undefined : 'Tap New to write one. It’s saved on your computer.'} />}
        {shown.map((n, i) => (
          <Card key={n.id} onPress={() => setOpen(n.id)} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[k.rowTitle, { flex: 1, fontWeight: '800' }]} numberOfLines={1}>
                {n.title || 'Untitled'}
              </Text>
              <Text style={k.rowRight}>{ago(n.updated)}</Text>
            </View>
            {!!n.preview && (
              <Text style={k.rowSub} numberOfLines={2}>
                {n.preview}
              </Text>
            )}
          </Card>
        ))}
      </Page>
      {open && (
        <Animated.View entering={SlideInRight.springify().damping(22).stiffness(220)} exiting={SlideOutRight.duration(220)} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}>
          <Editor
            link={link}
            id={open === 'new' ? null : open}
            top={top}
            onClose={() => {
              setOpen(null)
              void reload()
            }}
          />
        </Animated.View>
      )}
    </View>
  )
}

/** One note: edits are saved when you leave (or tap Save). */
function Editor({ link, id, top, onClose }: { link: DropLink; id: string | null; top: number; onClose: () => void }) {
  const note = useCall<Note>(link, 'notes.get', [id], { when: !!id })
  const act = useAction(link)
  const [body, setBody] = useState('')
  const [noteId, setNoteId] = useState(id)
  const loaded = useRef(!id)
  const saved = useRef('')
  useEffect(() => {
    if (note.data && !loaded.current) {
      loaded.current = true
      setBody(note.data.body)
      saved.current = note.data.body
    }
  }, [note.data])

  const save = async (): Promise<boolean> => {
    if (body === saved.current || (!noteId && !body.trim())) return true
    const r = await act.run<string>('save', 'notes.save', noteId, body)
    if (r === null) return false
    setNoteId(r)
    saved.current = body
    return true
  }
  const close = async () => {
    if (await save()) onClose()
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void close()
      return true
    })
    return () => sub.remove()
  })

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page
        title={noteId ? body.split('\n')[0].replace(/^#+\s*/, '').slice(0, 60) || 'Note' : 'New note'}
        sub={act.busy === 'save' ? 'Saving…' : body !== saved.current ? 'Not saved yet' : noteId ? 'Saved on your computer' : undefined}
        top={top}
        onBack={() => void close()}
        scroll={false}
        right={
          noteId ? (
            <Pressable
              hitSlop={10}
              onPress={() =>
                Alert.alert('Delete this note?', 'From your computer too.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      if ((await act.run('delete', 'notes.remove', noteId)) !== null) onClose()
                    },
                  },
                ])
              }
            >
              <Text style={{ color: C.red, fontWeight: '700' }}>Delete</Text>
            </Pressable>
          ) : undefined
        }
      >
        {id && !note.data && !note.error && <Empty busy title="Opening…" />}
        <ErrorLine message={note.error || act.error} />
        <Animated.View entering={FadeInDown.springify().damping(20)} style={{ flex: 1, paddingHorizontal: 16 }}>
          <TextInput style={st.editor} multiline autoFocus={!id} value={body} onChangeText={setBody} placeholder="Write something…" placeholderTextColor={C.text3} textAlignVertical="top" />
        </Animated.View>
        <View style={{ padding: 16, paddingBottom: 100 }}>
          <Btn kind="primary" label="Save" busy={act.busy === 'save'} disabled={body === saved.current} onPress={() => void save()} />
        </View>
      </Page>
    </KeyboardAvoidingView>
  )
}

const st = StyleSheet.create({
  search: { backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.line },
  editor: { flex: 1, color: C.text, fontSize: 16, lineHeight: 24, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line },
})
