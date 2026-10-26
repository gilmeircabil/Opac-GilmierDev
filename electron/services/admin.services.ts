import { app, shell } from 'electron'
import type { AppDirs, SystemDirs } from '../config/paths'
import { isPathWithin } from '../config/paths'
import type { MongoDb } from '../database/mongo/client'
import { connectMongoDb } from '../database/mongo/client'
import type { MongoRepositories } from '../database/mongo/repositories'
import { mongoRepositories } from '../database/mongo/repositories'
import { ensureMongoIndexes, currentMongoSchemaVersion } from '../database/mongo/indexes'
import { authService } from './auth.service'
import { settingsService } from './settings.service'
import { apiTokenService } from './api-token.service'
import { configStore } from './config.service'
import { networkService } from './server.service'
import { networkAdminService } from './network-admin.service'
import { bookImageService } from './book-image.service'
import { bookImportService } from './book-import.service'
import { backupService } from './backup.service'
import { connectionStore } from './connection.service'
import type { Services } from '../ipc/types'
import type { DatabaseStatus, MongoConfigInfo, MongoConfigInput } from '@shared/types'
import { logger } from '../utils/logger'

export interface AdminServicesResult {
  services: Services
  mongo: MongoDb
  repo: MongoRepositories
}

function maskMongoUri(uri: string): string {
  try {
    return uri.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:****@')
  } catch {
    return uri
  }
}

export function buildAdminServices(
  appDirs: AppDirs,
  systemDirs: SystemDirs,
  broadcastCallbacks: {
    broadcastSettings: () => void
    broadcastSession: () => void
  },
  mongoOverride?: { uri: string; dbName?: string }
): () => Promise<AdminServicesResult> {
  return async (): Promise<AdminServicesResult> => {
    const cfg = configStore(systemDirs)
    const currentCfg = cfg.get()
    const uri = mongoOverride?.uri || currentCfg.mongoUri
    const dbName = mongoOverride?.dbName || currentCfg.mongoDbName || 'opac'

    const mongo = await connectMongoDb({
      uri,
      dbName
    })

    await ensureMongoIndexes(mongo)
    const repo = mongoRepositories(mongo)

    const auth = authService(repo)
    const settings = settingsService(repo)
    const tokenService = apiTokenService(repo)
    const images = bookImageService(systemDirs.imagesDir, repo.images)
    const connStore = connectionStore(appDirs.userData)

    const networkDeps: any = {
      repos: repo,
      tokenService,
      imagesDir: systemDirs.imagesDir,
      libraryName: async () => (await settings.getAll()).library_name,
      libraryAddress: async () => (await settings.getAll()).library_address,
      libraryContact: async () => (await settings.getAll()).contact_info,
      libraryLogo: async () => (await settings.getAll()).library_logo
    }
    const network = networkService(networkDeps, () => cfg.get())

    const backup = backupService({
      mongo,
      imagesDir: systemDirs.imagesDir,
      backupsDir: systemDirs.backupsDir,
      getSchemaVersion: () => currentMongoSchemaVersion(mongo),
      getLibraryName: () => settings.getAll().then((s) => s.library_name)
    })

    const importer = bookImportService(repo)

    const databaseService = {
      async status(): Promise<DatabaseStatus> {
        const [schemaVersion, libraryName] = await Promise.all([
          currentMongoSchemaVersion(mongo),
          settings.getAll().then((s) => s.library_name)
        ])
        const c = cfg.get()
        return {
          connected: true,
          version: 'MongoDB',
          schemaVersion,
          libraryName,
          mongoUriMasked: maskMongoUri(c.mongoUri),
          mongoDbName: c.mongoDbName
        }
      },
      async clearCatalog(): Promise<void> {
        await repo.books.clearCatalog()
      },
      async getMongoConfig(): Promise<MongoConfigInfo> {
        const c = cfg.get()
        return {
          mongoUri: c.mongoUri,
          mongoDbName: c.mongoDbName
        }
      },
      async setMongoConfig(input: MongoConfigInput): Promise<{ ok: boolean; error?: string }> {
        try {
          const nextUri = (input.mongoUri || '').trim()
          const nextDb = (input.mongoDbName || 'opac').trim() || 'opac'
          cfg.setMongoConfig(nextUri, nextDb)
          return { ok: true }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
      async testMongoUri(input: MongoConfigInput): Promise<{ ok: boolean; version?: string; error?: string }> {
        try {
          const nextUri = (input.mongoUri || '').trim()
          if (!nextUri.startsWith('mongodb://') && !nextUri.startsWith('mongodb+srv://')) {
            return { ok: false, error: 'MongoDB URI must start with mongodb:// or mongodb+srv://' }
          }
          const nextDb = (input.mongoDbName || 'opac').trim() || 'opac'
          const testConn = await connectMongoDb({ uri: nextUri, dbName: nextDb })
          await testConn.end()
          return { ok: true, version: 'MongoDB Connected' }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      }
    }

    const services: Services = {
      dirs: {
        ...appDirs,
        imagesDir: systemDirs.imagesDir,
        backupsDir: systemDirs.backupsDir,
        logsDir: systemDirs.logsDir,
        dbPath: systemDirs.databaseDir
      },
      installInfo: async () => ({
        mode: 'admin',
        dataDir: systemDirs.root,
        legacySqlitePath: appDirs.dbPath,
        postgres: {
          managed: false,
          port: 27017,
          database: dbName
        },
        apiPort: cfg.get().apiPort
      }),
      mode: async () => 'admin',
      auth,
      settings,
      images,
      backup,
      books: {
        list: (filters) => repo.books.list(filters),
        get: (id) => repo.books.getById(id),
        create: (input) => repo.books.create(input),
        update: (id, input) => repo.books.update(id, input),
        archive: (id) => repo.books.archive(id),
        restore: (id) => repo.books.restore(id),
        delete: (id) => repo.books.delete(id),
        stats: () => repo.books.dashboardStats(),
        importParse: (input) => importer.parse(input),
        importRun: (input) => importer.run(input)
      },
      authors: repo.authors,
      categories: repo.categories,
      publishers: repo.publishers,
      borrowings: {
        list: (filters) => repo.borrowings.list(filters),
        create: (input) => repo.borrowings.create(input),
        return: (id) => repo.borrowings.recordReturn(id)
      },
      network: networkAdminService(network, tokenService, () => cfg.get().apiPort),
      database: databaseService,
      connection: {
        get: async () => connStore.get(),
        save: async (config) => {
          connStore.save(config)
          if (config.remote_url !== undefined) {
            network.setRemoteUrl(config.remote_url)
          }
        },
        test: async (config) => connStore.test(config),
        reset: async () => connStore.reset(),
        discover: async () => connStore.discover(),
        setRemoteUrl: async (url) => {
          connStore.setRemoteUrl(url)
          network.setRemoteUrl(url)
        }
      },
      isAuthenticated: () => auth.isAuthenticated(),
      openPath: async (path) => {
        if (typeof path !== 'string' || !path) throw new Error('Invalid path')
        const withinUserData = isPathWithin(appDirs.userData, path)
        const withinSystem = isPathWithin(systemDirs.root, path)
        if (!withinUserData && !withinSystem) {
          throw new Error('Refusing to open a path outside the application data directories')
        }
        const result = await shell.openPath(path)
        if (result) throw new Error(`Unable to open path: ${result}`)
      },
      restart: () => {
        app.relaunch()
        app.exit(0)
      },
      broadcastSettings: broadcastCallbacks.broadcastSettings,
      broadcastSession: broadcastCallbacks.broadcastSession
    }

    networkDeps.services = services
    logger.info('admin services initialised (MongoDB)', { database: dbName })
    return { services, mongo, repo }
  }
}
