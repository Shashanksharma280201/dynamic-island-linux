import * as SecureStore from 'expo-secure-store'
import { cleanPairing, type Pairing } from './protocol'

const KEY = 'islanddrop.pairing'

/** The computer this phone sends to, kept in Android's encrypted storage. */
export async function loadPairing(): Promise<Pairing | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return cleanPairing(p.name ?? '', p.token ?? '', Array.isArray(p.urls) ? p.urls : [])
  } catch {
    return null
  }
}

export async function savePairing(p: Pairing): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(p))
}

export async function forgetPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY)
}
