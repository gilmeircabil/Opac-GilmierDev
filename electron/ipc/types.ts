import type { AppDirs } from '../config/paths'
import type {
  AdminUser,
  AppMode,
  AuthorInput,
  AuthorListItem,
  BackupFile,
  BackupRestoreResult,
  Book,
  BookFilters,
  BookInput,
  Borrowing,
  BorrowingFilters,
  BorrowingInput,
  CategoryInput,
  CategoryListItem,
  ConnectionConfig,
  ConnectionDiscoveryResult,
  ConnectionStatus,
  DatabaseStatus,
  DashboardStats,
  ImageResult,
  ImportRunResult,
  ImportSheetPreview,
  ImportTaskInput,
  InstallInfo,
  MongoConfigInfo,
  MongoConfigInput,
  NetworkAccessInfo,
  Paginated,
  PublisherInput,
  PublisherListItem,
  ServerStatus,
  SettingsMap
} from '@shared/types'
import type { AuthService } from '../services/auth.service'
import type { SettingsService } from '../services/settings.service'
import type { NetworkAdminService } from '../services/network-admin.service'

export interface BooksService {
  list(filters: BookFilters): Promise<Paginated<Book>>
  get(id: number): Promise<Book | null>
  create(input: BookInput): Promise<Book>
  update(id: number, input: BookInput): Promise<Book>
  archive(id: number): Promise<Book>
  restore(id: number): Promise<Book>
  delete(id: number): Promise<void>
  stats(): Promise<DashboardStats>
  importParse?(input: Omit<ImportTaskInput, 'columnMap' | 'options'>): Promise<ImportSheetPreview>
  importRun?(input: ImportTaskInput): Promise<ImportRunResult>
}

export interface AuthorsService {
  list(): Promise<AuthorListItem[]>
  create(input: AuthorInput): Promise<AuthorListItem>
  update(id: number, input: AuthorInput): Promise<AuthorListItem>
  archive(id: number): Promise<AuthorListItem>
}

export interface CategoriesService {
  list(): Promise<CategoryListItem[]>
  create(input: CategoryInput): Promise<CategoryListItem>
  update(id: number, input: CategoryInput): Promise<CategoryListItem>
  archive(id: number): Promise<CategoryListItem>
}

export interface PublishersService {
  list(): Promise<PublisherListItem[]>
  create(input: PublisherInput): Promise<PublisherListItem>
  update(id: number, input: PublisherInput): Promise<PublisherListItem>
  archive(id: number): Promise<PublisherListItem>
}

export interface BorrowingsService {
  list(filters: BorrowingFilters): Promise<Paginated<Borrowing>>
  create(input: BorrowingInput): Promise<Borrowing>
  return(id: number): Promise<Borrowing>
}

export interface ImageService {
  pickCover(): Promise<ImageResult>
  pickLogo(): Promise<ImageResult>
  uploadBase64?(fileName: string, base64Data: string): Promise<ImageResult>
  getBuffer?(filename: string): Promise<{ mime: string; buffer: Buffer } | null>
  delete(filename: string): Promise<void>
}

export interface BackupService {
  create(): Promise<BackupFile>
  list(): Promise<BackupFile[]>
  restore(filename: string): Promise<void>
  pickAndRestore(): Promise<BackupRestoreResult>
}

export interface DatabaseService {
  status(): Promise<DatabaseStatus>
  clearCatalog(): Promise<void>
  getMongoConfig?(): Promise<MongoConfigInfo>
  setMongoConfig?(input: MongoConfigInput): Promise<{ ok: boolean; error?: string }>
  testMongoUri?(input: MongoConfigInput): Promise<{ ok: boolean; version?: string; error?: string }>
}

export interface ConnectionsService {
  get(): Promise<ConnectionConfig | null>
  save(config: ConnectionConfig): Promise<void>
  test(config: ConnectionConfig): Promise<ConnectionStatus>
  reset(): Promise<void>
  discover(): Promise<ConnectionDiscoveryResult>
  setRemoteUrl(url: string | null): Promise<void>
}

/**
 * Union of everything the main process offers over IPC. Administrative-only
 * subsets are nullable and their channels reject when the app runs in User mode.
 */
export interface Services {
  dirs: AppDirs
  installInfo: () => Promise<InstallInfo>
  mode: () => Promise<AppMode>
  auth: AuthService | null
  settings: SettingsService
  images: ImageService | null
  backup: BackupService | null
  books: BooksService | null
  authors: AuthorsService | null
  categories: CategoriesService | null
  publishers: PublishersService | null
  borrowings: BorrowingsService | null
  network: NetworkAdminService | null
  database: DatabaseService | null
  connection: ConnectionsService | null
  isAuthenticated: () => Promise<boolean>
  openPath: (path: string) => Promise<void>
  restart: () => void
  broadcastSettings: () => void
  broadcastSession: () => void
}

export type {
  AdminUser,
  AppMode,
  AuthorListItem,
  BackupFile,
  BackupRestoreResult,
  Book,
  DatabaseStatus,
  DashboardStats,
  ImageResult,
  InstallInfo,
  NetworkAccessInfo,
  Paginated,
  ServerStatus,
  SettingsMap
}