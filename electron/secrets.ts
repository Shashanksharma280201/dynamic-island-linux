import { safeStorage } from 'electron'

/**
 * Encrypt a secret with the desktop keyring (libsecret / KWallet via Electron
 * safeStorage). If no keyring is available the value is only obfuscated;
 * `isSecretStorageSecure()` lets the UI say so.
 */
export function encryptSecret(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(plain).toString('base64')
  }
  return 'plain:' + Buffer.from(plain, 'utf8').toString('base64')
}

export function decryptSecret(stored: string): string {
  if (stored.startsWith('enc:')) {
    return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
  }
  if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
  return ''
}

export function isSecretStorageSecure(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const backend = (safeStorage as any).getSelectedStorageBackend?.()
  return backend !== 'basic_text'
}
