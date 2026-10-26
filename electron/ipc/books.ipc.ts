import { IPC } from '@shared/api'
import type { BookFilters } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerBooksIpc({ books, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(books, 'The book catalog')

  registerIpc(IPC.booksList, (filters: BookFilters = {}) => svc.list(sanitizeBookFilters(filters)), { context: ctx })
  registerIpc(IPC.booksGet, (id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid book id')
    return svc.get(id)
  }, { context: ctx })
  registerIpc(IPC.booksStats, () => svc.stats(), { context: ctx })
}

function sanitizeBookFilters(filters: BookFilters): BookFilters {
  const out: BookFilters = { ...filters }
  if (out.search != null && typeof out.search !== 'string') out.search = ''
  if (out.category_id != null && typeof out.category_id !== 'number') out.category_id = undefined
  if (out.author_id != null && typeof out.author_id !== 'number') out.author_id = undefined
  if (out.publisher_id != null && typeof out.publisher_id !== 'number') out.publisher_id = undefined
  return out
}
