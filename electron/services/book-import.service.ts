import * as XLSX from 'xlsx'
import type { MongoRepositories as Repositories } from '../database/mongo/repositories'
import type {
  ImportColumnMap,
  ImportOptions,
  ImportRunResult,
  ImportSheetPreview,
  ImportTaskInput
} from '@shared/types'

const PREVIEW_ROWS = 50
const MAX_CELL_LENGTH = 2000

export interface BookImportService {
  parse(input: Omit<ImportTaskInput, 'columnMap' | 'options'>): Promise<ImportSheetPreview>
  run(input: ImportTaskInput): Promise<ImportRunResult>
}

interface ParsedSheet {
  headers: string[]
  rows: string[][]
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US')
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value).replace(/\u00a0/g, ' ').trim()
  return s.slice(0, MAX_CELL_LENGTH)
}

function asStringRow(row: unknown[]): string[] {
  return row.map(cell)
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof data === 'string') return Buffer.from(data, 'base64')
  if (
    data &&
    typeof data === 'object' &&
    'type' in data &&
    (data as unknown as { type: string }).type === 'Buffer' &&
    Array.isArray((data as unknown as { data: number[] }).data)
  ) {
    return new Uint8Array((data as unknown as { data: number[] }).data)
  }
  if (Array.isArray(data)) return new Uint8Array(data)
  throw new Error('Invalid file data format')
}

function parseWorkbook(rawData: unknown, fileName: string): XLSX.WorkBook {
  const bytes = toUint8Array(rawData)
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
    return XLSX.read(text, { type: 'string' })
  }
  return XLSX.read(bytes, { type: 'buffer' })
}

function toRowArrays(ws: XLSX.WorkSheet): string[][] {
  const arrays = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: ''
  })
  return arrays.map(asStringRow)
}

function splitRows(rawRows: string[][]): ParsedSheet {
  let headerIndex = -1
  for (let i = 0; i < rawRows.length; i++) {
    if (rawRows[i].some((v) => v.length > 0)) {
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) {
    return { headers: [], rows: [] }
  }

  const headerRow = rawRows[headerIndex]
  const lastHeader = headerRow.reduce((last, v, idx) => (v.length > 0 ? idx : last), -1)
  const headers = headerRow
    .slice(0, lastHeader + 1)
    .map((h) => h.replace(/\s+/g, ' ').trim())
  if (headers.some((h) => h.length === 0)) {
    headers[headers.findIndex((h) => h.length === 0)] = '(blank)'
  }

  const rows: string[][] = []
  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const trimmed = headers.map((_, idx) => row[idx] ?? '')
    if (trimmed.some((v) => v.length > 0)) {
      rows.push(trimmed)
    }
  }
  return { headers, rows }
}

function sheetAndData(input: Omit<ImportTaskInput, 'columnMap' | 'options'>): ParsedSheet {
  if (!input?.data) throw new Error('No file data provided')
  if (typeof input.fileName !== 'string' || !input.fileName) throw new Error('No file name provided')
  const wb = parseWorkbook(input.data, input.fileName)
  const sheetName =
    typeof input.sheetName === 'string' && wb.SheetNames.includes(input.sheetName)
      ? input.sheetName
      : wb.SheetNames[0]
  if (!sheetName) throw new Error('The file appears to be empty')
  return splitRows(toRowArrays(wb.Sheets[sheetName]))
}

function valueAt(row: string[], headers: string[], header: string | null): string {
  if (!header) return ''
  const index = headers.indexOf(header)
  if (index === -1) return ''
  return row[index] ?? ''
}

export function bookImportService(repo: Repositories): BookImportService {
  async function loadReferenceLists(): Promise<{
    isbns: Set<string>
    authorIds: Map<string, number>
    categoryIds: Map<string, number>
    publisherIds: Map<string, number>
  }> {
    const [authors, categories, publishers, allBooks] = await Promise.all([
      repo.authors.list(true),
      repo.categories.list(true),
      repo.publishers.list(true),
      repo.books.getBookRows({ includeArchived: true })
    ])
    const isbns = new Set(
      allBooks
        .map((r) => (r.isbn ?? '').normalize('NFKC').toLocaleLowerCase('en-US').trim())
        .filter((s) => s.length > 0)
    )
    return {
      isbns,
      authorIds: new Map(authors.map((a) => [normalize(a.name), a.id])),
      categoryIds: new Map(categories.map((c) => [normalize(c.name), c.id])),
      publisherIds: new Map(publishers.map((p) => [normalize(p.name), p.id]))
    }
  }

  return {
    async parse(input): Promise<ImportSheetPreview> {
      const parsed = sheetAndData(input)
      return {
        fileName: input.fileName,
        sheetName: typeof input.sheetName === 'string' ? input.sheetName : '',
        headers: parsed.headers,
        rows: parsed.rows.slice(0, PREVIEW_ROWS),
        totalRows: parsed.rows.length
      }
    },

    async run(input): Promise<ImportRunResult> {
      const map: ImportColumnMap = input.columnMap ?? {}
      const options: ImportOptions = input.options ?? {
        createAuthors: true,
        createCategories: true,
        createPublishers: true,
        skipDuplicates: true
      }
      if (!map.title) throw new Error('Map the Title column before importing')

      const parsed = sheetAndData(input)
      const { headers } = parsed
      const titleIndex = headers.indexOf(map.title)
      if (titleIndex === -1) throw new Error('The mapped Title column was not found in the file')

      const refs = await loadReferenceLists()
      const baselineAuthors = refs.authorIds.size
      const baselineCategories = refs.categoryIds.size
      const baselinePublishers = refs.publisherIds.size
      const seenInImport = new Set<string>()
      const result: ImportRunResult = {
        totalRows: parsed.rows.length,
        imported: 0,
        skippedDuplicates: 0,
        createdAuthors: 0,
        createdCategories: 0,
        createdPublishers: 0,
        errors: []
      }

      const resolveNamed = async (
        table: 'authors' | 'categories' | 'publishers',
        name: string,
        ids: Map<string, number>,
        shouldCreate: boolean
      ): Promise<number | null> => {
        const key = normalize(name)
        if (ids.has(key)) return ids.get(key) ?? null
        if (!shouldCreate) return null
        try {
          const cleanName = name.slice(0, MAX_CELL_LENGTH)
          let created: { id: number }
          if (table === 'authors') {
            created = await repo.authors.create({ name: cleanName })
          } else if (table === 'categories') {
            created = await repo.categories.create({ name: cleanName })
          } else {
            created = await repo.publishers.create({ name: cleanName })
          }
          ids.set(key, created.id)
          return created.id
        } catch {
          return null
        }
      }

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i]
        const lineNumber = i + 2
        const title = valueAt(row, headers, map.title)
        if (!title) {
          result.errors.push({ row: lineNumber, message: 'Missing title — row skipped' })
          continue
        }

        const isbn = valueAt(row, headers, map.isbn)
        const isbnKey = isbn.normalize('NFKC').toLocaleLowerCase('en-US').trim()
        const dupKey = `${normalize(title)}|${isbnKey}`
        if (
          options.skipDuplicates &&
          ((isbnKey && refs.isbns.has(isbnKey)) || seenInImport.has(dupKey))
        ) {
          result.skippedDuplicates += 1
          continue
        }

        let year: number | null = null
        const yearText = valueAt(row, headers, map.year)
        if (yearText) {
          const parsedYear = Number.parseInt(yearText.replace(/[^\d]/g, ''), 10)
          if (!Number.isInteger(parsedYear) || parsedYear < 0 || parsedYear > 9999) {
            result.errors.push({ row: lineNumber, title, message: `Invalid year "${yearText}"` })
            continue
          }
          year = parsedYear
        }

        let copies = 1
        const copiesText = valueAt(row, headers, map.copies)
        if (copiesText) {
          const parsedCopies = Number.parseInt(copiesText.replace(/[^\d]/g, ''), 10)
          if (!Number.isInteger(parsedCopies) || parsedCopies < 1) {
            result.errors.push({ row: lineNumber, title, message: `Copies must be a positive number (got "${copiesText}")` })
            continue
          }
          copies = parsedCopies
        }

        const authorName = valueAt(row, headers, map.author)
        const categoryName = valueAt(row, headers, map.category)
        const publisherName = valueAt(row, headers, map.publisher)
        const description = valueAt(row, headers, map.description)

        const authorId = authorName
          ? await resolveNamed('authors', authorName, refs.authorIds, options.createAuthors)
          : null
        const categoryId = categoryName
          ? await resolveNamed('categories', categoryName, refs.categoryIds, options.createCategories)
          : null
        const publisherId = publisherName
          ? await resolveNamed('publishers', publisherName, refs.publisherIds, options.createPublishers)
          : null

        try {
          await repo.books.create({
            title: title.slice(0, MAX_CELL_LENGTH),
            isbn: isbn.slice(0, MAX_CELL_LENGTH) || null,
            author_id: authorId,
            category_id: categoryId,
            publisher_id: publisherId,
            publication_year: year,
            description: description.slice(0, MAX_CELL_LENGTH) || null,
            total_copies: copies,
            available_copies: copies
          })
          seenInImport.add(dupKey)
          if (isbnKey) refs.isbns.add(isbnKey)
          result.imported += 1
        } catch (err) {
          result.errors.push({
            row: lineNumber,
            title,
            message: err instanceof Error ? err.message : 'Failed to insert book'
          })
        }
      }

      result.createdAuthors = refs.authorIds.size - baselineAuthors
      result.createdCategories = refs.categoryIds.size - baselineCategories
      result.createdPublishers = refs.publisherIds.size - baselinePublishers
      return result
    }
  }
}
