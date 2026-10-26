import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Repeat, Plus, Search, Undo2, CalendarDays, Hash } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'
import Badge from '../../components/ui/Badge'
import BookCover from '../../components/BookCover'
import type { Book, Borrowing, BorrowingFilter, BorrowingFilters } from '@shared/types'
import { errorMessage, formatPlainDate, todayDateInput, addDays } from '../../lib/utils'

const PAGE_SIZES = [10, 25, 50]

export default function Borrowings() {
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status') ?? 'all'
  const status: BorrowingFilter = (['all', 'borrowed', 'returned', 'overdue'] as BorrowingFilter[]).includes(
    statusParam as BorrowingFilter
  )
    ? (statusParam as BorrowingFilter)
    : 'all'

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Borrowing[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [books, setBooks] = useState<Book[]>([])
  const [bookId, setBookId] = useState('')
  const [borrowerName, setBorrowerName] = useState('')
  const [borrowerId, setBorrowerId] = useState('')
  const [borrowedAt, setBorrowedAt] = useState(todayDateInput())
  const [dueDate, setDueDate] = useState(addDays(todayDateInput(), 14))

  const [returnTarget, setReturnTarget] = useState<Borrowing | null>(null)
  const [returning, setReturning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const filters: BorrowingFilters = {
      status,
      search: search || null,
      page,
      pageSize: PAGE_SIZES[0]
    }
    try {
      const res = await window.api.borrowings.list(filters)
      setItems(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [status, search, page])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const handleOpen = async () => {
    setOpen(true)
    setError(null)
    setBookId('')
    setBorrowerName('')
    setBorrowerId('')
    setBorrowedAt(todayDateInput())
    setDueDate(addDays(todayDateInput(), 14))
    try {
      const res = await window.api.books.list({
        availability: 'available',
        page: 1,
        pageSize: 200,
        sort: 'title_asc'
      })
      setBooks(res.items)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bookId || !borrowerName.trim()) {
      setError('Please select a book and enter a borrower name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.api.borrowings.create({
        book_id: Number(bookId),
        borrower_name: borrowerName.trim(),
        borrower_id: borrowerId.trim() || null,
        borrowed_at: borrowedAt,
        due_date: dueDate || null
      })
      setOpen(false)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const setStatus = (next: BorrowingFilter) => {
    const p = new URLSearchParams(params)
    if (next === 'all') p.delete('status')
    else p.set('status', next)
    p.delete('page')
    setParams(p, { replace: true })
  }

  const handleReturn = async () => {
    if (!returnTarget) return
    setReturning(true)
    try {
      await window.api.borrowings.return(returnTarget.id)
      setReturnTarget(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setReturning(false)
    }
  }

  const tabs: { key: BorrowingFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'borrowed', label: 'Borrowed' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'returned', label: 'Returned' }
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Borrowings</h1>
          <p className="text-sm text-muted">Track who has borrowed which books</p>
        </div>
        <Button onClick={handleOpen} icon={<Plus className="h-4 w-4" />}>New Borrowing</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-slate-200/80 bg-surface p-1 shadow-card">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`ring-focus rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                status === t.key
                  ? 'bg-primary-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search borrower or book…"
            className="ring-focus w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground shadow-xs placeholder:text-muted focus:border-primary-600 focus:ring-4 focus:ring-primary-500/10"
          />
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner label="Loading borrowings…" full />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No borrowings found"
          description={
            search || status !== 'all'
              ? 'Try changing the filter or search term.'
              : 'Record a borrowing when a visitor takes a book home.'
          }
          actionLabel={!(search || status !== 'all') ? 'New Borrowing' : undefined}
          onAction={handleOpen}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Book</th>
                  <th className="px-5 py-3.5 font-semibold">Borrower</th>
                  <th className="hidden px-5 py-3.5 font-semibold md:table-cell">Borrowed</th>
                  <th className="hidden px-5 py-3.5 font-semibold md:table-cell">Due</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((b) => (
                  <tr
                    key={b.id}
                    className={`transition-colors hover:bg-slate-50/70 ${
                      b.status === 'overdue' ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <BookCover
                          filename={b.book_cover}
                          title={b.book_title ?? 'Book'}
                          sizes="sm"
                          className="shrink-0 rounded-lg shadow-xs ring-1 ring-slate-900/5"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{b.book_title ?? 'Unknown book'}</p>
                          {b.book_call_number && (
                            <p className="flex items-center gap-1 font-mono text-xs text-muted">
                              <Hash className="h-3 w-3" /> {b.book_call_number}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-foreground">{b.borrower_name}</p>
                      {b.borrower_id && <p className="font-mono text-xs text-muted">ID: {b.borrower_id}</p>}
                    </td>
                    <td className="hidden px-5 py-3.5 text-slate-600 md:table-cell">{formatPlainDate(b.borrowed_at)}</td>
                    <td className="hidden px-5 py-3.5 text-slate-600 md:table-cell">{b.due_date ? formatPlainDate(b.due_date) : '—'}</td>
                    <td className="px-5 py-3.5">
                      {b.status === 'overdue' ? (
                        <Badge tone="danger">Overdue</Badge>
                      ) : b.status === 'borrowed' ? (
                        <Badge tone="warning">Borrowed</Badge>
                      ) : (
                        <Badge tone="success">Returned</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end">
                        {b.status === 'borrowed' || b.status === 'overdue' ? (
                          <button
                            onClick={() => setReturnTarget(b)}
                            className="ring-focus inline-flex items-center gap-1.5 rounded-xl bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-800 shadow-xs transition-colors hover:bg-primary-100 active:scale-95"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Mark returned
                          </button>
                        ) : (
                          <span className="text-xs text-muted">{b.returned_at ? formatPlainDate(b.returned_at) : '—'}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZES[0]} onPageChange={setPage} />
        </>
      )}

      {/* New borrowing */}
      <Modal open={open} onClose={() => setOpen(false)} title="New Borrowing" maxWidth="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <Select label="Book *" name="book_id" value={bookId} onChange={(e) => setBookId(e.target.value)} required>
            <option value="">Select an available book…</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} {b.author_name ? `— ${b.author_name}` : ''} ({b.available_copies} available)
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Borrower Name *" name="borrower_name" value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} required placeholder="Visitor's name" />
            <Input label="Borrower ID (optional)" name="borrower_id" value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)} placeholder="Library card / student ID" />
            <Input label="Borrowed Date" name="borrowed_at" type="date" value={borrowedAt} onChange={(e) => setBorrowedAt(e.target.value)} />
            <Input label="Due Date" name="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <CalendarDays className="h-3.5 w-3.5" />
            Default loan period is 14 days. Copies are returned to availability when marked returned.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{saving ? 'Saving…' : 'Record Borrowing'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!returnTarget}
        title="Mark as returned"
        message={
          returnTarget
            ? `Confirm that "${returnTarget.borrower_name}" has returned "${returnTarget.book_title}". The book will become available again.`
            : ''
        }
        confirmLabel="Mark Returned"
        loading={returning}
        onConfirm={handleReturn}
        onCancel={() => setReturnTarget(null)}
      />
    </div>
  )
}