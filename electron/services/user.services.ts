import type { AppDirs } from '../config/paths'
import type { Book, BookFilters, ConnectionConfig, ConnectionStatus, Paginated, SettingsMap } from '@shared/types'
import { connectionStore, type ConnectionStore } from './connection.service'
import { remoteClient, fetchJson } from './remote.client'
import type { RemoteEndpoint } from './remote.client'
import type { Services } from '../ipc/types'

export interface UserServicesResult {
  services: Services
  getConnection: () => ConnectionConfig | null
  store: ConnectionStore
}

const NOT_AVAILABLE = 'This feature is only available on an Admin installation'

function queryString(filters: BookFilters | Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'object' && !Array.isArray(value)) continue
    params.set(key, String(value))
  }
  const out = params.toString()
  return out ? `?${out}` : ''
}

export function buildUserServices(appDirs: AppDirs): UserServicesResult {
  const store = connectionStore(appDirs.userData)
  const getConnection = (): ConnectionConfig | null => store.get()
  const client: RemoteEndpoint = remoteClient(getConnection)

  const requireRemote = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((err) => {
      throw err instanceof Error ? err : new Error('The library server is unavailable')
    })

  const settingsLike: Services['settings'] = {
    async getAll(): Promise<SettingsMap> {
      try {
        const info = await fetchJson<{
          name: string
          address: string
          contact_info: string
          logo: string | null
        }>(client, '/api/v1/library')
        return {
          library_name: info.name,
          library_logo: info.logo,
          library_address: info.address,
          contact_info: info.contact_info,
          theme: 'light'
        }
      } catch {
        return {
          library_name: 'Library Catalog',
          library_logo: null,
          library_address: '',
          contact_info: '',
          theme: 'light'
        }
      }
    },
    async set(): Promise<void> {
      throw new Error(NOT_AVAILABLE)
    }
  }

  const services: Services = {
    dirs: appDirs,
    installInfo: async () => ({
      mode: 'user',
      dataDir: '',
      legacySqlitePath: null,
      postgres: { managed: false, port: 0, database: '' },
      apiPort: getConnection()?.port ?? 47821
    }),
    mode: async () => 'user',
    auth: null,
    settings: settingsLike,
    images: null,
    backup: null,
    books: {
      list: (filters: BookFilters) =>
        requireRemote(
          fetchJson<Paginated<Book>>(client, `/api/v1/books${queryString(filters ?? {})}`)
        ),
      get: (id: number) => {
        if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid book id')
        return requireRemote(fetchJson<Book>(client, `/api/v1/books/${id}`))
      },
      create: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      update: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      archive: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      restore: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      delete: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      stats: async () => {
        const page = await requireRemote(
          fetchJson<Paginated<Book>>(client, '/api/v1/books?page=1&pageSize=6&sort=recent')
        )
        return {
          totalBooks: page.total,
          totalCopies: 0,
          availableCopies: 0,
          borrowedCopies: 0,
          authors: 0,
          categories: 0,
          publishers: 0,
          activeBorrowings: 0,
          overdueBooks: 0,
          recentBooks: page.items
        }
      }
    },
    authors: {
      list: () => requireRemote(fetchJson(client, '/api/v1/authors')),
      create: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      update: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      archive: async () => {
        throw new Error(NOT_AVAILABLE)
      }
    },
    categories: {
      list: () => requireRemote(fetchJson(client, '/api/v1/categories')),
      create: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      update: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      archive: async () => {
        throw new Error(NOT_AVAILABLE)
      }
    },
    publishers: {
      list: () => requireRemote(fetchJson(client, '/api/v1/publishers')),
      create: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      update: async () => {
        throw new Error(NOT_AVAILABLE)
      },
      archive: async () => {
        throw new Error(NOT_AVAILABLE)
      }
    },
    borrowings: null,
    network: null,
    database: null,
    connection: {
      get: async () => store.get(),
      save: async (config) => store.save(config),
      test: async (config): Promise<ConnectionStatus> => store.test(config),
      reset: async () => store.reset(),
      discover: async () => store.discover(),
      setRemoteUrl: async (url) => store.setRemoteUrl(url)
    },
    isAuthenticated: async () => false,
    openPath: async () => {
      throw new Error(NOT_AVAILABLE)
    },
    restart: () => undefined,
    broadcastSettings: () => undefined,
    broadcastSession: () => undefined
  }

  return { services, getConnection, store }
}