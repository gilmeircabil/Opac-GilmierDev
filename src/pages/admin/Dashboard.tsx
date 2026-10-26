import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Layers,
  CheckCircle2,
  Repeat,
  AlertTriangle,
  Users,
  Tags,
  Building2,
  Clock
} from 'lucide-react'
import { useAppStore } from '../../stores/app'
import Spinner from '../../components/ui/Spinner'
import BookCover from '../../components/BookCover'
import Badge from '../../components/ui/Badge'
import type { DashboardStats, Book } from '@shared/types'
import { formatDate, errorMessage, classNames } from '../../lib/utils'

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  to
}: {
  label: string
  value: number
  icon: React.ElementType
  iconColor: string
  iconBg: string
  to?: string
}) {
  const inner = (
    <div className="group flex items-start justify-between rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lifted">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      </div>
      <span className={classNames('rounded-xl p-3 shadow-xs transition-transform duration-200 group-hover:scale-105', iconBg)}>
        <Icon className={classNames('h-5 w-5', iconColor)} />
      </span>
    </div>
  )
  if (to) {
    return (
      <Link to={to} className="ring-focus block">
        {inner}
      </Link>
    )
  }
  return inner
}

export default function Dashboard() {
  const user = useAppStore((s) => s.user)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.books
      .stats()
      .then(setStats)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  if (error) {
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
  }
  if (!stats) return <Spinner label="Loading dashboard..." full />

  const recent = stats.recentBooks.slice(0, 6)

  return (
    <div className="space-y-8">
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Welcome{user ? ` back, ${user.full_name ?? user.username}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-muted">Here's an overview of your library collection and activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="Total Books"
          value={stats.totalBooks}
          icon={BookOpen}
          iconColor="text-primary-700"
          iconBg="bg-primary-50"
          to="/admin/books"
        />
        <StatCard
          label="Total Copies"
          value={stats.totalCopies}
          icon={Layers}
          iconColor="text-sky-700"
          iconBg="bg-sky-50"
          to="/admin/books"
        />
        <StatCard
          label="Available"
          value={stats.availableCopies}
          icon={CheckCircle2}
          iconColor="text-emerald-700"
          iconBg="bg-emerald-50"
          to="/admin/books"
        />
        <StatCard
          label="On Loan"
          value={stats.borrowedCopies}
          icon={Repeat}
          iconColor="text-amber-700"
          iconBg="bg-amber-50"
          to="/admin/borrowings"
        />
        <StatCard
          label="Authors"
          value={stats.authors}
          icon={Users}
          iconColor="text-purple-700"
          iconBg="bg-purple-50"
          to="/admin/authors"
        />
        <StatCard
          label="Categories"
          value={stats.categories}
          icon={Tags}
          iconColor="text-teal-700"
          iconBg="bg-teal-50"
          to="/admin/categories"
        />
        <StatCard
          label="Publishers"
          value={stats.publishers}
          icon={Building2}
          iconColor="text-indigo-700"
          iconBg="bg-indigo-50"
          to="/admin/publishers"
        />
        <StatsOverdue value={stats.overdueBooks} />
      </div>

      <div className="animate-fade-in rounded-2xl border border-slate-200/80 bg-surface p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="rounded-xl bg-primary-50 p-2 text-primary-700">
              <Clock className="h-4 w-4" />
            </span>
            Recently Added Books
          </h2>
          <Link
            to="/admin/books"
            className="ring-focus text-sm font-semibold text-primary-700 hover:text-primary-800 hover:underline"
          >
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No books yet.{' '}
            <Link to="/admin/books?new=true" className="font-medium text-primary-700 hover:underline">
              Add your first book
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((book: Book) => (
              <li key={book.id}>
                <Link
                  to={`/admin/books?edit=${book.id}`}
                  className="ring-focus group flex items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="shrink-0 overflow-hidden rounded-lg shadow-xs ring-1 ring-slate-900/5">
                    <BookCover filename={book.cover_image} title={book.title} sizes="sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary-700">
                      {book.title}
                    </p>
                    <p className="text-xs text-muted">
                      {book.author_name ?? 'Unknown Author'} · {book.category_name ?? 'Uncategorized'}
                    </p>
                  </div>
                  <div className="text-right">
                    {book.available ? (
                      <Badge tone="success">Available</Badge>
                    ) : (
                      <Badge tone="danger">Unavailable</Badge>
                    )}
                    <p className="mt-1 text-[11px] text-muted">{formatDate(book.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatsOverdue({ value }: { value: number }) {
  return (
    <Link
      to="/admin/borrowings?status=overdue"
      className={classNames(
        'ring-focus group block rounded-2xl border p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lifted',
        value > 0
          ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-50'
          : 'border-slate-200/80 bg-surface'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Overdue</p>
          <p
            className={classNames(
              'mt-2 text-3xl font-bold tracking-tight',
              value > 0 ? 'text-rose-600' : 'text-foreground'
            )}
          >
            {value}
          </p>
        </div>
        <span
          className={classNames(
            'rounded-xl p-3 shadow-xs transition-transform duration-200 group-hover:scale-105',
            value > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-muted'
          )}
        >
          <AlertTriangle className="h-5 w-5" />
        </span>
      </div>
    </Link>
  )
}
