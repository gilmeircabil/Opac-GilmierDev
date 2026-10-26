import { useCallback, useEffect, useState } from 'react'
import { Tags, Plus, Pencil, Archive, ArchiveRestore, Search, BookOpen } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import type { CategoryListItem } from '@shared/types'
import { errorMessage } from '../../lib/utils'

export default function Categories() {
  const [items, setItems] = useState<CategoryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [archiveTarget, setArchiveTarget] = useState<CategoryListItem | null>(null)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await window.api.categories.list())
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
    setDescription('')
    setError(null)
    setOpen(true)
  }

  const openEdit = (c: CategoryListItem) => {
    setEditingId(c.id)
    setName(c.name)
    setDescription(c.description ?? '')
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
        await window.api.categories.update(editingId, { name: name.trim(), description: description.trim() || null })
      } else {
        await window.api.categories.create({ name: name.trim(), description: description.trim() || null })
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
      await window.api.categories.archive(archiveTarget.id)
      setArchiveTarget(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setArchiving(false)
    }
  }

  const filtered = items.filter(
    (c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categories</h1>
          <p className="text-sm text-muted">
            {items.length} categor{items.length === 1 ? 'y' : 'ies'} in the library
          </p>
        </div>
        <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Add Category</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories…"
          className="ring-focus w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground shadow-xs placeholder:text-muted focus:border-primary-600 focus:ring-4 focus:ring-primary-500/10"
        />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner label="Loading categories…" full />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={items.length === 0 ? 'No categories yet' : 'No matching categories'}
          description={
            items.length === 0
              ? 'Group books into categories to help readers browse the catalog.'
              : 'Try a different search term.'
          }
          actionLabel={items.length === 0 ? 'Add your first category' : undefined}
          onAction={items.length === 0 ? openNew : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`flex flex-col rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted ${
                c.is_archived ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-foreground">{c.name}</h3>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                    <BookOpen className="h-3.5 w-3.5 text-primary-600" />
                    <span className="font-medium text-foreground">{c.book_count}</span> book{c.book_count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(c)}
                    className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-700"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setArchiveTarget(c)}
                    className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100"
                    title={c.is_archived ? 'Restore' : 'Archive'}
                  >
                    {c.is_archived ? (
                      <ArchiveRestore className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {c.description && (
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">{c.description}</p>
              )}
              {c.is_archived && <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Archived</p>}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Edit Category' : 'Add Category'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <Input label="Name *" name="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Textarea label="Description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{saving ? 'Saving…' : 'Save Category'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.is_archived ? 'Restore category' : 'Archive category'}
        message={
          archiveTarget?.is_archived
            ? `"${archiveTarget?.name}" will be restored and offered for new books.`
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