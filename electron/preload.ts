import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/api'
import type { LibraryApi } from '../shared/api'
import type {
  AdminUser,
  AuthorInput,
  BookFilters,
  BookInput,
  BorrowingFilters,
  BorrowingInput,
  CategoryInput,
  ChangePasswordInput,
  ConnectionConfig,
  CreateAdminInput,
  ImageResult,
  ImportTaskInput,
  MongoConfigInput,
  PublisherInput,
  SettingsMap
} from '../shared/types'

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).then((result) => {
    if (result && typeof result === 'object' && 'ok' in result) {
      const envelope = result as { ok: boolean; data?: T; error?: string }
      if (!envelope.ok) {
        const error = new Error(envelope.error ?? 'An unexpected error occurred')
        error.name = 'OpacError'
        throw error
      }
      return envelope.data as T
    }
    return result as T
  })
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

let cachedBaseUrl = ''
let activeToken = ''

function formatBaseUrl(conn: ConnectionConfig): string {
  const raw = conn.host.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      if (parsed.port) return raw
      if (conn.port && conn.port !== 80 && conn.port !== 443) {
        return `${raw}:${conn.port}`
      }
      return raw
    } catch {
      return raw
    }
  }
  return `http://${raw}:${conn.port || 47821}`
}

async function getAdminBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl
  try {
    const conn = await invoke<ConnectionConfig | null>(IPC.connectionGet)
    if (conn && conn.host && conn.host.trim()) {
      cachedBaseUrl = `${formatBaseUrl(conn)}/api/v1/admin`
      return cachedBaseUrl
    }
  } catch {
    // ignore and fallback to local port
  }
  const st = await invoke<{ apiPort: number }>(IPC.networkStatus)
  cachedBaseUrl = `http://127.0.0.1:${st.apiPort || 47821}/api/v1/admin`
  return cachedBaseUrl
}

async function fetchAdmin<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getAdminBaseUrl()
  const headers = new Headers(options?.headers)
  if (activeToken) {
    headers.set('Authorization', `Bearer ${activeToken}`)
  }
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${base}${path}`, { ...options, headers })
  const json = (await res.json()) as any
  if (!json.ok) throw new Error(json.error || 'API Request failed')
  return json.data as T
}

async function fetchRpc<T>(service: string, method: string, ...args: any[]): Promise<T> {
  return fetchAdmin<T>('/rpc', {
    method: 'POST',
    body: JSON.stringify({ service, method, args })
  })
}

function bytesToBase64(data: ArrayBuffer | Uint8Array | string): string {
  if (typeof data === 'string') return data
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function pickAndUploadImage(): Promise<ImageResult> {
  const picked = await invoke<{
    canceled: boolean
    fileName?: string
    base64?: string
    error?: string
  }>(IPC.imagesPickLocalBase64)
  if (picked.canceled) return { filename: null }
  if (picked.error || !picked.base64 || !picked.fileName) {
    return { filename: null, error: picked.error || 'Unable to read selected image' }
  }
  return fetchAdmin<ImageResult>('/images/upload', {
    method: 'POST',
    body: JSON.stringify({
      fileName: picked.fileName,
      base64: picked.base64
    })
  })
}

const api: LibraryApi = {
  paths: () => invoke('app:paths'),
  openPath: (path: string) => invoke('app:open-path', path),
  restart: () => {
    void ipcRenderer.invoke('app:restart')
  },
  installInfo: () => invoke(IPC.appInstallInfo),
  mode: () => invoke(IPC.appMode),

  connection: {
    get: () => invoke(IPC.connectionGet),
    save: async (config) => {
      cachedBaseUrl = ''
      await invoke(IPC.connectionSave, config)
    },
    test: (config) => invoke(IPC.connectionTest, config),
    reset: async () => {
      cachedBaseUrl = ''
      await invoke(IPC.connectionReset)
    }
  },

  network: {
    status: () => invoke(IPC.networkStatus),
    start: async () => {
      cachedBaseUrl = ''
      return invoke(IPC.networkStart)
    },
    stop: () => invoke(IPC.networkStop),
    restart: async () => {
      cachedBaseUrl = ''
      return invoke(IPC.networkRestart)
    },
    tokenInfo: () => invoke(IPC.networkTokenInfo),
    regenerateToken: () => invoke(IPC.networkRegenerateToken),
    setPort: async (port: number) => {
      cachedBaseUrl = ''
      return invoke(IPC.networkSetPort, port)
    },
    firewall: () => invoke(IPC.networkFirewall)
  },

  database: {
    status: async () => {
      try {
        return await fetchRpc('database', 'status')
      } catch {
        return invoke(IPC.databaseStatus)
      }
    },
    clearCatalog: () => fetchRpc('database', 'clearCatalog'),
    getMongoConfig: () => invoke(IPC.databaseGetMongoConfig),
    setMongoConfig: async (input: MongoConfigInput) => {
      cachedBaseUrl = ''
      return invoke(IPC.databaseSetMongoConfig, input)
    },
    testMongoUri: (input: MongoConfigInput) => invoke(IPC.databaseTestMongoUri, input)
  },

  auth: {
    needsSetup: () => fetchAdmin<boolean>('/auth/needs-setup'),
    setup: async (input: CreateAdminInput) => {
      const res = await fetchAdmin<{ user: AdminUser; token: string } | AdminUser>('/auth/setup', {
        method: 'POST',
        body: JSON.stringify(input)
      })
      if (res && typeof res === 'object' && 'token' in res && 'user' in res) {
        activeToken = res.token
        return res.user
      }
      return res as AdminUser
    },
    login: async (username: string, password: string) => {
      const res = await fetchAdmin<{ user: AdminUser; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })
      activeToken = res.token
      return res.user
    },
    logout: async () => {
      await fetchAdmin('/auth/logout', { method: 'POST' })
      activeToken = ''
    },
    session: () => fetchAdmin<AdminUser | null>('/auth/session'),
    changePassword: (input: ChangePasswordInput) =>
      fetchRpc('auth', 'changePassword', input.currentPassword, input.newPassword),
    recoverPassword: (input: { pin: string; newPassword: string; username?: string }) =>
      fetchAdmin<{ username: string }>('/auth/recover', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
    verifyPin: (pin: string) =>
      fetchAdmin<boolean>('/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin })
      }),
    changeSecurityPin: (input: { currentSecret: string; newPin: string }) =>
      fetchRpc('auth', 'changeSecurityPin', input.currentSecret, input.newPin)
  },

  books: {
    list: async (filters: BookFilters) => {
      if ((await api.mode()) === 'user') return invoke(IPC.booksList, filters)
      return fetchRpc('books', 'list', filters)
    },
    get: async (id: number) => {
      if ((await api.mode()) === 'user') return invoke(IPC.booksGet, id)
      return fetchRpc('books', 'get', id)
    },
    create: (input: BookInput) => fetchRpc('books', 'create', input),
    update: (id: number, input: BookInput) => fetchRpc('books', 'update', id, input),
    archive: (id: number) => fetchRpc('books', 'archive', id),
    restore: (id: number) => fetchRpc('books', 'restore', id),
    delete: (id: number) => fetchRpc('books', 'delete', id),
    stats: async () => {
      if ((await api.mode()) === 'user') return invoke(IPC.booksStats)
      return fetchRpc('books', 'stats')
    },
    importParse: (input: Omit<ImportTaskInput, 'columnMap' | 'options'>) =>
      fetchRpc('books', 'importParse', {
        ...input,
        data: bytesToBase64(input.data as any)
      }),
    importRun: (input: ImportTaskInput) =>
      fetchRpc('books', 'importRun', {
        ...input,
        data: bytesToBase64(input.data as any)
      })
  },

  authors: {
    list: async () => {
      if ((await api.mode()) === 'user') return invoke(IPC.authorsList)
      return fetchRpc('authors', 'list')
    },
    create: (input: AuthorInput) => fetchRpc('authors', 'create', input),
    update: (id: number, input: AuthorInput) => fetchRpc('authors', 'update', id, input),
    archive: (id: number) => fetchRpc('authors', 'archive', id)
  },

  categories: {
    list: async () => {
      if ((await api.mode()) === 'user') return invoke(IPC.categoriesList)
      return fetchRpc('categories', 'list')
    },
    create: (input: CategoryInput) => fetchRpc('categories', 'create', input),
    update: (id: number, input: CategoryInput) => fetchRpc('categories', 'update', id, input),
    archive: (id: number) => fetchRpc('categories', 'archive', id)
  },

  publishers: {
    list: async () => {
      if ((await api.mode()) === 'user') return invoke(IPC.publishersList)
      return fetchRpc('publishers', 'list')
    },
    create: (input: PublisherInput) => fetchRpc('publishers', 'create', input),
    update: (id: number, input: PublisherInput) => fetchRpc('publishers', 'update', id, input),
    archive: (id: number) => fetchRpc('publishers', 'archive', id)
  },

  borrowings: {
    list: (filters: BorrowingFilters) => fetchRpc('borrowings', 'list', filters),
    create: (input: BorrowingInput) => fetchRpc('borrowings', 'create', input),
    return: (id: number) => fetchRpc('borrowings', 'return', id)
  },

  images: {
    pickCover: () => pickAndUploadImage(),
    pickLogo: () => pickAndUploadImage(),
    delete: (filename: string) => fetchRpc('images', 'delete', filename)
  },

  backup: {
    create: () => fetchRpc('backup', 'create'),
    list: () => fetchRpc('backup', 'list'),
    restore: (filename: string) => fetchRpc('backup', 'restore', filename),
    pickAndRestore: () => fetchRpc('backup', 'pickAndRestore')
  },

  settings: {
    getAll: async () => {
      if ((await api.mode()) === 'user') return invoke(IPC.settingsGetAll)
      return fetchRpc('settings', 'getAll')
    },
    set: (key: any, value: any) => fetchRpc('settings', 'set', key, value)
  },

  onSettingsChanged: (cb: (settings: SettingsMap) => void) =>
    subscribe<SettingsMap>(IPC.eventSettingsChanged, cb),
  onSessionChanged: (cb: () => void) =>
    subscribe<unknown>(IPC.eventSessionChanged, () => cb())
}

contextBridge.exposeInMainWorld('api', api)
