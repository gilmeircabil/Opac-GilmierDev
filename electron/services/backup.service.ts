import { dialog } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { MongoDb } from '../database/mongo/client'
import { toIso } from '../database/mongo/repositories/utils'
import { logger } from '../utils/logger'
import type { BackupFile, BackupRestoreResult } from '@shared/types'
import { resolveImagePath } from '../config/paths'

const BACKUP_TABLES = [
  'authors',
  'categories',
  'publishers',
  'books',
  'admin_users',
  'borrowings',
  'settings',
  'schema_migrations'
] as const

const ALLOWED_COLUMNS: Record<(typeof BACKUP_TABLES)[number], Set<string>> = {
  authors: new Set(['id', 'name', 'name_lower', 'biography', 'is_archived', 'created_at']),
  categories: new Set(['id', 'name', 'name_lower', 'description', 'is_archived', 'created_at']),
  publishers: new Set(['id', 'name', 'name_lower', 'address', 'website', 'is_archived', 'created_at']),
  books: new Set([
    'id',
    'title',
    'isbn',
    'isbn_lower',
    'author_id',
    'category_id',
    'publisher_id',
    'publication_year',
    'edition',
    'subject',
    'description',
    'call_number',
    'shelf_location',
    'total_copies',
    'available_copies',
    'cover_image',
    'is_archived',
    'created_at',
    'updated_at'
  ]),
  admin_users: new Set(['id', 'username', 'username_lower', 'password_hash', 'full_name', 'created_at', 'updated_at']),
  borrowings: new Set(['id', 'book_id', 'borrower_name', 'borrower_id', 'borrowed_at', 'due_date', 'returned_at', 'status']),
  settings: new Set(['key', 'value']),
  schema_migrations: new Set(['version', 'name', 'applied_at'])
}

const BACKUP_SUFFIX = '.opacbk'
const FORMAT = 'opac-library-backup'
const FORMAT_VERSION = 1

export interface BackupServiceDeps {
  mongo: MongoDb
  imagesDir: string
  backupsDir: string
  getSchemaVersion: () => Promise<number>
  getLibraryName: () => Promise<string>
  afterRestore?: () => void
}

export interface BackupService {
  create(): Promise<BackupFile>
  list(): Promise<BackupFile[]>
  restore(filename: string): Promise<void>
  pickAndRestore(): Promise<BackupRestoreResult>
}

function safeBasename(name: string): string {
  const safe = name.replaceAll('\\', '/').split('/').pop() ?? ''
  if (!safe || /\.\./.test(safe) || /[:*?"<>|]/.test(safe)) {
    throw new Error('Invalid backup name')
  }
  return safe
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function folderSize(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isFile()) total += st.size
  }
  return total
}

export function backupService(deps: BackupServiceDeps): BackupService {
  async function dumpData(): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {}
    for (const table of BACKUP_TABLES) {
      const allowed = ALLOWED_COLUMNS[table]
      const rows = await deps.mongo.db
        .collection<Record<string, unknown>>(table)
        .find({}, { projection: { _id: 0 } })
        .toArray()
      out[table] = rows.map((row) => {
        const clean: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(row)) {
          if (key === '_id' || key.endsWith('_lower')) continue
          if (!allowed.has(key)) continue
          clean[key] = value instanceof Date ? value.toISOString() : value
        }
        return clean
      })
    }
    const imageDocs = await deps.mongo.db
      .collection<Record<string, unknown>>('images')
      .find({}, { projection: { _id: 0 } })
      .toArray()
    out.images = imageDocs
    return out
  }

  async function createBackupFolder(): Promise<BackupFile> {
    mkdirSync(deps.backupsDir, { recursive: true })
    const createdAt = new Date().toISOString()
    const folderName = `opac-backup-${stamp()}${BACKUP_SUFFIX}`
    const folder = join(deps.backupsDir, folderName)
    mkdirSync(folder, { recursive: true })
    const coversDir = join(folder, 'covers')
    mkdirSync(coversDir, { recursive: true })

    const [data, schemaVersion, libraryName] = await Promise.all([
      dumpData(),
      deps.getSchemaVersion(),
      deps.getLibraryName()
    ])

    const coverFiles = new Set<string>()
    for (const book of data.books as Array<{ cover_image?: string | null }>) {
      if (book.cover_image) coverFiles.add(book.cover_image)
    }
    for (const filename of coverFiles) {
      try {
        const source = resolveImagePath(deps.imagesDir, filename)
        if (existsSync(source)) {
          copyFileSync(source, join(coversDir, filename))
        }
      } catch {
        // skip unreadable cover
      }
    }

    writeFileSync(
      join(folder, 'manifest.json'),
      JSON.stringify(
        {
          format: FORMAT,
          formatVersion: FORMAT_VERSION,
          createdAt,
          schemaVersion,
          libraryName,
          appVersion: process.env.npm_package_version ?? '1.0.0'
        },
        null,
        2
      ),
      'utf8'
    )
    writeFileSync(join(folder, 'data.json'), JSON.stringify(data), 'utf8')

    logger.info('backup created', { folder: folderName, size: folderSize(folder) })
    return {
      filename: folderName,
      path: folder,
      size: folderSize(folder),
      createdAt
    }
  }

  function readBackup(
    folder: string,
    currentSchemaVersion: number
  ): {
    manifest: { format: string; formatVersion: number; schemaVersion: number }
    data: Record<string, unknown[]>
  } {
    const manifestFile = join(folder, 'manifest.json')
    const dataFile = join(folder, 'data.json')
    if (!existsSync(manifestFile) || !existsSync(dataFile)) {
      throw new Error('The selected backup is missing required files')
    }
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      format: string
      formatVersion: number
      schemaVersion: number
    }
    if (manifest.format !== FORMAT || manifest.formatVersion !== FORMAT_VERSION) {
      throw new Error('This backup was created by an incompatible version')
    }
    if (typeof manifest.schemaVersion === 'number' && manifest.schemaVersion > currentSchemaVersion) {
      throw new Error(
        `This backup uses an unsupported schema version (${manifest.schemaVersion}) and cannot be restored safely`
      )
    }
    const data = JSON.parse(readFileSync(dataFile, 'utf8')) as Record<string, unknown[]>
    for (const table of BACKUP_TABLES) {
      if (!Array.isArray(data[table])) {
        throw new Error(`The backup is missing table data: ${table}`)
      }
    }
    return { manifest, data }
  }

  function validateRows(
    table: (typeof BACKUP_TABLES)[number],
    rows: Array<Record<string, unknown>>
  ): void {
    const allowed = ALLOWED_COLUMNS[table]
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        if (!allowed.has(column)) {
          throw new Error(`The backup contains an unknown column "${column}" in table "${table}"`)
        }
        if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          throw new Error(`The backup contains an invalid value for "${table}.${column}"`)
        }
      }
    }
  }

  async function applyRestore(folder: string): Promise<void> {
    const currentSchemaVersion = await deps.getSchemaVersion()
    const { data } = readBackup(folder, currentSchemaVersion)

    for (const table of BACKUP_TABLES) {
      const rows = data[table] as Array<Record<string, unknown>>
      if (!rows.length) continue
      validateRows(table, rows)
    }

    for (const table of BACKUP_TABLES) {
      await deps.mongo.db.collection(table).deleteMany({})
    }

    for (const table of BACKUP_TABLES) {
      const rows = data[table] as Array<Record<string, unknown>>
      if (!rows.length) continue
      let maxId = 0
      const docs = rows.map((raw) => {
        const doc: Record<string, unknown> = { ...raw }
        if (typeof doc.id === 'number' && doc.id > maxId) {
          maxId = doc.id
        }
        if ((table === 'authors' || table === 'categories' || table === 'publishers') && typeof doc.name === 'string') {
          doc.name_lower = doc.name.toLowerCase()
        }
        if (table === 'books' && typeof doc.isbn === 'string' && doc.isbn.trim()) {
          doc.isbn_lower = doc.isbn.trim().toLowerCase()
        }
        if (table === 'admin_users' && typeof doc.username === 'string') {
          doc.username_lower = doc.username.toLowerCase()
        }
        return doc
      })
      await deps.mongo.db.collection(table).insertMany(docs)
      if (maxId > 0) {
        await deps.mongo.setSeqIfGreater(table, maxId)
      }
    }

    if (Array.isArray(data.images) && data.images.length > 0) {
      await deps.mongo.db.collection('images').deleteMany({})
      await deps.mongo.db.collection('images').insertMany(data.images as Array<Record<string, unknown>>)
    }

    const coversDir = join(folder, 'covers')
    if (existsSync(coversDir)) {
      mkdirSync(deps.imagesDir, { recursive: true })
      for (const filename of readdirSync(coversDir)) {
        try {
          const source = join(coversDir, filename)
          const dest = resolveImagePath(deps.imagesDir, filename)
          copyFileSync(source, dest)
        } catch {
          // skip unreadable cover
        }
      }
    }
  }

  return {
    async create(): Promise<BackupFile> {
      return createBackupFolder()
    },
    async list(): Promise<BackupFile[]> {
      if (!existsSync(deps.backupsDir)) return []
      const entries = readdirSync(deps.backupsDir)
        .map((name) => {
          const full = join(deps.backupsDir, name)
          const stat = statSync(full)
          return { name, full, isDir: stat.isDirectory(), stat }
        })
        .filter((e) => e.isDir && e.name.endsWith(BACKUP_SUFFIX))
        .map((e) => {
          let createdAt: string
          try {
            const manifest = JSON.parse(readFileSync(join(e.full, 'manifest.json'), 'utf8')) as {
              createdAt?: string
            }
            createdAt = manifest.createdAt ?? toIso(e.stat.mtime)
          } catch {
            createdAt = toIso(e.stat.mtime)
          }
          const size = folderSize(e.full)
          return {
            filename: e.name,
            path: e.full,
            size,
            createdAt
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return entries
    },
    async restore(filename: string): Promise<void> {
      const safe = safeBasename(filename)
      if (!safe.endsWith(BACKUP_SUFFIX)) throw new Error('Invalid backup file')
      const source = join(deps.backupsDir, safe)
      if (!existsSync(source)) throw new Error('Backup not found')

      mkdirSync(deps.backupsDir, { recursive: true })
      const pre = `pre-restore-${Date.now()}${BACKUP_SUFFIX}`
      mkdirSync(join(deps.backupsDir, pre), { recursive: true })
      const snapshot = await dumpData()
      writeFileSync(join(deps.backupsDir, pre, 'data.json'), JSON.stringify(snapshot), 'utf8')
      writeFileSync(
        join(deps.backupsDir, pre, 'manifest.json'),
        JSON.stringify({ format: FORMAT, formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString() }),
        'utf8'
      )

      await applyRestore(source)
      logger.info('database restored from backup', { source: safe })
      deps.afterRestore?.()
    },
    async pickAndRestore(): Promise<BackupRestoreResult> {
      const result = await dialog.showOpenDialog({
        title: 'Select Backup Folder to Restore',
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { restored: false }
      }
      const picked = result.filePaths[0]
      try {
        const currentSchemaVersion = await deps.getSchemaVersion()
        readBackup(picked, currentSchemaVersion)
      } catch (err) {
        return { restored: false, message: err instanceof Error ? err.message : 'Invalid backup' }
      }
      try {
        await applyRestore(picked)
      } catch (err) {
        logger.error('restore failed', err)
        return { restored: false, message: 'Restore failed. The database was not changed.' }
      }
      logger.info('database restored from picked folder', { source: picked })
      deps.afterRestore?.()
      return { restored: true }
    }
  }
}
