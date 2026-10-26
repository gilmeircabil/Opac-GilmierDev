import type { MongoDb } from '../client'
import { nowIso, toIso, toBool, toInt, escapeRegex } from './utils'
import type { Category, CategoryInput, CategoryListItem } from '@shared/types'
import type { CategoriesRepository } from '../../repositories.types'

interface CategoryDoc {
  id: number
  name: string
  name_lower: string
  description: string | null
  is_archived: boolean
  created_at: string
}

export function mongoCategoriesRepository(mongo: MongoDb): CategoriesRepository {
  const col = mongo.db.collection<CategoryDoc>('categories')
  const booksCol = mongo.db.collection<{ category_id: number | null }>('books')

  async function mapWithCount(doc: CategoryDoc): Promise<CategoryListItem> {
    const count = await booksCol.countDocuments({ category_id: doc.id })
    return {
      id: toInt(doc.id),
      name: doc.name,
      description: doc.description ?? null,
      is_archived: toBool(doc.is_archived),
      book_count: count,
      created_at: toIso(doc.created_at)
    }
  }

  return {
    async list(includeArchived = false): Promise<CategoryListItem[]> {
      const filter = includeArchived ? {} : { is_archived: { $ne: true } }
      const docs = await col.find(filter).toArray()
      docs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id)

      const countsAgg = await booksCol
        .aggregate<{ _id: number | null; count: number }>([
          { $match: { category_id: { $ne: null } } },
          { $group: { _id: '$category_id', count: { $sum: 1 } } }
        ])
        .toArray()
      const countMap = new Map<number, number>()
      for (const item of countsAgg) {
        if (item._id != null) countMap.set(Number(item._id), item.count)
      }

      return docs.map((doc) => ({
        id: toInt(doc.id),
        name: doc.name,
        description: doc.description ?? null,
        is_archived: toBool(doc.is_archived),
        book_count: countMap.get(toInt(doc.id)) ?? 0,
        created_at: toIso(doc.created_at)
      }))
    },
    async getById(id: number): Promise<Category | null> {
      const doc = await col.findOne({ id })
      if (!doc) return null
      return {
        id: toInt(doc.id),
        name: doc.name,
        description: doc.description ?? null,
        is_archived: toBool(doc.is_archived),
        created_at: toIso(doc.created_at)
      }
    },
    async create(input: CategoryInput): Promise<CategoryListItem> {
      const name = input.name.trim()
      if (!name) throw new Error('Name is required')
      const dup = await col.findOne({
        $or: [
          { name_lower: name.toLowerCase() },
          { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }
        ]
      })
      if (dup) throw new Error('A category with this name already exists')

      const id = await mongo.nextSeq('categories')
      const doc: CategoryDoc = {
        id,
        name,
        name_lower: name.toLowerCase(),
        description: input.description?.trim() || null,
        is_archived: false,
        created_at: nowIso()
      }
      await col.insertOne(doc)
      return mapWithCount(doc)
    },
    async update(id: number, input: CategoryInput): Promise<CategoryListItem> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Category not found')
      const name = input.name.trim()
      const dup = await col.findOne({
        id: { $ne: id },
        $or: [
          { name_lower: name.toLowerCase() },
          { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }
        ]
      })
      if (dup) throw new Error('A category with this name already exists')

      await col.updateOne(
        { id },
        {
          $set: {
            name,
            name_lower: name.toLowerCase(),
            description: input.description?.trim() || null
          }
        }
      )
      const updated = await col.findOne({ id })
      if (!updated) throw new Error('Failed to update category')
      return mapWithCount(updated)
    },
    async archive(id: number): Promise<CategoryListItem> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Category not found')
      const nextArchived = !existing.is_archived
      await col.updateOne({ id }, { $set: { is_archived: nextArchived } })
      const updated = await col.findOne({ id })
      if (!updated) throw new Error('Failed to archive category')
      return mapWithCount(updated)
    }
  }
}
