import { Image, StyleSheet, Text, View } from 'react-native'
import type { Item } from '../files'
import { extOf, kindColor } from './theme'

/** A photo, or a coloured tile with the file's type. */
export function Face({ item, size }: { item: Pick<Item, 'uri' | 'name' | 'kind'>; size: number }) {
  if (item.kind === 'photo') return <Image source={{ uri: item.uri }} style={{ width: size, height: size }} resizeMode="cover" />
  return (
    <View style={[s.typeTile, { width: size, height: size, backgroundColor: kindColor(item.name) }]}>
      {item.kind === 'video' && <Text style={s.play}>▶</Text>}
      <Text style={s.typeText}>{extOf(item.name)}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  typeTile: { justifyContent: 'flex-end', padding: 14 },
  typeText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  play: { position: 'absolute', top: 12, right: 14, color: 'rgba(255,255,255,0.9)', fontSize: 18 },
})
