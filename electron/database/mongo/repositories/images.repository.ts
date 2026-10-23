import type { MongoDb } from '../client'
import { nowIso } from './utils'

export interface ImageDoc {
  filename: string
  mime: string
  data_base64: string
  size: number
  created_at: string
}

export interface ImagesRepository {
  save(filename: string, mime: string, buffer: Buffer): Promise<void>
  get(filename: string): Promise<{ mime: string; buffer: Buffer } | null>
  delete(filename: string): Promise<void>
  listAll(): Promise<ImageDoc[]>
  insertRaw(docs: ImageDoc[]): Promise<void>
  clear(): Promise<void>
}

export function mongoImagesRepository(mongo: MongoDb): ImagesRepository {
  const col = mongo.db.collection<ImageDoc>('images')

  return {
    async save(filename: string, mime: string, buffer: Buffer): Promise<void> {
      const doc: ImageDoc = {
        filename,
        mime,
        data_base64: buffer.toString('base64'),
        size: buffer.byteLength,
        created_at: nowIso()
      }
      await col.updateOne({ filename }, { $set: doc }, { upsert: true })
    },
    async get(filename: string): Promise<{ mime: string; buffer: Buffer } | null> {
      const doc = await col.findOne({ filename })
      if (!doc || !doc.data_base64) return null
      return {
        mime: doc.mime || 'image/jpeg',
        buffer: Buffer.from(doc.data_base64, 'base64')
      }
    },
    async delete(filename: string): Promise<void> {
      await col.deleteOne({ filename })
    },
    async listAll(): Promise<ImageDoc[]> {
      return col.find({}, { projection: { _id: 0 } }).toArray()
    },
    async insertRaw(docs: ImageDoc[]): Promise<void> {
      if (!docs.length) return
      await col.insertMany(docs)
    },
    async clear(): Promise<void> {
      await col.deleteMany({})
    }
  }
}
