import { useMemo } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { folderFiles } from '../files'
import { sizeText } from '../protocol'
import { openReceived } from '../received'
import { extOf, themed, useTheme } from './theme'

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
          contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 12 }}
          ListEmptyComponent={<Text style={s.empty}>Nothing in it.</Text>}
          renderItem={({ item }) => {
            const inner = item.dir.split('/').slice(1).join('/')
            return (
              <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} onPress={() => void openReceived(item)}>
                <View style={s.badge}>
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
  sheet: { maxHeight: '78%', backgroundColor: C.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.lineStrong, marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '500', letterSpacing: -0.4 },
  sub: { color: C.text2, fontSize: 13.5, marginTop: 2 },
  close: { backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 18, height: 40, justifyContent: 'center' },
  closeText: { color: C.onPrimary, fontSize: 15, fontWeight: '500' },
  empty: { color: C.text2, fontSize: 14, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  badge: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: C.text, fontSize: 11, fontWeight: '500' },
  name: { color: C.text, fontSize: 15.5, fontWeight: '500' },
  meta: { color: C.text2, fontSize: 12.5, marginTop: 2 },
}))
