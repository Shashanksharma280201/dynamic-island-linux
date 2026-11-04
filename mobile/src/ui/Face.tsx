import { Image, StyleSheet, Text, View } from 'react-native'
import type { Item } from '../files'
import { extOf, kindColor, themed, useTheme } from './theme'

/** A photo, or a coloured tile with the file's type. */
export function Face({ item, size }: { item: Pick<Item, 'uri' | 'name' | 'kind' | 'count'>; size: number }) {
  const s = useS()
  if (item.kind === 'photo') return <Image source={{ uri: item.uri }} style={{ width: size, height: size }} resizeMode="cover" />
  if (item.kind === 'folder')
    return (
      <View style={[s.typeTile, { width: size, height: size, backgroundColor: '#0a84ff' }]}>
        <View style={s.tab} />
        <Text style={s.typeText}>{item.count ?? 0}</Text>
        <Text style={s.files}>{item.count === 1 ? 'file' : 'files'}</Text>
      </View>
    )
  return (
    <View style={[s.typeTile, { width: size, height: size, backgroundColor: kindColor(item.name) }]}>
      {item.kind === 'video' && <Text style={s.play}>▶</Text>}
      <Text style={s.typeText}>{extOf(item.name)}</Text>
    </View>
  )
}

const useS = themed((C) => ({
  typeTile: { justifyContent: 'flex-end', padding: 14 },
  typeText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  play: { position: 'absolute', top: 12, right: 14, color: 'rgba(255,255,255,0.9)', fontSize: 18 },
  tab: { position: 'absolute', top: 14, left: 14, width: 34, height: 9, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  files: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', marginTop: -2 },
}))
