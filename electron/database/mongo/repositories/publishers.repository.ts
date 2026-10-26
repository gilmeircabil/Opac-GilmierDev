import type { MongoDb } from '../client'
import { nowIso, toIso, toBool, toInt, escapeRegex } from './utils'
import type { Publisher, PublisherInput, PublisherListItem } from '@shared/types'
import type { PublishersRepository } from '../../repositories.types'

interface PublisherDoc {
  id: number
  name: string
  name_lower: string
  address: string | null
  website: string | null
  is_archived: boolean
  created_at: string
}

export function mongoPublishersRepository(mongo: MongoDb): PublishersRepository {
  const col = mongo.db.collection<PublisherDoc>('publishers')
  const booksCol = mongo.db.collection<{ publisher_id: number | null }>('books')

  async function mapWithCount(doc: PublisherDoc): Promise<PublisherListItem> {
    const count = await booksCol.countDocuments({ publisher_id: doc.id })
    return {
      id: toInt(doc.id),
      name: doc.name,
      address: doc.address ?? null,
      website: doc.website ?? null,
      is_archived: toBool(doc.is_archived),
      book_count: count,
      created_at: toIso(doc.created_at)
    }
  }

  return {
    async list(includeArchived = false): Promise<PublisherListItem[]> {
      const filter = includeArchived ? {} : { is_archived: { $ne: true } }
      const docs = await col.find(filter).toArray()
      docs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id)

      const countsAgg = await booksCol
        .aggregate<{ _id: number | null; count: number }>([
          { $match: { publisher_id: { $ne: null } } },
          { $group: { _id: '$publisher_id', count: { $sum: 1 } } }
        ])
        .toArray()
      const countMap = new Map<number, number>()
      for (const item of countsAgg) {
        if (item._id != null) countMap.set(Number(item._id), item.count)
      }

      return docs.map((doc) => ({
        id: toInt(doc.id),
        name: doc.name,
        address: doc.address ?? null,
        website: doc.website ?? null,
        is_archived: toBool(doc.is_archived),
        book_count: countMap.get(toInt(doc.id)) ?? 0,
        created_at: toIso(doc.created_at)
      }))
    },
    async getById(id: number): Promise<Publisher | null> {
      const doc = await col.findOne({ id })
      if (!doc) return null
      return {
        id: toInt(doc.id),
        name: doc.name,
        address: doc.address ?? null,
        website: doc.website ?? null,
        is_archived: toBool(doc.is_archived),
        created_at: toIso(doc.created_at)
      }
    },
    async create(input: PublisherInput): Promise<PublisherListItem> {
      const name = input.name.trim()
      if (!name) throw new Error('Name is required')
      const dup = await col.findOne({
        $or: [
          { name_lower: name.toLowerCase() },
          { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }
        ]
      })
      if (dup) throw new Error('A publisher with this name already exists')

      const id = await mongo.nextSeq('publishers')
      const doc: PublisherDoc = {
        id,
        name,
        name_lower: name.toLowerCase(),
        address: input.address?.trim() || null,
        website: input.website?.trim() || null,
        is_archived: false,
        created_at: nowIso()
      }
      await col.insertOne(doc)
      return mapWithCount(doc)
    },
    async update(id: number, input: PublisherInput): Promise<PublisherListItem> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Publisher not found')
      const name = input.name.trim()
      const dup = await col.findOne({
        id: { $ne: id },
        $or: [
          { name_lower: name.toLowerCase() },
          { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }
        ]
      })
      if (dup) throw new Error('A publisher with this name already exists')

      await col.updateOne(
        { id },
        {
          $set: {
            name,
            name_lower: name.toLowerCase(),
            address: input.address?.trim() || null,
            website: input.website?.trim() || null
          }
        }
      )
      const updated = await col.findOne({ id })
      if (!updated) throw new Error('Failed to update publisher')
      return mapWithCount(updated)
    },
    async archive(id: number): Promise<PublisherListItem> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Publisher not found')
      const nextArchived = !existing.is_archived
      await col.updateOne({ id }, { $set: { is_archived: nextArchived } })
      const updated = await col.findOne({ id })
      if (!updated) throw new Error('Failed to archive publisher')
      return mapWithCount(updated)
    }
  }
}
