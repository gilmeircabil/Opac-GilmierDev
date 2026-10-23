import { createHash, randomBytes } from 'node:crypto'
import type { MongoRepositories as Repositories } from '../database/mongo/repositories'
import type { ApiTokenInfo } from '@shared/types'
import { logger } from '../utils/logger'

const HASH_KEY = 'api_token_hash'
const LABEL_KEY = 'api_token_label'
const CREATED_KEY = 'api_token_created_at'
const LAST_USED_KEY = 'api_token_last_used'

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function generateToken(): { raw: string; hash: string; label: string } {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: sha256(raw), label: raw.slice(0, 8) }
}

export interface ApiTokenService {
  getInfo(): Promise<ApiTokenInfo>
  regenerate(): Promise<{ token: string; info: ApiTokenInfo }>
  verify(token: string): Promise<boolean>
  recordUsage(): Promise<void>
  confidentialName(): string
}

export function apiTokenService(repo: Repositories): ApiTokenService {
  return {
    async getInfo(): Promise<ApiTokenInfo> {
      const [label, createdAt, lastUsed] = await Promise.all([
        repo.settings.get(LABEL_KEY),
        repo.settings.get(CREATED_KEY),
        repo.settings.get(LAST_USED_KEY)
      ])
      return {
        configured: Boolean(label),
        label: label ?? '',
        created_at: createdAt,
        last_used_at: lastUsed
      }
    },
    async regenerate(): Promise<{ token: string; info: ApiTokenInfo }> {
      const { raw, hash, label } = generateToken()
      const now = new Date().toISOString()
      await repo.settings.setMany([
        [HASH_KEY, hash],
        [LABEL_KEY, label],
        [CREATED_KEY, now],
        [LAST_USED_KEY, null]
      ])
      logger.info('API access token regenerated', { label })
      return {
        token: raw,
        info: {
          configured: true,
          label,
          created_at: now,
          last_used_at: null
        }
      }
    },
    async verify(token: string): Promise<boolean> {
      const storedHash = await repo.settings.get(HASH_KEY)
      if (!storedHash) return false
      const inputHash = sha256(token)
      if (storedHash.length !== inputHash.length) return false
      let diff = 0
      for (let i = 0; i < storedHash.length; i++) {
        diff |= storedHash.charCodeAt(i) ^ inputHash.charCodeAt(i)
      }
      return diff === 0
    },
    async recordUsage(): Promise<void> {
      await repo.settings.set(LAST_USED_KEY, new Date().toISOString())
    },
    confidentialName(): string {
      return 'access token'
    }
  }
}