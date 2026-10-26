import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus, Pencil, Archive, ArchiveRestore, Search, Globe, MapPin } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import type { PublisherListItem } from '@shared/types'
import { errorMessage } from '../../lib/utils'

export default function Publishers() {
  const [items, setItems] = useState<PublisherListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)

  const [archiveTarget, setArchiveTarget] = useState<PublisherListItem | null>(null)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await window.api.publishers.list())
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
    setAddress('')
    setWebsite('')
    setError(null)
    setOpen(true)
  }

  const openEdit = (p: PublisherListItem) => {
    setEditingId(p.id)
    setName(p.name)
    setAddress(p.address ?? '')
    setWebsite(p.website ?? '')
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
        await window.api.publishers.update(editingId, { name: name.trim(), address: address.trim() || null, website: website.trim() || null })
      } else {
        await window.api.publishers.create({ name: name.trim(), address: address.trim() || null, website: website.trim() || null })
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
      await window.api.publishers.archive(archiveTarget.id)
      setArchiveTarget(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setArchiving(false)
    }
  }

  const filtered = items.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Publishers</h1>
          <p className="text-sm text-muted">
            {items.length} publisher{items.length === 1 ? '' : 's'} in the library
          </p>
        </div>
        <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Add Publisher</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search publishers…"
          className="ring-focus w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground shadow-xs placeholder:text-muted focus:border-primary-600 focus:ring-4 focus:ring-primary-500/10"
        />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner label="Loading publishers…" full />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={items.length === 0 ? 'No publishers yet' : 'No matching publishers'}
          description={
            items.length === 0
              ? 'Track which companies published the books in your catalog.'
              : 'Try a different search term.'
          }
          actionLabel={items.length === 0 ? 'Add your first publisher' : undefined}
          onAction={items.length === 0 ? openNew : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`flex flex-col rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted ${
                p.is_archived ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-foreground">{p.name}</h3>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-medium text-foreground">{p.book_count}</span> book{p.book_count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-700"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setArchiveTarget(p)}
                    className="ring-focus rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100"
                    title={p.is_archived ? 'Restore' : 'Archive'}
                  >
                    {p.is_archived ? (
                      <ArchiveRestore className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                {p.address && (
                  <p className="flex items-center gap-1.5 text-xs"><MapPin className="h-3.5 w-3.5 text-primary-600" /> {p.address}</p>
                )}
                {p.website && (
                  <p className="flex items-center gap-1.5 text-xs"><Globe className="h-3.5 w-3.5 text-primary-600" /> {p.website}</p>
                )}
              </div>
              {p.is_archived && <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Archived</p>}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Edit Publisher' : 'Add Publisher'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <Input label="Name *" name="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Input label="Address" name="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Input label="Website" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{saving ? 'Saving…' : 'Save Publisher'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.is_archived ? 'Restore publisher' : 'Archive publisher'}
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