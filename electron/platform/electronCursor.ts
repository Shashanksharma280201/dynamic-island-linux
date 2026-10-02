import { screen } from 'electron'

/** The pointer in screen points, from Electron (macOS and Windows). */
export async function electronCursor(): Promise<{ x: number; y: number }> {
  return screen.getCursorScreenPoint()
}
