export const C = {
  bg: '#0b0c0f',
  card: '#16181d',
  card2: '#1e2128',
  line: 'rgba(255,255,255,0.08)',
  text: '#f5f5f7',
  text2: 'rgba(235,235,245,0.62)',
  text3: 'rgba(235,235,245,0.36)',
  green: '#30d158',
  red: '#ff453a',
  orange: '#ff9f0a',
  blue: '#0a84ff',
  violet: '#bf5af2',
  cyan: '#64d2ff',
}

/** A file type's colour on its tile (as on the island). */
export function kindColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return '#bf5af2'
  if (['mp4', 'mov', 'mkv', 'webm', '3gp'].includes(ext)) return '#ff375f'
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac'].includes(ext)) return '#ff9f0a'
  if (ext === 'pdf') return '#ff453a'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '#0a84ff'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '#30d158'
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return '#ff9f0a'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'apk'].includes(ext)) return '#a2845e'
  return '#8e8e93'
}

export const extOf = (name: string) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 5) : 'FILE'
}
