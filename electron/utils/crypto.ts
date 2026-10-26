import { safeStorage } from 'electron'
import { logger } from './logger'

const ENC_PREFIX = 'enc:'

/**
 * At-rest encryption for secrets such as the API access token and the
 * embedded PostgreSQL passwords. On Windows this uses DPAPI via Electron's
 * `safeStorage`, so only the same Windows user (and the machine) can decrypt
 * the values. Files whose secrets cannot be encrypted are left in the legacy
 * plaintext form with a warning instead of failing at startup.
 */

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX)
}

export function encryptSecret(plaintext: string): string {
  if (!encryptionAvailable()) {
    logger.warn('safeStorage is unavailable; storing secrets without encryption')
    return plaintext
  }
  try {
    const buffer = safeStorage.encryptString(plaintext)
    return `${ENC_PREFIX}${buffer.toString('base64')}`
  } catch (err) {
    logger.warn('failed to encrypt secret with safeStorage; storing plaintext', err)
    return plaintext
  }
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value
  if (!encryptionAvailable()) {
    throw new Error(
      'Secrets on disk are encrypted with this machine/Windows account key, but encryption is not available right now. Reinstall or run on the same Windows account to recover access.'
    )
  }
  try {
    const buffer = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buffer)
  } catch (err) {
    logger.error('failed to decrypt secret with safeStorage (key mismatch?)', err)
    throw new Error(
      'Secrets could not be decrypted with this machine/Windows account key. Reinstall or run on the same Windows account to recover access.'
    )
  }
}