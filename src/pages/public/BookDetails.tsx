import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  BookText,
  MapPin,
  Hash,
  Building2,
  User,
  Layers,
  Fingerprint
} from 'lucide-react'
import PublicLayout from '../../layouts/PublicLayout'
import BookCover from '../../components/BookCover'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'
import type { Book } from '@shared/types'
import { formatDate, errorMessage } from '../../lib/utils'

export default function BookDetails() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    void window.api.books
      .get(Number(id))
      .then((b) => setBook(b))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <PublicLayout showBack>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {loading ? (
          <Spinner label="Loading book details..." full />
        ) : error || !book ? (
          <EmptyState
            icon={BookText}
            title="Book not found"
            description={error ?? 'This book is no longer in the catalog.'}
          />
        ) : (
          <div className="animate-fade-in space-y-6">
            <Link
              to="/catalog"
              className="ring-focus inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to catalog
            </Link>

            <div className="flex flex-col gap-8 rounded-2xl border border-slate-200/80 bg-surface p-6 shadow-card sm:p-8 md:flex-row">
              <div className="flex justify-center md:w-56 md:shrink-0">
                <div className="overflow-hidden rounded-2xl shadow-card ring-1 ring-slate-900/5">
                  <BookCover filename={book.cover_image} title={book.title} sizes="xl" />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {book.category_name && (
                    <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                      {book.category_name}
                    </span>
                  )}
                  {book.publication_year && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {book.publication_year}
                    </span>
                  )}
                </div>

                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {book.title}
                </h1>

                <p className="mt-2 text-base font-medium text-slate-600">
                  by <span className="text-foreground">{book.author_name ?? 'Unknown Author'}</span>
                </p>

                <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl bg-slate-50/70 p-4 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2.5 text-muted">
                    <User className="h-4 w-4 shrink-0 text-primary-600" />
                    <span>Author: <span className="font-medium text-foreground">{book.author_name ?? 'Unknown'}</span></span>
                  </div>
                  <div className="flex items-center gap-2.5 text-muted">
                    <Fingerprint className="h-4 w-4 shrink-0 text-primary-600" />
                    <span>ISBN: <span className="font-mono text-foreground">{book.isbn ?? '—'}</span></span>
                  </div>
                  {book.publisher_name && (
                    <div className="flex items-center gap-2.5 text-muted">
                      <Building2 className="h-4 w-4 shrink-0 text-primary-600" />
                      <span>Publisher: <span className="font-medium text-foreground">{book.publisher_name}</span></span>
                    </div>
                  )}
                  {book.edition && (
                    <div className="flex items-center gap-2.5 text-muted">
                      <Layers className="h-4 w-4 shrink-0 text-primary-600" />
                      <span>Edition: <span className="font-medium text-foreground">{book.edition}</span></span>
                    </div>
                  )}
                  {book.call_number && (
                    <div className="flex items-center gap-2.5 text-muted">
                      <Hash className="h-4 w-4 shrink-0 text-primary-600" />
                      <span>Call No: <span className="font-mono font-medium text-foreground">{book.call_number}</span></span>
                    </div>
                  )}
                  {book.shelf_location && (
                    <div className="flex items-center gap-2.5 text-muted">
                      <MapPin className="h-4 w-4 shrink-0 text-primary-600" />
                      <span>Location: <span className="font-medium text-foreground">{book.shelf_location}</span></span>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-5">
                  {book.available ? (
                    <Badge tone="success" icon={CheckCircle2} className="px-3.5 py-1.5 text-xs font-semibold">
                      Available to Borrow
                    </Badge>
                  ) : (
                    <Badge tone="danger" icon={XCircle} className="px-3.5 py-1.5 text-xs font-semibold">
                      Currently Unavailable
                    </Badge>
                  )}
                  <span className="text-sm text-muted">
                    <strong className="text-foreground">{book.available_copies}</strong> of{' '}
                    <strong className="text-foreground">{book.total_copies}</strong> copies in stock
                  </span>
                </div>
              </div>
            </div>

            {book.description && (
              <div className="rounded-2xl border border-slate-200/80 bg-surface p-6 shadow-card sm:p-8">
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                  <BookText className="h-4 w-4 text-primary-600" />
                  Description & Synopsis
                </h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {book.description}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200/80 bg-surface p-6 text-sm text-muted shadow-card sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  Added to catalog: <span className="font-medium text-foreground">{formatDate(book.created_at)}</span>
                </p>
                {book.subject && (
                  <p>
                    Subject keywords: <span className="font-medium text-foreground">{book.subject}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  )
}
