import type { MongoDb } from '../client'
import { nowIso, toIso, toInt } from './utils'
import type { Borrowing, BorrowingFilters, BorrowingInput, Paginated } from '@shared/types'
import type { BorrowingsRepository } from '../../repositories.types'
import type { BookDoc } from './books.repository'

interface BorrowingDoc {
  id: number
  book_id: number
  borrower_name: string
  borrower_id: string | null
  borrowed_at: string
  due_date: string | null
  returned_at: string | null
  status: 'borrowed' | 'returned'
}

function todayDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toDateString(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    const yyyy = value.getFullYear()
    const mm = String(value.getMonth() + 1).padStart(2, '0')
    const dd = String(value.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return String(value).slice(0, 10)
}

export function mongoBorrowingsRepository(mongo: MongoDb): BorrowingsRepository {
  const col = mongo.db.collection<BorrowingDoc>('borrowings')
  const booksCol = mongo.db.collection<BookDoc>('books')

  function docToBorrowing(
    doc: BorrowingDoc,
    book?: Pick<BookDoc, 'title' | 'cover_image' | 'call_number'> | null
  ): Borrowing {
    const borrowedAt = toIso(doc.borrowed_at)
    const dueDate = toDateString(doc.due_date)
    const returnedAt = doc.returned_at ? toIso(doc.returned_at) : null
    let status: Borrowing['status'] = doc.status ?? 'borrowed'
    if (status === 'borrowed' && dueDate && dueDate < todayDate()) {
      status = 'overdue'
    }
    return {
      id: toInt(doc.id),
      book_id: toInt(doc.book_id),
      book_title: book?.title ?? null,
      book_cover: book?.cover_image ?? null,
      book_call_number: book?.call_number ?? null,
      borrower_name: doc.borrower_name,
      borrower_id: doc.borrower_id ?? null,
      borrowed_at: borrowedAt,
      due_date: dueDate,
      returned_at: returnedAt,
      status
    }
  }

  async function getBookMap(): Promise<Map<number, Pick<BookDoc, 'title' | 'cover_image' | 'call_number'>>> {
    const books = await booksCol
      .find({}, { projection: { id: 1, title: 1, cover_image: 1, call_number: 1 } })
      .toArray()
    return new Map(books.map((b) => [Number(b.id), b]))
  }

  return {
    async list(filters: BorrowingFilters): Promise<Paginated<Borrowing>> {
      const page = Math.max(1, filters.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 15))
      const [docs, bookMap] = await Promise.all([
        col.find().sort({ borrowed_at: -1, id: -1 }).toArray(),
        getBookMap()
      ])

      let items = docs.map((d) => docToBorrowing(d, bookMap.get(Number(d.book_id))))

      if (filters.status && filters.status !== 'all') {
        items = items.filter((b) => b.status === filters.status)
      }

      const search = filters.search?.trim().toLowerCase()
      if (search) {
        items = items.filter(
          (b) =>
            b.borrower_name.toLowerCase().includes(search) ||
            (b.borrower_id ?? '').toLowerCase().includes(search) ||
            (b.book_title ?? '').toLowerCase().includes(search)
        )
      }

      const total = items.length
      const start = (page - 1) * pageSize
      const paged = items.slice(start, start + pageSize)

      return {
        items: paged,
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 1 : Math.ceil(total / pageSize)
      }
    },
    async getById(id: number): Promise<Borrowing | null> {
      const doc = await col.findOne({ id })
      if (!doc) return null
      const book = await booksCol.findOne({ id: doc.book_id })
      return docToBorrowing(doc, book)
    },
    async create(input: BorrowingInput): Promise<Borrowing> {
      const borrowedAt = input.borrowed_at || nowIso()
      const dueDate = input.due_date ? toDateString(input.due_date) : null

      const bookExists = await booksCol.findOne({ id: input.book_id })
      if (!bookExists) throw new Error('Book not found')

      // Atomic decrement of available_copies when > 0
      const updatedBook = await booksCol.findOneAndUpdate(
        { id: input.book_id, available_copies: { $gt: 0 } },
        { $inc: { available_copies: -1 }, $set: { updated_at: nowIso() } },
        { returnDocument: 'after' }
      )
      if (!updatedBook) {
        throw new Error('No available copies of this book')
      }

      const id = await mongo.nextSeq('borrowings')
      const doc: BorrowingDoc = {
        id,
        book_id: input.book_id,
        borrower_name: input.borrower_name.trim(),
        borrower_id: input.borrower_id?.trim() || null,
        borrowed_at: borrowedAt,
        due_date: dueDate,
        returned_at: null,
        status: 'borrowed'
      }
      await col.insertOne(doc)
      return docToBorrowing(doc, updatedBook)
    },
    async recordReturn(id: number): Promise<Borrowing> {
      const existing = await col.findOne({ id })
      if (!existing) throw new Error('Borrowing record not found')
      if (existing.status === 'returned') throw new Error('This borrowing was already returned')

      const returnedAt = nowIso()
      const res = await col.findOneAndUpdate(
        { id, status: { $ne: 'returned' } },
        { $set: { status: 'returned', returned_at: returnedAt } },
        { returnDocument: 'after' }
      )
      if (!res) throw new Error('This borrowing was already returned')

      const book = await booksCol.findOne({ id: existing.book_id })
      if (book) {
        const nextAvail = Math.min(book.total_copies, (book.available_copies ?? 0) + 1)
        await booksCol.updateOne(
          { id: existing.book_id },
          { $set: { available_copies: nextAvail, updated_at: nowIso() } }
        )
      }

      return docToBorrowing(res, book)
    },
    async activeCount(bookId: number): Promise<number> {
      return col.countDocuments({ book_id: bookId, status: 'borrowed' })
    },
    async listByBook(bookId: number): Promise<Borrowing[]> {
      const [docs, book] = await Promise.all([
        col.find({ book_id: bookId }).sort({ borrowed_at: -1 }).toArray(),
        booksCol.findOne({ id: bookId })
      ])
      return docs.map((d) => docToBorrowing(d, book))
    }
  }
}
