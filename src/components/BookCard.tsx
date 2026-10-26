import { Link } from 'react-router-dom'
import { Eye, CheckCircle2, XCircle } from 'lucide-react'
import BookCover from './BookCover'
import type { Book } from '@shared/types'

interface BookCardProps {
  book: Book
  admin?: boolean
}

export default function BookCard({ book, admin = false }: BookCardProps) {
  const href = admin ? `/admin/books?edit=${book.id}` : `/catalog/book/${book.id}`
  return (
    <Link
      to={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lifted"
    >
      <div className="flex justify-center bg-gradient-to-b from-slate-50 to-slate-100/60 p-4">
        <BookCover filename={book.cover_image} title={book.title} sizes="md" className="transition-transform duration-200 group-hover:scale-102" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary-600">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-xs text-muted">{book.author_name ?? 'Unknown Author'}</p>
        {book.category_name && (
          <span className="mt-2 inline-flex w-fit items-center rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {book.category_name}
          </span>
        )}
        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs">
            {book.available ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500">
                <XCircle className="h-3.5 w-3.5 shrink-0" /> Unavailable
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors group-hover:bg-primary-50 group-hover:text-primary-700">
            <Eye className="h-3 w-3" />
            {admin ? 'Edit' : 'View'}
          </span>
        </div>
      </div>
    </Link>
  )
}
