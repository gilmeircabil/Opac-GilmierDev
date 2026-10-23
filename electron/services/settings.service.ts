import type { MongoRepositories as Repositories } from '../database/mongo/repositories'
import type { SettingsMap } from '@shared/types'
import { logger } from '../utils/logger'

const DEFAULTS: SettingsMap = {
  library_name: 'OPAC Library',
  library_logo: null,
  library_address: '',
  contact_info: '',
  theme: 'light'
}

export const SETTING_KEYS = Object.keys(DEFAULTS) as Array<keyof SettingsMap>

export interface SettingsService {
  getAll(): Promise<SettingsMap>
  set(key: keyof SettingsMap, value: string | null): Promise<void>
}

export function settingsService(repo: Repositories): SettingsService {
  return {
    async getAll(): Promise<SettingsMap> {
      const all = await repo.settings.getAll()
      const result = { ...DEFAULTS }
      for (const key of SETTING_KEYS) {
        if (key in all) {
          const raw = all[key]
          if (key === 'theme') {
            result[key] = (raw === 'dark' ? 'dark' : 'light') as SettingsMap['theme']
          } else if (key === 'library_logo') {
            result[key] = typeof raw === 'string' && raw.length > 0 ? raw : null
          } else {
            result[key] = (raw ?? '') as SettingsMap[typeof key]
          }
        }
      }
      return result
    },
    async set(key: keyof SettingsMap, value: string | null): Promise<void> {
      await repo.settings.set(key, value)
      logger.info('setting updated', { key })
    }
  }
}