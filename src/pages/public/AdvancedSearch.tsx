import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Eraser, SlidersHorizontal } from 'lucide-react'
import PublicLayout from '../../layouts/PublicLayout'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import type { CategoryListItem, PublisherListItem } from '@shared/types'

interface AdvancedFields {
  title: string
  author: string
  isbn: string
  subject: string
  category_id: string
  publisher_id: string
  year_from: string
  year_to: string
  call_number: string
  availability: string
}

const EMPTY: AdvancedFields = {
  title: '',
  author: '',
  isbn: '',
  subject: '',
  category_id: '',
  publisher_id: '',
  year_from: '',
  year_to: '',
  call_number: '',
  availability: 'all'
}

export default function AdvancedSearch() {
  const navigate = useNavigate()
  const [fields, setFields] = useState<AdvancedFields>(EMPTY)
  const [categories, setCategories] = useState<CategoryListItem[]>([])
  const [publishers, setPublisher] = useState<PublisherListItem[]>([])

  useEffect(() => {
    void window.api.categories.list().then(setCategories).catch(() => undefined)
    void window.api.publishers.list().then(setPublisher).catch(() => undefined)
  }, [])

  const set = <K extends keyof AdvancedFields>(key: K, value: string) =>
    setFields((f) => ({ ...f, [key]: value }))

  const buildQuery = (): string => {
    const params = new URLSearchParams()
    const terms: string[] = []
    if (fields.title.trim()) terms.push(fields.title.trim())
    if (fields.author.trim()) terms.push(fields.author.trim())
    if (fields.subject.trim()) terms.push(fields.subject.trim())
    if (fields.call_number.trim()) terms.push(fields.call_number.trim())
    if (fields.isbn.trim()) params.set('q', fields.isbn.trim())
    else if (terms.length > 0) params.set('q', terms.join(' '))
    if (fields.category_id) params.set('category', fields.category_id)
    if (fields.publisher_id) params.set('publisher', fields.publisher_id)
    if (fields.year_from) params.set('year_from', fields.year_from)
    if (fields.year_to) params.set('year_to', fields.year_to)
    if (fields.availability !== 'all') params.set('availability', fields.availability)
    return `/catalog?${params.toString()}`
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(buildQuery())
  }

  const onClear = () => setFields(EMPTY)

  return (
    <PublicLayout showBack>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <SlidersHorizontal className="h-6 w-6 text-primary-600" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Advanced Search</h1>
            <p className="text-sm text-muted">Search the catalog with fine-grained criteria</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-200/80 bg-surface p-6 shadow-card sm:p-8"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              name="title"
              value={fields.title}
              onChange={(e) => set('title', e.target.value)}
            />
            <Input
              label="Author"
              name="author"
              value={fields.author}
              onChange={(e) => set('author', e.target.value)}
            />
            <Input
              label="ISBN"
              name="isbn"
              value={fields.isbn}
              onChange={(e) => set('isbn', e.target.value)}
            />
            <Input
              label="Subject"
              name="subject"
              value={fields.subject}
              onChange={(e) => set('subject', e.target.value)}
            />
            <Select
              label="Category"
              name="category_id"
              value={fields.category_id}
              onChange={(e) => set('category_id', e.target.value)}
            >
              <option value="">All Categories</option>
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
              <option value="">All Publishers</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Input
              label="Publication Year From"
              name="year_from"
              type="number"
              min="0"
              max="9999"
              value={fields.year_from}
              onChange={(e) => set('year_from', e.target.value)}
            />
            <Input
              label="Publication Year To"
              name="year_to"
              type="number"
              min="0"
              max="9999"
              value={fields.year_to}
              onChange={(e) => set('year_to', e.target.value)}
            />
            <Input
              label="Call Number"
              name="call_number"
              value={fields.call_number}
              onChange={(e) => set('call_number', e.target.value)}
            />
            <Select
              label="Availability"
              name="availability"
              value={fields.availability}
              onChange={(e) => set('availability', e.target.value)}
            >
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </Select>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" icon={<Eraser className="h-4 w-4" />} onClick={onClear}>
              Clear
            </Button>
            <Button type="submit" icon={<Search className="h-4 w-4" />}>
              Search
            </Button>
          </div>
        </form>
      </div>
    </PublicLayout>
  )
}