export interface Author {
  id: number
  name: string
  biography: string | null
  is_archived: boolean
  created_at: string
}

export interface AuthorInput {
  name: string
  biography?: string | null
}

export interface AuthorListItem extends Author {
  book_count: number
}

export interface Category {
  id: number
  name: string
  description: string | null
  is_archived: boolean
  created_at: string
}

export interface CategoryInput {
  name: string
  description?: string | null
}

export interface CategoryListItem extends Category {
  book_count: number
}

export interface Publisher {
  id: number
  name: string
  address: string | null
  website: string | null
  is_archived: boolean
  created_at: string
}

export interface PublisherInput {
  name: string
  address?: string | null
  website?: string | null
}

export interface PublisherListItem extends Publisher {
  book_count: number
}

export interface Book {
  id: number
  title: string
  isbn: string | null
  author_id: number | null
  author_name: string | null
  category_id: number | null
  category_name: string | null
  publisher_id: number | null
  publisher_name: string | null
  publication_year: number | null
  edition: string | null
  subject: string | null
  description: string | null
  call_number: string | null
  shelf_location: string | null
  total_copies: number
  available_copies: number
  cover_image: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
  available: boolean
}

export interface BookInput {
  title: string
  isbn?: string | null
  author_id?: number | null
  category_id?: number | null
  publisher_id?: number | null
  publication_year?: number | null
  edition?: string | null
  subject?: string | null
  description?: string | null
  call_number?: string | null
  shelf_location?: string | null
  total_copies?: number
  available_copies?: number
  cover_image?: string | null
}

export type BookSort =
  | 'title_asc'
  | 'title_desc'
  | 'author_asc'
  | 'year_desc'
  | 'year_asc'
  | 'recent'

export type AvailabilityFilter = 'all' | 'available' | 'unavailable'

/** A parsed spreadsheet: headers + a bounded preview of raw rows. */
export interface ImportSheetPreview {
  fileName: string
  sheetName: string
  headers: string[]
  rows: string[][]
  totalRows: number
}

/** Which source column maps to each book field (column headers). null = ignore/unmapped. */
export interface ImportColumnMap {
  title: string | null
  author: string | null
  category: string | null
  publisher: string | null
  isbn: string | null
  year: string | null
  copies: string | null
  description: string | null
}

export interface ImportOptions {
  /** Auto-create missing authors/categories/publishers by name. */
  createAuthors: boolean
  createCategories: boolean
  createPublishers: boolean
  /** Skip rows whose (normalised title + ISBN) already exist in the catalog. */
  skipDuplicates: boolean
}

export interface ImportTaskInput {
  fileName: string
  data: ArrayBuffer | Uint8Array
  sheetName?: string | null
  columnMap: ImportColumnMap
  options: ImportOptions
}

export interface ImportRowError {
  row: number
  title?: string
  message: string
}

export interface ImportRunResult {
  totalRows: number
  imported: number
  skippedDuplicates: number
  createdAuthors: number
  createdCategories: number
  createdPublishers: number
  errors: ImportRowError[]
}

export interface BookFilters {
  search?: string | null
  category_id?: number | null
  author_id?: number | null
  publisher_id?: number | null
  year_from?: number | null
  year_to?: number | null
  availability?: AvailabilityFilter
  sort?: BookSort
  page?: number
  pageSize?: number
  includeArchived?: boolean
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type BorrowingStatus = 'borrowed' | 'returned' | 'overdue'

export interface Borrowing {
  id: number
  book_id: number
  book_title: string | null
  book_cover: string | null
  book_call_number: string | null
  borrower_name: string
  borrower_id: string | null
  borrowed_at: string
  due_date: string | null
  returned_at: string | null
  status: BorrowingStatus
}

export interface BorrowingInput {
  book_id: number
  borrower_name: string
  borrower_id?: string | null
  borrowed_at: string
  due_date?: string | null
}

export type BorrowingFilter = 'all' | 'borrowed' | 'returned' | 'overdue'

export interface BorrowingFilters {
  status?: BorrowingFilter
  search?: string | null
  page?: number
  pageSize?: number
}

export interface AdminUser {
  id: number
  username: string
  full_name: string | null
  created_at: string
}

export interface CreateAdminInput {
  username: string
  password: string
  full_name?: string | null
  security_pin?: string | null
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface DashboardStats {
  totalBooks: number
  totalCopies: number
  availableCopies: number
  borrowedCopies: number
  authors: number
  categories: number
  publishers: number
  activeBorrowings: number
  overdueBooks: number
  recentBooks: Book[]
}

export interface SettingsMap {
  library_name: string
  library_logo: string | null
  library_address: string
  contact_info: string
  theme: 'light' | 'dark'
}

export interface AppPaths {
  userData: string
  dataDir: string
  dbPath: string
  imagesDir: string
  backupsDir: string
  logsDir: string
  isPackaged: boolean
  versions: {
    app: string
    electron: string
    chrome: string
    node: string
  }
}

export interface BackupFile {
  filename: string
  path: string
  size: number
  createdAt: string
}

export interface ImageResult {
  filename: string | null
  error?: string
}

export interface AsyncResult<T> {
  ok: boolean
  data?: T
  error?: string
}

// ---------------------------------------------------------------------------
// Multi-machine (Admin / User) architecture types
// ---------------------------------------------------------------------------

export type AppMode = 'admin' | 'user'

export interface InstallInfo {
  mode: AppMode
  dataDir: string
  legacySqlitePath: string | null
  postgres: {
    managed: boolean
    port: number
    database: string
  }
  apiPort: number
}

export interface ConnectionConfig {
  host: string
  port: number
  token?: string
}

export interface ConnectionStatus {
  ok: boolean
  library_name?: string
  library_address?: string
  contact_info?: string
  api_version?: string
  error?: string
}

export interface ApiTokenInfo {
  configured: boolean
  label: string
  created_at: string | null
  last_used_at: string | null
}

export interface ServerStatus {
  running: boolean
  library: string
  databaseConnected: boolean
  host: string
  lanAddresses: string[]
  apiPort: number
  apiVersion: string
  connectedUsers: number
}

export interface NetworkAccessInfo {
  accessTokenConfigured: boolean
  tokenLabel: string
  suggestedFirewallCommand: string
}

export interface BackupRestoreResult {
  restored: boolean
  message?: string
}

export interface DatabaseStatus {
  connected: boolean
  version: string | null
  schemaVersion: number
  libraryName: string
  mongoUriMasked?: string
  mongoDbName?: string
}

export interface MongoConfigInput {
  mongoUri: string
  mongoDbName?: string
}

export interface MongoConfigInfo {
  mongoUri: string
  mongoDbName: string
}