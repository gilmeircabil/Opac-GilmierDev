import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Select from './ui/Select'
import type {
  ImportColumnMap,
  ImportOptions,
  ImportRunResult,
  ImportSheetPreview
} from '@shared/types'
import { classNames, errorMessage } from '../lib/utils'

interface ImportBooksModalProps {
  open: boolean
  onClose: () => void
  onImported: () => void
}

const MAX_FILE_SIZE = 100 * 1024 * 1024

const FIELD_LABELS: { key: keyof RequireTitle; label: string; required?: boolean; hint: string }[] = [
  { key: 'title', label: 'Title', required: true, hint: 'Book title' },
  { key: 'author', label: 'Author', hint: 'Author name' },
  { key: 'category', label: 'Category', hint: 'Category name' },
  { key: 'publisher', label: 'Publisher', hint: 'Publisher name' },
  { key: 'isbn', label: 'ISBN', hint: 'ISBN number' },
  { key: 'year', label: 'Year', hint: 'Publication year' },
  { key: 'copies', label: 'Copies', hint: 'Number of copies' },
  { key: 'description', label: 'Description', hint: 'Book description' }
]

type RequireTitle = Pick<ImportColumnMap, 'title'> & Omit<ImportColumnMap, 'title'>

const AUTO_KEYWORDS: Record<keyof RequireTitle, string[]> = {
  title: ['title', 'judul', 'name'],
  author: ['author', 'pengarang', 'creator'],
  category: ['categor', 'subject', 'genre', 'kategori', 'type'],
  publisher: ['publisher', 'penerbit', 'imprint'],
  isbn: ['isbn'],
  year: ['year', 'tahun', 'yr'],
  copies: ['copies', 'cop', 'qty', 'quantity', 'stok', 'stock', 'count'],
  description: ['description', 'deskripsi', 'abstract', 'sinopsis']
}

function normalizeHeader(header: string): string {
  return header.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

function detectMapping(headers: string[]): ImportColumnMap {
  const normalized = headers.map(normalizeHeader)
  const map: ImportColumnMap = {
    title: null,
    author: null,
    category: null,
    publisher: null,
    isbn: null,
    year: null,
    copies: null,
    description: null
  }
  for (const field of Object.keys(AUTO_KEYWORDS) as (keyof RequireTitle)[]) {
    const keywords = AUTO_KEYWORDS[field]
    let matchedIndex = -1
    let bestScore = 0
    for (let i = 0; i < normalized.length; i++) {
      const header = normalized[i]
      if (!header) continue
      for (const keyword of keywords) {
        let score = 0
        if (header === keyword) score = 100
        else if (header.startsWith(keyword)) score = 60
        else if (header.includes(keyword)) score = 30
        if (score > bestScore) {
          bestScore = score
          matchedIndex = i
        }
      }
    }
    map[field] = matchedIndex >= 0 ? headers[matchedIndex] ?? null : null
  }
  return map
}

export default function ImportBooksModal({ open, onClose, onImported }: ImportBooksModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [data, setData] = useState<ArrayBuffer | null>(null)
  const [preview, setPreview] = useState<ImportSheetPreview | null>(null)
  const [columnMap, setColumnMap] = useState<ImportColumnMap | null>(null)
  const [options, setOptions] = useState<ImportOptions>(() => ({
    createAuthors: true,
    createCategories: true,
    createPublishers: true,
    skipDuplicates: true
  }))
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportRunResult | null>(null)

  const headers = preview?.headers ?? []

  const filledCount = useMemo(() => {
    if (!columnMap) return 0
    return Object.values(columnMap).filter((v) => typeof v === 'string' && v.length > 0).length
  }, [columnMap])

  const handlePickFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large (max 100 MB).')
      return
    }
    setParsing(true)
    setError(null)
    setResult(null)
    setPreview(null)
    setColumnMap(null)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = await window.api.books.importParse({ fileName: file.name, data: buffer })
      setFileName(file.name)
      setData(buffer)
      setPreview(parsed)
      setColumnMap(detectMapping(parsed.headers))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setParsing(false)
    }
  }

  const handleImport = async () => {
    if (!data || !columnMap || !preview) return
    setImporting(true)
    setError(null)
    try {
      const res = await window.api.books.importRun({
        fileName,
        data,
        columnMap,
        options
      })
      setResult(res)
      onImported()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const setField = (field: keyof RequireTitle, header: string) => {
    setColumnMap((prev) => (prev ? { ...prev, [field]: header || null } : prev))
  }

  return (
    <Modal open={open} onClose={onClose} title="Import books from file" maxWidth="lg">
      <div className="space-y-5">
        {/* Step 1: choose file */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => void handlePickFile(e.target.files?.[0])}
        />
        {!preview ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
            }}
            className="ring-focus flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-surface-2 px-6 py-10 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-800 to-primary-950 shadow-card">
              <FileSpreadsheet className="h-7 w-7 text-white" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {parsing ? 'Reading file…' : 'Choose an Excel or CSV file'}
              </p>
              <p className="mt-1 text-xs text-muted">.xlsx or .csv — every book is one row.</p>
            </div>
            <Button type="button" variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />}>
              {parsing ? 'Parsing…' : 'Browse files'}
            </Button>
          </div>
        ) : (
          <>
            {/* File info + change */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-surface-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{fileName}</p>
                  <p className="text-xs text-muted">
                    {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} · {headers.length} columns
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Change file
              </Button>
            </div>

            {/* Step 2: column mapping */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Column mapping</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {FIELD_LABELS.map(({ key, label, required, hint }) => (
                  <label key={key} className="block">
                    <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-foreground">
                      {label}
                      {required && <span className="text-red-500">*</span>}
                      <span className="font-normal text-muted">— {hint}</span>
                    </span>
                    <Select
                      value={columnMap?.[key] ?? ''}
                      onChange={(e) => setField(key, e.target.value)}
                      className="w-full"
                    >
                      <option value="">— Ignore —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {filledCount}/{FIELD_LABELS.length} columns mapped. Only <span className="font-semibold text-foreground">Title</span> is required.
              </p>
            </div>

            {/* Step 3: options */}
            <div className="rounded-xl border border-slate-200 bg-surface-2 p-4">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted">Import options</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ['createAuthors', 'Create missing authors'],
                    ['createCategories', 'Create missing categories'],
                    ['createPublishers', 'Create missing publishers'],
                    ['skipDuplicates', 'Skip duplicates (title + ISBN)']
                  ] as [keyof ImportOptions, string][]
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={options[key]}
                      onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                      className="ring-focus h-4 w-4 rounded border-slate-300 text-primary-900"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Step 4: preview */}
            {preview.rows.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Preview (first {preview.rows.length} rows)</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">#</th>
                        {headers.map((h) => (
                          <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.map((row, ri) => (
                        <tr key={ri}>
                          <td className="px-3 py-2 text-muted">{ri + 2}</td>
                          {headers.map((h) => {
                            const idx = headers.indexOf(h)
                            const isMapped = Object.values(columnMap ?? {}).includes(h)
                            return (
                              <td
                                key={h}
                                className={classNames(
                                   'max-w-[220px] truncate px-3 py-2',
                                  isMapped ? 'font-medium text-foreground' : 'text-muted'
                                )}
                                title={row[idx] ?? ''}
                              >
                                {row[idx] ?? ''}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</p>
            )}

            {result && (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  <div className="text-sm">
                    <p className="font-bold text-green-700">
                      {result.imported} book{result.imported === 1 ? '' : 's'} imported
                    </p>
                    <ul className="mt-1 list-inside space-y-0.5 text-green-700/90">
                      <li>{result.skippedDuplicates} duplicate{result.skippedDuplicates === 1 ? '' : 's'} skipped</li>
                      <li>{result.createdAuthors} author{result.createdAuthors === 1 ? '' : 's'}, {result.createdCategories} categor{result.createdCategories === 1 ? 'y' : 'ies'}, {result.createdPublishers} publisher{result.createdPublishers === 1 ? '' : 's'} created</li>
                    </ul>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-amber-700">
                      <AlertTriangle className="h-4 w-4" /> {result.errors.length} row{result.errors.length === 1 ? '' : 's'} skipped
                    </p>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-700/90 scrollbar-thin">
                      {result.errors.map((e, i) => (
                        <li key={i}>
                          Row {e.row} {e.title ? `· “${e.title}”` : ''}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button
                type="button"
                icon={<ArrowRight className="h-4 w-4" />}
                loading={importing}
                disabled={!columnMap?.title || importing}
                onClick={() => void handleImport()}
              >
                {importing ? 'Importing…' : 'Import books'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}