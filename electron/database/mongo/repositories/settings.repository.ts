import type { MongoDb } from '../client'
import type { SettingsRepository } from '../../repositories.types'

interface SettingDoc {
  key: string
  value: string | null
}

export function mongoSettingsRepository(mongo: MongoDb): SettingsRepository {
  const col = mongo.db.collection<SettingDoc>('settings')

  return {
    async get(key: string): Promise<string | null> {
      const doc = await col.findOne({ key })
      return doc?.value ?? null
    },
    async getAll(): Promise<Record<string, string>> {
      const docs = await col.find().toArray()
      const out: Record<string, string> = {}
      for (const doc of docs) {
        if (doc.value != null) out[doc.key] = doc.value
      }
      return out
    },
    async set(key: string, value: string | null): Promise<void> {
      if (value === null) {
        await col.deleteOne({ key })
      } else {
        await col.updateOne(
          { key },
          { $set: { key, value } },
          { upsert: true }
        )
      }
    },
    async setMany(entries: Array<[string, string | null]>): Promise<void> {
      for (const [key, value] of entries) {
        await this.set(key, value)
      }
    }
  }
}
