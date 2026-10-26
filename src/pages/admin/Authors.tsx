import { useCallback, useEffect, useState } from 'react'
import { Users, Plus, Pencil, Archive, ArchiveRestore, Search, BookOpen } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import type { AuthorListItem } from '@shared/types'
import { errorMessage } from '../../lib/utils'

export default function Authors() {
  const [authors, setAuthors] = useState<AuthorListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [biography, setBiography] = useState('')
  const [saving, setSaving] = useState(false)

  const [archiveTarget, setArchiveTarget] = useState<AuthorListItem | null>(null)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await window.api.authors.list()
      setAuthors(items)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setEditingId(null)
    setName('')
    setBiography('')
    setError(null)
    setOpen(true)
  }

  const openEdit = (a: AuthorListItem) => {
    setEditingId(a.id)
    setName(a.name)
    setBiography(a.biography ?? '')
    setError(null)
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await window.api.authors.update(editingId, { name: name.trim(), biography: biography.trim() || null })
      } else {
        await window.api.authors.create({ name: name.trim(), biography: biography.trim() || null })
      }
      setOpen(false)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async () => {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await window.api.authors.archive(archiveTarget.id)
      setArchiveTarget(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setArchiving(false)
    }
  }

  const filtered = authors.filter(
    (a) => !search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Authors</h1>
          <p className="text-sm text-muted">
            {authors.length} author{authors.length === 1 ? '' : 's'} in the library
          </p>
        </div>
        <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Add Author</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search authors…"
          className="ring-focus w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground shadow-xs placeholder:text-muted focus:border-primary-600 focus:ring-4 focus:ring-primary-500/10"
        />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner label="Loading authors…" full />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={authors.length === 0 ? 'No authors yet' : 'No matching authors'}
          description={
            authors.length === 0
              ? 'Authors help organize the books in your catalog.'
              : 'Try a different search term.'
          }
          actionLabel={authors.length === 0 ? 'Add your first author' : undefined}
          onAction={authors.length === 0 ? openNew : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((author) => (
            <div
              key={author.id}
              className={`flex flex-col rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted ${
                author.is_archived ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-foreground">{author.name}</h3>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                    <BookOpen className="h-3.5 w-3.5 text-primary-600" />
                    <span className="font-medium text-foreground">{author.book_count}</span> book{author.book_count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(author)}
                    className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-700"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setArchiveTarget(author)}
                    className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100"
                    title={author.is_archived ? 'Restore' : 'Archive'}
                  >
                    {author.is_archived ? (
                      <ArchiveRestore className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {author.biography && (
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">
                  {author.biography}
                </p>
              )}
              {author.is_archived && (
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Archived</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Edit Author' : 'Add Author'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <Input label="Name *" name="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Textarea label="Biography" name="biography" value={biography} onChange={(e) => setBiography(e.target.value)} rows={4} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{saving ? 'Saving…' : 'Save Author'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.is_archived ? 'Restore author' : 'Archive author'}
        message={
          archiveTarget?.is_archived
            ? `"${archiveTarget?.name}" will be restored and available for new books.`
            : `"${archiveTarget?.name}" will be archived. It stays attached to existing books but won't be offered for new ones.`
        }
        confirmLabel={archiveTarget?.is_archived ? 'Restore' : 'Archive'}
        danger={!archiveTarget?.is_archived}
        loading={archiving}
        onConfirm={handleArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  )
}