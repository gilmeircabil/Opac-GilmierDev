import { existsSync, copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { MongoDb } from '../database/mongo/client'
import type { MongoRepositories } from '../database/mongo/repositories'
import { resolveImagePath } from '../config/paths'
import { logger } from '../utils/logger'

const LEGACY_MIGRATED_KEY = 'legacy_sqlite_migrated'

export interface MigrateReport {
  migrated: boolean
  counts: Record<string, number>
  warnings: string[]
}

function booleanValue(v: unknown): boolean {
  return v === 1 || v === true || v === '1' || v === 'true'
}

function intOr(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function clampCopies(total: number, available: number): { total: number; available: number } {
  let t = intOr(total, 1)
  let a = intOr(available, t)
  if (t < 1) t = 1
  if (a < 0) a = 0
  if (a > t) a = t
  return { total: t, available: a }
}

export async function migrateSqliteFrom(opts: {
  mongo: MongoDb
  repo: MongoRepositories
  sqlitePath: string
  imagesDir: string
}): Promise<MigrateReport> {
  const { mongo, sqlitePath, imagesDir } = opts

  if (!existsSync(sqlitePath)) {
    return { migrated: false, counts: {}, warnings: ['No legacy database found to migrate'] }
  }

  const already = await opts.repo.settings.get(LEGACY_MIGRATED_KEY)
  if (already === '1') {
    return { migrated: false, counts: {}, warnings: ['Legacy data was already migrated in a previous run'] }
  }

  const existing = await opts.repo.books.countAll()
  if (existing > 0) {
    return {
      migrated: false,
      counts: {},
      warnings: ['The database already contains book records. Migration was skipped to avoid duplicates.']
    }
  }

  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true })
  const warnings: string[] = []
  const counts: Record<string, number> = {}
  const seenIsbn = new Map<string, number>()

  try {
    const hasTable = (table: string): boolean => {
      const row = sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table)
      return Boolean(row)
    }

    const load = <T>(table: string): T[] => {
      if (!hasTable(table)) return []
      return sqlite.prepare(`SELECT * FROM ${table}`).all() as T[]
    }

    const simpleNames = ['authors', 'categories', 'publishers'] as const
    for (const table of simpleNames) {
      if (!hasTable(table)) {
        warnings.push(`Legacy table "${table}" not found, skipped`)
        continue
      }
      const rows = load<Record<string, unknown>>(table)
      counts[table] = 0
      let maxId = 0
      for (const row of rows) {
        const id = intOr(row.id, 0)
        if (id > maxId) maxId = id
        const name = String(row.name ?? '').trim() || '(unnamed)'
        await mongo.db.collection(table).updateOne(
          { id },
          {
            $setOnInsert: {
              id,
              name,
              name_lower: name.toLowerCase(),
              biography: row.biography != null ? String(row.biography) : null,
              description: row.description != null ? String(row.description) : null,
              address: row.address != null ? String(row.address) : null,
              website: row.website != null ? String(row.website) : null,
              is_archived: booleanValue(row.is_archived),
              created_at: String(row.created_at ?? new Date().toISOString())
            }
          },
          { upsert: true }
        )
        counts[table] += 1
      }
      if (maxId > 0) await mongo.setSeqIfGreater(table, maxId)
    }

    if (hasTable('books')) {
      const rows = load<Record<string, unknown>>('books')
      counts.books = 0
      let maxId = 0
      for (const row of rows) {
        const id = intOr(row.id, 0)
        if (id > maxId) maxId = id
        const copies = clampCopies(Number(row.total_copies), Number(row.available_copies))
        let isbn = row.isbn != null ? String(row.isbn).trim() : ''
        if (isbn) {
          const existingId = seenIsbn.get(isbn.toLowerCase())
          if (existingId !== undefined) {
            warnings.push(`Duplicate ISBN "${isbn}" on book ${String(row.title ?? '')} left blank`)
            isbn = ''
          } else {
            seenIsbn.set(isbn.toLowerCase(), id)
          }
        }
        await mongo.db.collection('books').updateOne(
          { id },
          {
            $setOnInsert: {
              id,
              title: String(row.title ?? ''),
              isbn: isbn || null,
              isbn_lower: isbn ? isbn.toLowerCase() : null,
              author_id: row.author_id != null ? intOr(row.author_id, 0) : null,
              category_id: row.category_id != null ? intOr(row.category_id, 0) : null,
              publisher_id: row.publisher_id != null ? intOr(row.publisher_id, 0) : null,
              publication_year: row.publication_year != null ? intOr(row.publication_year, 0) : null,
              edition: row.edition != null ? String(row.edition) : null,
              subject: row.subject != null ? String(row.subject) : null,
              description: row.description != null ? String(row.description) : null,
              call_number: row.call_number != null ? String(row.call_number) : null,
              shelf_location: row.shelf_location != null ? String(row.shelf_location) : null,
              total_copies: copies.total,
              available_copies: copies.available,
              cover_image: row.cover_image != null ? String(row.cover_image) : null,
              is_archived: booleanValue(row.is_archived),
              created_at: String(row.created_at ?? new Date().toISOString()),
              updated_at: String(row.updated_at ?? new Date().toISOString())
            }
          },
          { upsert: true }
        )
        counts.books += 1
      }
      if (maxId > 0) await mongo.setSeqIfGreater('books', maxId)
    }

    if (hasTable('admin_users')) {
      const rows = load<Record<string, unknown>>('admin_users')
      counts.admin_users = 0
      let maxId = 0
      for (const row of rows) {
        const id = intOr(row.id, 0)
        if (id > maxId) maxId = id
        const username = String(row.username ?? '').trim()
        await mongo.db.collection('admin_users').updateOne(
          { id },
          {
            $setOnInsert: {
              id,
              username,
              username_lower: username.toLowerCase(),
              password_hash: String(row.password_hash ?? ''),
              full_name: row.full_name != null ? String(row.full_name) : null,
              created_at: String(row.created_at ?? new Date().toISOString()),
              updated_at: String(row.updated_at ?? new Date().toISOString())
            }
          },
          { upsert: true }
        )
        counts.admin_users += 1
      }
      if (maxId > 0) await mongo.setSeqIfGreater('admin_users', maxId)
    }

    if (hasTable('borrowings')) {
      const rows = load<Record<string, unknown>>('borrowings')
      counts.borrowings = 0
      let maxId = 0
      for (const row of rows) {
        const id = intOr(row.id, 0)
        if (id > maxId) maxId = id
        const status = String(row.status ?? 'borrowed')
        const safeStatus = status === 'returned' ? 'returned' : 'borrowed'
        await mongo.db.collection('borrowings').updateOne(
          { id },
          {
            $setOnInsert: {
              id,
              book_id: intOr(row.book_id, 0),
              borrower_name: String(row.borrower_name ?? ''),
              borrower_id: row.borrower_id != null ? String(row.borrower_id) : null,
              borrowed_at: String(row.borrowed_at ?? new Date().toISOString()),
              due_date: row.due_date != null ? String(row.due_date).slice(0, 10) : null,
              returned_at: row.returned_at != null ? String(row.returned_at) : null,
              status: safeStatus
            }
          },
          { upsert: true }
        )
        counts.borrowings += 1
      }
      if (maxId > 0) await mongo.setSeqIfGreater('borrowings', maxId)
    }

    if (hasTable('settings')) {
      const rows = load<{ key?: string; value?: unknown }>('settings')
      counts.settings = 0
      for (const row of rows) {
        if (!row.key || String(row.key).startsWith('legacy_')) continue
        await opts.repo.settings.set(String(row.key), row.value != null ? String(row.value) : null)
        counts.settings += 1
      }
    }

    await opts.repo.settings.set(LEGACY_MIGRATED_KEY, '1')

    const legacyImagesDir = join(orgImagesDir(sqlitePath))
    if (existsSync(legacyImagesDir)) {
      mkdirSync(imagesDir, { recursive: true })
      for (const filename of readdirSync(legacyImagesDir)) {
        try {
          const source = resolveImagePath(legacyImagesDir, filename)
          const dest = resolveImagePath(imagesDir, filename)
          copyFileSync(source, dest)
          const buf = readFileSync(source)
          await opts.repo.images.save(filename, 'image/jpeg', buf)
        } catch {
          // skip unreadable cover
        }
      }
    }

    for (const [table, count] of Object.entries(counts)) {
      logger.info('legacy migration', { table, count })
    }
    return { migrated: true, counts, warnings }
  } finally {
    sqlite.close()
  }
}

function orgImagesDir(dbPath: string): string {
  return join(dbPath, '..', '..', 'book-images')
}
