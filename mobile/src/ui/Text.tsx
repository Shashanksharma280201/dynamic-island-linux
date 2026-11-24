import { createContext, useContext } from 'react'
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps, type TextStyle } from 'react-native'
import { fontOf } from './font'

/** Inside another Text: it carries on in that one's face unless it names a weight of its own. */
const Inside = createContext(false)

/** The app's typeface for a style: its weight becomes a family (see `fontOf`), unless it names its own (code is monospace). */
function faced(style: TextProps['style'], inside: boolean): TextProps['style'] {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  if (flat.fontFamily) return style
  if (inside && flat.fontWeight === undefined) return style
  return [style, { fontFamily: fontOf(flat.fontWeight), fontWeight: 'normal' }]
}

/** Android pads a line above and below for accents the font may not have; the app's sizes are set without it. */
const BASE = { includeFontPadding: false } as const

/**
 * Words, in the app's typeface. Every screen uses this in place of React
 * Native's own Text, and writes weights as usual (`fontWeight: '600'`).
 */
export function Text({ style, ...rest }: TextProps) {
  const inside = useContext(Inside)
  const el = <RNText {...rest} style={[BASE, faced(style, inside)]} />
  return inside ? el : <Inside.Provider value>{el}</Inside.Provider>
}

/** A box to type in, in the app's typeface. */
export function TextInput({ style, ...rest }: TextInputProps) {
  return <RNTextInput {...rest} style={faced(style as TextProps['style'], false) as TextInputProps['style']} />
}
