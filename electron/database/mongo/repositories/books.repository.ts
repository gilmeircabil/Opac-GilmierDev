import type { MongoDb } from '../client'
import { nowIso, toIso, toBool, toInt, escapeRegex } from './utils'
import type { Book, BookFilters, BookInput, DashboardStats, Paginated } from '@shared/types'
import type { BooksRepository } from '../../repositories.types'

export interface BookDoc {
  id: number
  title: string
  isbn: string | null
  isbn_lower: string | null
  author_id: number | null
  category_id: number | null
  publisher_id: number | null
  publication_year: number | null
  edition: string | null
  subject: string | null
  description: string | null
  call_number: string | null
  shelf_location: string | null
  total_copies: number
  available_copies: number
  cover_image: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export function mongoBooksRepository(mongo: MongoDb): BooksRepository {
  const col = mongo.db.collection<BookDoc>('books')
  const authorsCol = mongo.db.collection<{ id: number; name: string; is_archived?: boolean }>('authors')
  const categoriesCol = mongo.db.collection<{ id: number; name: string; is_archived?: boolean }>('categories')
  const publishersCol = mongo.db.collection<{ id: number; name: string; is_archived?: boolean }>('publishers')
  const borrowingsCol = mongo.db.collection<{ book_id: number; status: string; due_date: string | null }>('borrowings')

  async function loadLookupMaps(): Promise<{
    authors: Map<number, string>
    categories: Map<number, string>
    publishers: Map<number, string>
  }> {
    const [aList, cList, pList] = await Promise.all([
      authorsCol.find().toArray(),
      categoriesCol.find().toArray(),
      publishersCol.find().toArray()
    ])
    return {
      authors: new Map(aList.map((a) => [Number(a.id), a.name])),
      categories: new Map(cList.map((c) => [Number(c.id), c.name])),
      publishers: new Map(pList.map((p) => [Number(p.id), p.name]))
    }
  }

  function mapBook(
    doc: BookDoc,
    lookups: {
      authors: Map<number, string>
      categories: Map<number, string>
      publishers: Map<number, string>
    }
  ): Book {
    const authorId = doc.author_id == null ? null : toInt(doc.author_id)
    const categoryId = doc.category_id == null ? null : toInt(doc.category_id)
    const publisherId = doc.publisher_id == null ? null : toInt(doc.publisher_id)
    const availableCopies = toInt(doc.available_copies)
    return {
      id: toInt(doc.id),
      title: doc.title,
      isbn: doc.isbn ?? null,
      author_id: authorId,
      author_name: authorId != null ? lookups.authors.get(authorId) ?? null : null,
      category_id: categoryId,
      category_name: categoryId != null ? lookups.categories.get(categoryId) ?? null : null,
      publisher_id: publisherId,
      publisher_name: publisherId != null ? lookups.publishers.get(publisherId) ?? null : null,
      publication_year: doc.publication_year == null ? null : toInt(doc.publication_year),
      edition: doc.edition ?? null,
      subject: doc.subject ?? null,
      description: doc.description ?? null,
      call_number: doc.call_number ?? null,
      shelf_location: doc.shelf_location ?? null,
      total_copies: toInt(doc.total_copies),
      available_copies: availableCopies,
      cover_image: doc.cover_image ?? null,
      is_archived: toBool(doc.is_archived),
      created_at: toIso(doc.created_at),
      updated_at: toIso(doc.updated_at),
      available: availableCopies > 0
    }
  }

  async function findRow(id: number): Promise<Book | null> {
    const doc = await col.findOne({ id })
    if (!doc) return null
    const lookups = await loadLookupMaps()
    return mapBook(doc, lookups)
  }

  async function validate(input: BookInput & { id?: number }): Promise<void> {
    const total = input.total_copies ?? 1
    const available = input.available_copies ?? total
    if (total < 1) throw new Error('Total copies must be at least 1')
    if (available < 0) throw new Error('Available copies cannot be negative')
    if (available > total) throw new Error('Available copies cannot exceed total copies')
    if (input.isbn?.trim()) {
      const isbnClean = input.isbn.trim()
      const dup = await col.findOne({
        id: { $ne: input.id ?? -1 },
        $or: [
          { isbn_lower: isbnClean.toLowerCase() },
          { isbn: { $regex: `^${escapeRegex(isbnClean)}$`, $options: 'i' } }
        ]
      })
      if (dup) throw new Error('A book with this ISBN already exists')
    }
    if (input.publication_year != null) {
      const year = input.publication_year
      if (year < 0 || year > 9999) throw new Error('Invalid publication year')
    }
  }

  async function queryBooks(filters: BookFilters): Promise<Book[]> {
    const lookups = await loadLookupMaps()
    const mongoQuery: Record<string, unknown> = {}

    if (!filters.includeArchived) {
      mongoQuery.is_archived = { $ne: true }
    }
    if (filters.category_id != null) {
      mongoQuery.category_id = Number(filters.category_id)
    }
    if (filters.author_id != null) {
      mongoQuery.author_id = Number(filters.author_id)
    }
    if (filters.publisher_id != null) {
      mongoQuery.publisher_id = Number(filters.publisher_id)
    }
    if (filters.year_from != null || filters.year_to != null) {
      const yearCond: Record<string, number> = {}
      if (filters.year_from != null) yearCond.$gte = Number(filters.year_from)
      if (filters.year_to != null) yearCond.$lte = Number(filters.year_to)
      mongoQuery.publication_year = yearCond
    }
    if (filters.availability === 'available') {
      mongoQuery.available_copies = { $gt: 0 }
    } else if (filters.availability === 'unavailable') {
      mongoQuery.available_copies = { $lte: 0 }
    }

    const docs = await col.find(mongoQuery).toArray()
    let mapped = docs.map((d) => mapBook(d, lookups))

    const search = filters.search?.trim()
    if (search) {
      const terms = search
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0)
      mapped = mapped.filter((b) => {
        const haystack = [
          b.title,
          b.isbn ?? '',
          b.subject ?? '',
          b.description ?? '',
          b.call_number ?? '',
          b.author_name ?? '',
          b.category_name ?? '',
          b.publisher_name ?? '',
          b.shelf_location ?? ''
        ]
          .join(' ')
          .toLowerCase()
        return terms.every((term) => haystack.includes(term))
      })
    }

    const sortKey = filters.sort ?? 'title_asc'
    mapped.sort((a, b) => {
      switch (sortKey) {
        case 'title_desc':
          return b.title.toLowerCase().localeCompare(a.title.toLowerCase()) || b.id - a.id
        case 'author_asc':
          return (
            (a.author_name ?? '').toLowerCase().localeCompare((b.author_name ?? '').toLowerCase()) ||
            a.title.toLowerCase().localeCompare(b.title.toLowerCase()) ||
            a.id - b.id
          )
        case 'year_desc': {
          if (a.publication_year == null && b.publication_year == null) return b.id - a.id
          if (a.publication_year == null) return 1
          if (b.publication_year == null) return -1
          return b.publication_year - a.publication_year || b.id - a.id
        }
        case 'year_asc': {
          if (a.publication_year == null && b.publication_year == null) return a.id - b.id
          if (a.publication_year == null) return 1
          if (b.publication_year == null) return -1
          return a.publication_year - b.publication_year || a.id - b.id
        }
        case 'recent':
          return b.created_at.localeCompare(a.created_at) || b.id - a.id
        case 'title_asc':
        default:
          return a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id - b.id
      }
    })

    return mapped
  }

  return {
    async list(filters: BookFilters): Promise<Paginated<Book>> {
      const page = Math.max(1, filters.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 12))
      const all = await queryBooks(filters)
      const total = all.length
      const start = (page - 1) * pageSize
      const items = all.slice(start, start + pageSize)
      return {
        items,
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 1 : Math.ceil(total / pageSize)
      }
    },
    async getById(id: number): Promise<Book | null> {
      return findRow(id)
    },
    async getBookRows(filters: BookFilters): Promise<Book[]> {
      return queryBooks(filters)
    },
    async create(input: BookInput): Promise<Book> {
      await validate(input)
      const ts = nowIso()
      const total = input.total_copies ?? 1
      const available = input.available_copies ?? total
      const isbn = input.isbn?.trim() || null
      const id = await mongo.nextSeq('books')

      const doc: BookDoc = {
        id,
        title: input.title.trim(),
        isbn,
        isbn_lower: isbn ? isbn.toLowerCase() : null,
        author_id: input.author_id ?? null,
        category_id: input.category_id ?? null,
        publisher_id: input.publisher_id ?? null,
        publication_year: input.publication_year ?? null,
        edition: input.edition?.trim() || null,
        subject: input.subject?.trim() || null,
        description: input.description?.trim() || null,
        call_number: input.call_number?.trim() || null,
        shelf_location: input.shelf_location?.trim() || null,
        total_copies: total,
        available_copies: available,
        cover_image: input.cover_image ?? null,
        is_archived: false,
        created_at: ts,
        updated_at: ts
      }
      await col.insertOne(doc)
      const row = await findRow(id)
      if (!row) throw new Error('Failed to create book')
      return row
    },
    async update(id: number, input: BookInput): Promise<Book> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Book not found')
      await validate({ ...input, id })

      const updateFields: Partial<BookDoc> = {
        updated_at: nowIso()
      }
      if (input.title !== undefined) updateFields.title = input.title.trim()
      if (input.isbn !== undefined) {
        const isbn = input.isbn?.trim() || null
        updateFields.isbn = isbn
        updateFields.isbn_lower = isbn ? isbn.toLowerCase() : null
      }
      if (input.author_id !== undefined) updateFields.author_id = input.author_id ?? null
      if (input.category_id !== undefined) updateFields.category_id = input.category_id ?? null
      if (input.publisher_id !== undefined) updateFields.publisher_id = input.publisher_id ?? null
      if (input.publication_year !== undefined) updateFields.publication_year = input.publication_year ?? null
      if (input.edition !== undefined) updateFields.edition = input.edition?.trim() || null
      if (input.subject !== undefined) updateFields.subject = input.subject?.trim() || null
      if (input.description !== undefined) updateFields.description = input.description?.trim() || null
      if (input.call_number !== undefined) updateFields.call_number = input.call_number?.trim() || null
      if (input.shelf_location !== undefined) updateFields.shelf_location = input.shelf_location?.trim() || null
      if (input.cover_image !== undefined) updateFields.cover_image = input.cover_image ?? null
      if (input.total_copies !== undefined || input.available_copies !== undefined) {
        const total = input.total_copies ?? existing.total_copies
        let available = input.available_copies !== undefined ? input.available_copies : existing.available_copies
        if (available > total) available = total
        updateFields.total_copies = total
        updateFields.available_copies = available
      }

      await col.updateOne({ id }, { $set: updateFields })
      const row = await findRow(id)
      if (!row) throw new Error('Failed to update book')
      return row
    },
    async archive(id: number): Promise<Book> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Book not found')
      await col.updateOne({ id }, { $set: { is_archived: true, updated_at: nowIso() } })
      const row = await findRow(id)
      if (!row) throw new Error('Failed to archive book')
      return row
    },
    async restore(id: number): Promise<Book> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Book not found')
      await col.updateOne({ id }, { $set: { is_archived: false, updated_at: nowIso() } })
      const row = await findRow(id)
      if (!row) throw new Error('Failed to restore book')
      return row
    },
    async delete(id: number): Promise<void> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Book not found')
      await borrowingsCol.deleteMany({ book_id: id })
      await col.deleteOne({ id })
    },
    async clearCatalog(): Promise<void> {
      await Promise.all([
        borrowingsCol.deleteMany({}),
        col.deleteMany({}),
        authorsCol.deleteMany({}),
        categoriesCol.deleteMany({}),
        publishersCol.deleteMany({})
      ])
    },
    async dashboardStats(): Promise<DashboardStats> {
      const activeBooks = await col.find({ is_archived: { $ne: true } }).toArray()
      const totalBooks = activeBooks.length
      let totalCopies = 0
      let availableCopies = 0
      for (const b of activeBooks) {
        totalCopies += toInt(b.total_copies)
        availableCopies += toInt(b.available_copies)
      }

      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      const [activeBorrowings, overdueBooks, authors, categories, publishers, recentRes] = await Promise.all([
        borrowingsCol.countDocuments({ status: 'borrowed' }),
        borrowingsCol.countDocuments({
          status: 'borrowed',
          due_date: { $ne: null, $lt: todayStr }
        }),
        authorsCol.countDocuments({ is_archived: { $ne: true } }),
        categoriesCol.countDocuments({ is_archived: { $ne: true } }),
        publishersCol.countDocuments({ is_archived: { $ne: true } }),
        this.list({ sort: 'recent', page: 1, pageSize: 6 })
      ])

      return {
        totalBooks,
        totalCopies,
        availableCopies,
        borrowedCopies: Math.max(0, totalCopies - availableCopies),
        authors,
        categories,
        publishers,
        activeBorrowings,
        overdueBooks,
        recentBooks: recentRes.items
      }
    },
    async countAll(): Promise<number> {
      return col.countDocuments({ is_archived: { $ne: true } })
    }
  }
}
