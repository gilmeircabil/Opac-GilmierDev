import { useEffect, useState } from 'react'
import { Save, Upload, Trash2, ImageIcon } from 'lucide-react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Select from './ui/Select'
import Textarea from './ui/Textarea'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import BookCover from './BookCover'
import type { AuthorListItem, BookInput, CategoryListItem, PublisherListItem } from '@shared/types'
import { errorMessage } from '../lib/utils'

interface FormFields {
  title: string
  isbn: string
  author_id: string
  category_id: string
  publisher_id: string
  publication_year: string
  edition: string
  subject: string
  description: string
  call_number: string
  shelf_location: string
  total_copies: string
  available_copies: string
  cover_image: string | null
}

const EMPTY_FIELDS: FormFields = {
  title: '',
  isbn: '',
  author_id: '',
  category_id: '',
  publisher_id: '',
  publication_year: '',
  edition: '',
  subject: '',
  description: '',
  call_number: '',
  shelf_location: '',
  total_copies: '1',
  available_copies: '1',
  cover_image: null
}

interface BookModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (bookId: number) => void
  bookId?: number | null
}

export default function BookModal({ open, onClose, onSuccess, bookId }: BookModalProps) {
  const editing = typeof bookId === 'number' && bookId > 0

  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS)
  const [categories, setCategories] = useState<CategoryListItem[]>([])
  const [authors, setAuthors] = useState<AuthorListItem[]>([])
  const [publishers, setPublishers] = useState<PublisherListItem[]>([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    // Load relations
    void window.api.categories.list().then(setCategories).catch(() => undefined)
    void window.api.authors.list().then(setAuthors).catch(() => undefined)
    void window.api.publishers.list().then(setPublishers).catch(() => undefined)

    if (editing && bookId) {
      setLoading(true)
      setError(null)
      window.api.books
        .get(bookId)
        .then((book) => {
          if (!book) {
            setError('Book not found.')
            return
          }
          setFields({
            title: book.title,
            isbn: book.isbn ?? '',
            author_id: book.author_id ? String(book.author_id) : '',
            category_id: book.category_id ? String(book.category_id) : '',
            publisher_id: book.publisher_id ? String(book.publisher_id) : '',
            publication_year: book.publication_year ? String(book.publication_year) : '',
            edition: book.edition ?? '',
            subject: book.subject ?? '',
            description: book.description ?? '',
            call_number: book.call_number ?? '',
            shelf_location: book.shelf_location ?? '',
            total_copies: String(book.total_copies),
            available_copies: String(book.available_copies),
            cover_image: book.cover_image
          })
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false))
    } else {
      setFields(EMPTY_FIELDS)
      setError(null)
      setLoading(false)
    }
  }, [open, editing, bookId])

  const set = <K extends keyof FormFields>(key: K, value: string) =>
    setFields((f) => ({ ...f, [key]: value }))

  const handlePickCover = async () => {
    setUploading(true)
    setError(null)
    try {
      const res = await window.api.images.pickCover()
      if (res.filename) setFields((f) => ({ ...f, cover_image: res.filename }))
      else if (res.error) setError(res.error)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveCover = async () => {
    if (fields.cover_image) {
      try {
        await window.api.images.delete(fields.cover_image)
      } catch {
        // ignore
      }
    }
    setFields((f) => ({ ...f, cover_image: null }))
  }

  const validate = (): string | null => {
    if (!fields.title.trim()) return 'Title is required.'
    const total = Number(fields.total_copies)
    if (!Number.isInteger(total) || total < 0) return 'Total copies must be a non-negative whole number.'
    const available = Number(fields.available_copies)
    if (!Number.isInteger(available) || available < 0) return 'Available copies must be a non-negative whole number.'
    if (available > total) return 'Available copies cannot exceed total copies.'
    if (fields.publication_year && (Number(fields.publication_year) < 0 || Number(fields.publication_year) > 9999)) {
      return 'Publication year must be between 0 and 9999.'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const invalid = validate()
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)
    setError(null)

    const input: BookInput = {
      title: fields.title.trim(),
      isbn: fields.isbn.trim() || null,
      author_id: fields.author_id ? Number(fields.author_id) : null,
      category_id: fields.category_id ? Number(fields.category_id) : null,
      publisher_id: fields.publisher_id ? Number(fields.publisher_id) : null,
      publication_year: fields.publication_year ? Number(fields.publication_year) : null,
      edition: fields.edition.trim() || null,
      subject: fields.subject.trim() || null,
      description: fields.description.trim() || null,
      call_number: fields.call_number.trim() || null,
      shelf_location: fields.shelf_location.trim() || null,
      total_copies: Number(fields.total_copies),
      available_copies: Number(fields.available_copies),
      cover_image: fields.cover_image
    }

    try {
      if (editing && bookId) {
        await window.api.books.update(bookId, input)
        onSuccess(bookId)
      } else {
        const created = await window.api.books.create(input)
        onSuccess(created.id)
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Book' : 'Add New Book'}
      maxWidth="xl"
    >
      {loading ? (
        <div className="py-12">
          <Spinner label="Loading book details…" full />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          {/* Cover image upload */}
          <div className="flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
            {fields.cover_image ? (
              <div className="overflow-hidden rounded-xl shadow-xs ring-1 ring-slate-900/5">
                <BookCover filename={fields.cover_image} title={fields.title || 'Cover'} sizes="lg" />
              </div>
            ) : (
              <div className="flex h-32 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-muted">
                <ImageIcon className="h-6 w-6 text-muted/60" />
                <span className="text-[11px]">No cover</span>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-xs font-semibold text-foreground">Book Cover</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePickCover}
                  loading={uploading}
                  icon={<Upload className="h-3.5 w-3.5" />}
                >
                  {uploading ? 'Importing…' : 'Upload cover'}
                </Button>
                {fields.cover_image && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveCover}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted">JPG, PNG or WEBP up to 12 MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Title *"
                name="title"
                value={fields.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Introduction to Algorithms"
                required
              />
            </div>

            <Input
              label="ISBN"
              name="isbn"
              value={fields.isbn}
              onChange={(e) => set('isbn', e.target.value)}
              placeholder="e.g. 978-0-262-03384-8"
            />

            <Select
              label="Author"
              name="author_id"
              value={fields.author_id}
              onChange={(e) => set('author_id', e.target.value)}
            >
              <option value="">Select author…</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>

            <Select
              label="Category"
              name="category_id"
              value={fields.category_id}
              onChange={(e) => set('category_id', e.target.value)}
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Select
              label="Publisher"
              name="publisher_id"
              value={fields.publisher_id}
              onChange={(e) => set('publisher_id', e.target.value)}
            >
              <option value="">Select publisher…</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Input
              label="Publication Year"
              name="publication_year"
              type="number"
              min="0"
              max="9999"
              value={fields.publication_year}
              onChange={(e) => set('publication_year', e.target.value)}
              placeholder="e.g. 2024"
            />

            <Input
              label="Edition"
              name="edition"
              value={fields.edition}
              onChange={(e) => set('edition', e.target.value)}
              placeholder="e.g. 3rd Edition"
            />

            <Input
              label="Call Number"
              name="call_number"
              value={fields.call_number}
              onChange={(e) => set('call_number', e.target.value)}
              placeholder="e.g. QA76.76.C65"
            />

            <Input
              label="Shelf Location"
              name="shelf_location"
              value={fields.shelf_location}
              onChange={(e) => set('shelf_location', e.target.value)}
              placeholder="e.g. Row 4, Shelf B"
            />

            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Input
                label="Total Copies *"
                name="total_copies"
                type="number"
                min="0"
                value={fields.total_copies}
                onChange={(e) => set('total_copies', e.target.value)}
                required
              />
              <Input
                label="Available Copies *"
                name="available_copies"
                type="number"
                min="0"
                value={fields.available_copies}
                onChange={(e) => set('available_copies', e.target.value)}
                required
              />
            </div>
          </div>

          <Textarea
            label="Subject / Keywords"
            name="subject"
            value={fields.subject}
            onChange={(e) => set('subject', e.target.value)}
            rows={2}
            placeholder="Keywords, subjects or tags separated by commas…"
          />

          <Textarea
            label="Description"
            name="description"
            value={fields.description}
            onChange={(e) => set('description', e.target.value)}
            rows={4}
            placeholder="A synopsis or summary of the book…"
          />

          <div className="sticky bottom-0 -mx-6 -mb-5 flex items-center justify-end gap-2 border-t border-slate-100 bg-surface px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Book'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
