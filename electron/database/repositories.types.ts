import type {
  AdminUser,
  Author,
  AuthorInput,
  AuthorListItem,
  Book,
  BookFilters,
  BookInput,
  Borrowing,
  BorrowingFilters,
  BorrowingInput,
  Category,
  CategoryInput,
  CategoryListItem,
  DashboardStats,
  Paginated,
  Publisher,
  PublisherInput,
  PublisherListItem
} from '@shared/types'

export interface AuthorsRepository {
  list(includeArchived?: boolean): Promise<AuthorListItem[]>
  getById(id: number): Promise<Author | null>
  create(input: AuthorInput): Promise<AuthorListItem>
  update(id: number, input: AuthorInput): Promise<AuthorListItem>
  archive(id: number): Promise<AuthorListItem>
}

export interface BooksRepository {
  list(filters: BookFilters): Promise<Paginated<Book>>
  getById(id: number): Promise<Book | null>
  getBookRows(filters: BookFilters): Promise<Book[]>
  create(input: BookInput): Promise<Book>
  update(id: number, input: BookInput): Promise<Book>
  archive(id: number): Promise<Book>
  restore(id: number): Promise<Book>
  delete(id: number): Promise<void>
  clearCatalog(): Promise<void>
  dashboardStats(): Promise<DashboardStats>
  countAll(): Promise<number>
}

export interface BorrowingsRepository {
  list(filters: BorrowingFilters): Promise<Paginated<Borrowing>>
  getById(id: number): Promise<Borrowing | null>
  create(input: BorrowingInput): Promise<Borrowing>
  recordReturn(id: number): Promise<Borrowing>
  activeCount(bookId: number): Promise<number>
  listByBook(bookId: number): Promise<Borrowing[]>
}

export interface CategoriesRepository {
  list(includeArchived?: boolean): Promise<CategoryListItem[]>
  getById(id: number): Promise<Category | null>
  create(input: CategoryInput): Promise<CategoryListItem>
  update(id: number, input: CategoryInput): Promise<CategoryListItem>
  archive(id: number): Promise<CategoryListItem>
}

export interface PublishersRepository {
  list(includeArchived?: boolean): Promise<PublisherListItem[]>
  getById(id: number): Promise<Publisher | null>
  create(input: PublisherInput): Promise<PublisherListItem>
  update(id: number, input: PublisherInput): Promise<PublisherListItem>
  archive(id: number): Promise<PublisherListItem>
}

export interface SettingsRepository {
  get(key: string): Promise<string | null>
  getAll(): Promise<Record<string, string>>
  set(key: string, value: string | null): Promise<void>
  setMany(entries: Array<[string, string | null]>): Promise<void>
}

export interface AdminUserRecord {
  username: string
  passwordHash: string
  full_name?: string | null
}

export interface UsersRepository {
  hasAdmin(): Promise<boolean>
  count(): Promise<number>
  findByUsername(username: string): Promise<{ id: number } | null>
  create(input: AdminUserRecord): Promise<AdminUser>
  createFirstAdmin(input: AdminUserRecord): Promise<AdminUser>
  updatePassword(id: number, passwordHash: string): Promise<void>
  getById(id: number): Promise<AdminUser | null>
  getFirstAdmin(): Promise<{ id: number; username: string } | null>
  getPasswordHash(id: number): Promise<string | null>
}

export interface Repositories {
  users: UsersRepository
  settings: SettingsRepository
  authors: AuthorsRepository
  categories: CategoriesRepository
  publishers: PublishersRepository
  books: BooksRepository
  borrowings: BorrowingsRepository
}
