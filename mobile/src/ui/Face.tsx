import { Image, View } from 'react-native'
import { Text } from './Text'
import type { Item } from '../files'
import { extOf, themed, useTheme } from './theme'
import { Icon } from './icons'

/** A photo, or a plain tile with the file's kind drawn and its type in words. */
export function Face({ item, size }: { item: Pick<Item, 'uri' | 'name' | 'kind' | 'count'>; size: number }) {
  const C = useTheme()
  const s = useS()
  if (item.kind === 'photo') return <Image source={{ uri: item.uri }} style={{ width: size, height: size }} resizeMode="cover" />
  // Small tiles (a row in a sheet) keep only the type.
  const roomy = size >= 96
  const big = { fontSize: Math.max(11, Math.min(26, size * 0.17)) }
  if (item.kind === 'folder')
    return (
      <View style={[s.typeTile, { width: size, height: size, padding: roomy ? 16 : 6 }]}>
        {roomy && (
          <View style={s.mark}>
            <Icon name="folder" size={20} color={C.text2} />
          </View>
        )}
        <Text style={[s.typeText, big]}>{item.count ?? 0}</Text>
        {roomy && <Text style={s.files}>{item.count === 1 ? 'file' : 'files'}</Text>}
      </View>
    )
  return (
    <View style={[s.typeTile, { width: size, height: size, padding: roomy ? 16 : 6 }]}>
      {roomy && (
        <View style={s.mark}>
          <Icon name={item.kind === 'video' ? 'play' : 'file'} size={item.kind === 'video' ? 16 : 20} color={C.text2} />
        </View>
      )}
      <Text style={[s.typeText, big]} numberOfLines={1}>
        {extOf(item.name)}
      </Text>
    </View>
  )
}

const useS = themed((C) => ({
  typeTile: { justifyContent: 'flex-end', backgroundColor: C.card },
  typeText: { color: C.text, fontWeight: '500', letterSpacing: -0.6 },
  mark: { position: 'absolute', top: 14, left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  files: { color: C.text2, fontSize: 13.5, marginTop: -1 },
}))
