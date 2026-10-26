import type {
  AdminUser,
  ApiTokenInfo,
  AppMode,
  AppPaths,
  AsyncResult,
  AuthorInput,
  AuthorListItem,
  BackupFile,
  Book,
  BookFilters,
  BookInput,
  Borrowing,
  BorrowingFilters,
  BorrowingInput,
  CategoryInput,
  CategoryListItem,
  ChangePasswordInput,
  ConnectionConfig,
  ConnectionDiscoveryResult,
  ConnectionStateEvent,
  ConnectionStatus,
  CreateAdminInput,
  DashboardStats,
  DatabaseStatus,
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
} from './types'

export const IPC = {
  appPaths: 'app:paths',
  appOpenPath: 'app:open-path',
  appRestart: 'app:restart',
  appInstallInfo: 'app:install-info',
  appMode: 'app:mode',

  connectionGet: 'connection:get',
  connectionSave: 'connection:save',
  connectionTest: 'connection:test',
  connectionReset: 'connection:reset',
  connectionDiscover: 'connection:discover',
  connectionSetRemoteUrl: 'connection:set-remote-url',
  eventConnectionStatusChanged: 'connection:status-changed',

  networkStatus: 'network:status',
  networkStart: 'network:start',
  networkStop: 'network:stop',
  networkRestart: 'network:restart',
  networkTokenInfo: 'network:token-info',
  networkRegenerateToken: 'network:regenerate-token',
  networkSetPort: 'network:set-port',
  networkFirewall: 'network:firewall',

  databaseStatus: 'database:status',
  databaseClearCatalog: 'database:clear-catalog',
  databaseGetMongoConfig: 'database:get-mongo-config',
  databaseSetMongoConfig: 'database:set-mongo-config',
  databaseTestMongoUri: 'database:test-mongo-uri',

  authNeedsSetup: 'auth:needs-setup',
  authSetup: 'auth:setup',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authSession: 'auth:session',
  authChangePassword: 'auth:change-password',
  authRecoverPassword: 'auth:recover-password',

  booksList: 'books:list',
  booksGet: 'books:get',
  booksCreate: 'books:create',
  booksUpdate: 'books:update',
  booksArchive: 'books:archive',
  booksRestore: 'books:restore',
  booksDelete: 'books:delete',
  booksStats: 'books:stats',
  booksImportParse: 'books:import-parse',
  booksImportRun: 'books:import-run',

  authorsList: 'authors:list',
  authorsCreate: 'authors:create',
  authorsUpdate: 'authors:update',
  authorsArchive: 'authors:archive',

  categoriesList: 'categories:list',
  categoriesCreate: 'categories:create',
  categoriesUpdate: 'categories:update',
  categoriesArchive: 'categories:archive',

  publishersList: 'publishers:list',
  publishersCreate: 'publishers:create',
  publishersUpdate: 'publishers:update',
  publishersArchive: 'publishers:archive',

  borrowingsList: 'borrowings:list',
  borrowingsCreate: 'borrowings:create',
  borrowingsReturn: 'borrowings:return',

  imagesPickCover: 'images:pick-cover',
  imagesPickLogo: 'images:pick-logo',
  imagesPickLocalBase64: 'images:pick-local-base64',
  imagesDelete: 'images:delete',

  backupCreate: 'backup:create',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
  backupPickAndRestore: 'backup:pick-restore',

  settingsGetAll: 'settings:get-all',
  settingsSet: 'settings:set',

  eventSettingsChanged: 'settings:changed',
  eventSessionChanged: 'session:changed'
} as const

export interface LibraryApi {
  paths(): Promise<AppPaths>
  openPath(path: string): Promise<void>
  restart(): void
  installInfo(): Promise<InstallInfo>
  mode(): Promise<AppMode>

  connection: {
    get(): Promise<ConnectionConfig | null>
    save(config: ConnectionConfig): Promise<void>
    test(config: ConnectionConfig): Promise<ConnectionStatus>
    reset(): Promise<void>
    discover(): Promise<ConnectionDiscoveryResult>
    setRemoteUrl(url: string | null): Promise<void>
  }

  network: {
    status(): Promise<ServerStatus>
    start(): Promise<ServerStatus>
    stop(): Promise<void>
    restart(): Promise<ServerStatus>
    tokenInfo(): Promise<ApiTokenInfo>
    regenerateToken(): Promise<{ token: string; info: ApiTokenInfo }>
    setPort(port: number): Promise<ServerStatus>
    firewall(): Promise<NetworkAccessInfo>
  }

  database: {
    status(): Promise<DatabaseStatus>
    clearCatalog(): Promise<void>
    getMongoConfig(): Promise<MongoConfigInfo>
    setMongoConfig(input: MongoConfigInput): Promise<{ ok: boolean; error?: string }>
    testMongoUri(input: MongoConfigInput): Promise<{ ok: boolean; version?: string; error?: string }>
  }

  auth: {
    needsSetup(): Promise<boolean>
    setup(input: CreateAdminInput): Promise<AdminUser>
    login(username: string, password: string): Promise<AdminUser>
    logout(): Promise<void>
    session(): Promise<AdminUser | null>
    changePassword(input: ChangePasswordInput): Promise<void>
    recoverPassword(input: { pin: string; newPassword: string; username?: string }): Promise<{ username: string }>
    verifyPin(pin: string): Promise<boolean>
    changeSecurityPin(input: { currentSecret: string; newPin: string }): Promise<void>
  }

  books: {
    list(filters: BookFilters): Promise<Paginated<Book>>
    get(id: number): Promise<Book | null>
    create(input: BookInput): Promise<Book>
    update(id: number, input: BookInput): Promise<Book>
    archive(id: number): Promise<Book>
    restore(id: number): Promise<Book>
    delete(id: number): Promise<void>
    stats(): Promise<DashboardStats>
    importParse(input: Omit<ImportTaskInput, 'columnMap' | 'options'>): Promise<ImportSheetPreview>
    importRun(input: ImportTaskInput): Promise<ImportRunResult>
  }

  authors: {
    list(): Promise<AuthorListItem[]>
    create(input: AuthorInput): Promise<AuthorListItem>
    update(id: number, input: AuthorInput): Promise<AuthorListItem>
    archive(id: number): Promise<AuthorListItem>
  }

  categories: {
    list(): Promise<CategoryListItem[]>
    create(input: CategoryInput): Promise<CategoryListItem>
    update(id: number, input: CategoryInput): Promise<CategoryListItem>
    archive(id: number): Promise<CategoryListItem>
  }

  publishers: {
    list(): Promise<PublisherListItem[]>
    create(input: PublisherInput): Promise<PublisherListItem>
    update(id: number, input: PublisherInput): Promise<PublisherListItem>
    archive(id: number): Promise<PublisherListItem>
  }

  borrowings: {
    list(filters: BorrowingFilters): Promise<Paginated<Borrowing>>
    create(input: BorrowingInput): Promise<Borrowing>
    return(id: number): Promise<Borrowing>
  }

  images: {
    pickCover(): Promise<ImageResult>
    pickLogo(): Promise<ImageResult>
    delete(filename: string): Promise<void>
  }

  backup: {
    create(): Promise<BackupFile>
    list(): Promise<BackupFile[]>
    restore(filename: string): Promise<void>
    pickAndRestore(): Promise<AsyncResult<string>>
  }

  settings: {
    getAll(): Promise<SettingsMap>
    set(key: keyof SettingsMap, value: string | null): Promise<void>
  }

  onSettingsChanged(cb: (settings: SettingsMap) => void): () => void
  onSessionChanged(cb: () => void): () => void
  onConnectionStatusChanged(cb: (event: ConnectionStateEvent) => void): () => void
}