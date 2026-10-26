import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Plus, Pencil, ArchiveRestore, BookOpen, X, ArrowUpDown, FileSpreadsheet, Trash2 } from 'lucide-react'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Pagination from '../../components/ui/Pagination'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import ImportBooksModal from '../../components/ImportBooksModal'
import BookModal from '../../components/BookModal'
import GitHubConfirmModal from '../../components/ui/GitHubConfirmModal'
import BookCover from '../../components/BookCover'
import type { AuthorListItem, Book, BookFilters, CategoryListItem } from '@shared/types'
import { errorMessage } from '../../lib/utils'

const PAGE_SIZES = [10, 25, 50]

export default function Books() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [availability, setAvailability] = useState<BookFilters['availability']>('all')
  const [includeArchived, setIncludeArchived] = useState(false)

  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [books, setBooks] = useState<Book[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<CategoryListItem[]>([])
  const [authors, setAuthors] = useState<AuthorListItem[]>([])

  const [target, setTarget] = useState<Book | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [bookModalOpen, setBookModalOpen] = useState(false)
  const [editingBookId, setEditingBookId] = useState<number | null>(null)

  const openNewBook = () => {
    setEditingBookId(null)
    setBookModalOpen(true)
  }

  const openEditBook = (id: number) => {
    setEditingBookId(id)
    setBookModalOpen(true)
  }

  useEffect(() => {
    if (searchParams.get('new') === 'true' || searchParams.get('add') === '1') {
      openNewBook()
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      next.delete('add')
      setSearchParams(next, { replace: true })
    } else if (searchParams.get('edit')) {
      const editId = Number(searchParams.get('edit'))
      if (!Number.isNaN(editId) && editId > 0) {
        openEditBook(editId)
      }
      const next = new URLSearchParams(searchParams)
      next.delete('edit')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    void window.api.categories.list().then(setCategories).catch(() => undefined)
    void window.api.authors.list().then(setAuthors).catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const filters: BookFilters = {
      search: search || null,
      category_id: categoryId ? Number(categoryId) : null,
      author_id: authorId ? Number(authorId) : null,
      availability,
      includeArchived: includeArchived || undefined,
      sort: 'recent',
      page,
      pageSize: PAGE_SIZES[0]
    }
    try {
      const res = await window.api.books.list(filters)
      setBooks(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [search, categoryId, authorId, availability, includeArchived, page])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const handleArchive = async () => {
    if (!target) return
    try {
      if (target.is_archived) {
        await window.api.books.restore(target.id)
      } else {
        await window.api.books.archive(target.id)
      }
      setTarget(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const handleDeleteBook = async () => {
    if (!deleteTarget) return
    try {
      if (typeof window.api?.books?.delete !== 'function') {
        throw new Error('Please restart the application to apply the book deletion update.')
      }
      await window.api.books.delete(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All Books</h1>
          <p className="text-sm text-muted">
            {total} book{total === 1 ? '' : 's'} in the catalog
            {includeArchived ? ' (incl. archived)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="ring-focus inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-card transition-all hover:bg-slate-50 active:scale-95"
          >
            <FileSpreadsheet className="h-4 w-4 text-primary-700" />
            <span>Import</span>
          </button>
          <button
            onClick={openNewBook}
            className="ring-focus inline-flex items-center gap-2 rounded-xl bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition-all hover:bg-primary-800 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Add Book</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-surface p-4 shadow-card">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search title, author, ISBN…"
            className="ring-focus w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-10 pr-9 text-sm text-foreground shadow-xs placeholder:text-muted focus:border-primary-600 focus:ring-4 focus:ring-primary-500/10"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('')
                setPage(1)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted hover:bg-slate-100 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }} className="w-44 text-xs" aria-label="Filter by category">
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={authorId} onChange={(e) => { setAuthorId(e.target.value); setPage(1) }} className="w-44 text-xs" aria-label="Filter by author">
          <option value="">All Authors</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select value={availability} onChange={(e) => { setAvailability(e.target.value as BookFilters['availability']); setPage(1) }} className="w-40 text-xs" aria-label="Filter by availability">
          <option value="all">All Availability</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </Select>
        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked)
              setPage(1)
            }}
            className="ring-focus h-4 w-4 rounded border-slate-300 text-primary-900"
          />
          Include archived
        </label>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner label="Loading books…" full />
      ) : books.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No books found"
          description="Adjust the filters, or add a new book to the catalog."
          actionLabel="Add your first book"
          onAction={openNewBook}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Title</th>
                  <th className="hidden px-5 py-3.5 font-semibold md:table-cell">Author</th>
                  <th className="hidden px-5 py-3.5 font-semibold lg:table-cell">Category</th>
                  <th className="px-5 py-3.5 font-semibold">Copies</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold">
                    <span className="inline-flex items-center gap-1"><ArrowUpDown className="h-3 w-3" /> Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {books.map((book) => (
                  <tr key={book.id} className={`transition-colors hover:bg-slate-50/70 ${book.is_archived ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <BookCover filename={book.cover_image} title={book.title} sizes="sm" className="shrink-0 rounded-lg shadow-xs ring-1 ring-slate-900/5" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{book.title}</p>
                          {book.isbn && <p className="font-mono text-xs text-muted">ISBN: {book.isbn}</p>}
                          {book.is_archived && <Badge tone="muted" className="mt-1">Archived</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-5 py-3.5 text-slate-600 md:table-cell">
                      {book.author_name ?? '—'}
                    </td>
                    <td className="hidden px-5 py-3.5 text-slate-600 lg:table-cell">{book.category_name ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-foreground">{book.available_copies}</span>
                      <span className="text-muted"> / {book.total_copies}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {book.available ? (
                        <Badge tone="success">Available</Badge>
                      ) : (
                        <Badge tone="danger">Unavailable</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEditBook(book.id)}
                          className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-700"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setTarget(book)}
                          className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600"
                          title={book.is_archived ? 'Restore' : 'Archive'}
                        >
                          <ArchiveRestore className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(book)}
                          className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Delete book permanently"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZES[0]}
            onPageChange={setPage}
          />
        </>
      )}

      <ConfirmDialog
        open={!!target}
        title={target?.is_archived ? 'Restore book' : 'Archive book'}
        message={
          target?.is_archived
            ? `"${target?.title}" will be restored to the catalog.`
            : `"${target?.title}" will be archived and hidden from the public catalog. It can be restored anytime.`
        }
        confirmLabel={target?.is_archived ? 'Restore' : 'Archive'}
        danger={!target?.is_archived}
        onConfirm={handleArchive}
        onCancel={() => setTarget(null)}
      />

      <ImportBooksModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void load()}
      />

      <BookModal
        open={bookModalOpen}
        bookId={editingBookId}
        onClose={() => {
          setBookModalOpen(false)
          setEditingBookId(null)
        }}
        onSuccess={() => void load()}
      />

      <GitHubConfirmModal
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"`}
        description={`This will permanently remove "${deleteTarget?.title}" and its borrowing records from your database. This action cannot be undone.`}
        matchText={deleteTarget?.title ?? ''}
        confirmButtonText="I understand the consequences, delete this book"
        onConfirm={handleDeleteBook}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}