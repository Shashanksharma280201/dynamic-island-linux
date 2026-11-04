import { useMemo } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { folderFiles } from '../files'
import { sizeText } from '../protocol'
import { openReceived } from '../received'
import { kindColor, extOf, themed, useTheme } from './theme'

/** What's in a folder the computer sent: every file in it (in its folders); tap one to open it in another app. */
export function FolderSheet({ folder, onClose }: { folder: { uri: string; name: string }; onClose: () => void }) {
  const s = useS()
  const insets = useSafeAreaInsets()
  const files = useMemo(() => folderFiles(folder.uri, folder.name), [folder.uri, folder.name])
  const bytes = files.reduce((n, f) => n + f.size, 0)
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.grab} />
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>
              {folder.name}
            </Text>
            <Text style={s.sub}>
              {files.length === 1 ? '1 file' : `${files.length} files`} · {sizeText(bytes)}
            </Text>
          </View>
          <Pressable style={s.close} onPress={onClose} hitSlop={8}>
            <Text style={s.closeText}>Done</Text>
          </Pressable>
        </View>
        <FlatList
          data={files}
          keyExtractor={(f) => f.uri}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          ListEmptyComponent={<Text style={s.empty}>Nothing in it.</Text>}
          renderItem={({ item }) => {
            const inner = item.dir.split('/').slice(1).join('/')
            return (
              <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} onPress={() => void openReceived(item)}>
                <View style={[s.badge, { backgroundColor: kindColor(item.name) }]}>
                  <Text style={s.badgeText} numberOfLines={1}>
                    {extOf(item.name)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={s.meta} numberOfLines={1}>
                    {inner ? `${inner} · ` : ''}
                    {sizeText(item.size)}
                  </Text>
                </View>
              </Pressable>
            )
          }}
        />
      </View>
    </Modal>
  )
}

const useS = themed((C) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '78%', backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.lineStrong, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  title: { color: C.text, fontSize: 20, fontWeight: '700' },
  sub: { color: C.text2, fontSize: 13, marginTop: 2 },
  close: { backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  closeText: { color: C.onPrimary, fontSize: 14, fontWeight: '600' },
  empty: { color: C.text3, fontSize: 14, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  badge: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.text3, fontSize: 12, marginTop: 2 },
}))
