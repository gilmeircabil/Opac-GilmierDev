import { app, BrowserWindow, protocol, net, session, dialog } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import { getAppDirs, ensureDirs, ensureSystemDirs, getSystemDirs, resolveImagePath } from './config/paths'
import { getAppMode } from './config/mode'
import type { AppMode, ConnectionConfig, MongoConfigInfo, MongoConfigInput } from '@shared/types'
import { initLogger, logger } from './utils/logger'
import { connectMongoDb, type MongoDb } from './database/mongo/client'
import { registerAllIpc } from './ipc'
import { setIpcSenderValidator } from './ipc/register'
import type { Services } from './ipc/types'
import { buildAdminServices } from './services/admin.services'
import { buildUserServices } from './services/user.services'
import { migrateSqliteFrom } from './services/migrate-sqlite.service'
import { configStore } from './services/config.service'
import { apiBaseUrl } from './services/remote.client'
import { firewallCommandFor } from './services/network-admin.service'
import { createAutoReconnectService } from './services/auto-reconnect.service'
import { IPC } from '@shared/api'

const IMAGE_SCHEME = 'opac-img'

protocol.registerSchemesAsPrivileged([
  {
    scheme: IMAGE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
])

let mainWindow: BrowserWindow | null = null
let backendServices: Services | null = null
let adminMongo: MongoDb | null = null
let getConnectionOverride: (() => ConnectionConfig | null) | null = null
let userAutoReconnect: { start(): void; stop(): void } | null = null

/** Restricts ipcMain.handle calls to the main frame of a real app window. */
function enableIpcSenderValidation(): void {
  setIpcSenderValidator((wc, event) => {
    if (wc.isDestroyed()) return false
    const frame = event.senderFrame
    if (!frame) return false
    const known = BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.webContents.id === wc.id)
    if (!known) return false
    return frame === wc.mainFrame
  })
}

function createWindow(): void {
  const iconPath = join(__dirname, '../../build/icon.ico')
  const iconPng = join(__dirname, '../../build/icon.png')
  const windowIcon = existsSync(iconPath) ? iconPath : existsSync(iconPng) ? iconPng : undefined

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    title: 'OPAC Library System',
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : pathToFileURL(join(__dirname, '../renderer/index.html')).toString()

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return
    if (!process.env.ELECTRON_RENDERER_URL && url === rendererUrl) return
    event.preventDefault()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerImageProtocol(appMode: AppMode): void {
  protocol.handle(IMAGE_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const conn = getConnectionOverride?.() ?? null

      // 1. If User mode or Admin connected to a remote server URL, fetch from remote API
      const isRemoteConfigured =
        conn &&
        conn.host &&
        conn.host !== '127.0.0.1' &&
        conn.host !== 'localhost'

      if (appMode === 'user' || isRemoteConfigured) {
        if (!conn || !conn.host) {
          return new Response('Not configured', { status: 503 })
        }
        const base = apiBaseUrl(conn)
        const remoteUrl = `${base}/api/v1/covers/${encodeURIComponent(filename)}`
        const headers: Record<string, string> = {}
        if (conn.token) {
          headers['Authorization'] = `Bearer ${conn.token}`
        }
        return net.fetch(remoteUrl, { headers })
      }

      // 2. If in-process backend has MongoDB image service, serve from MongoDB / disk
      if (backendServices?.images?.getBuffer) {
        const stored = await backendServices.images.getBuffer(filename)
        if (stored) {
          return new Response(new Uint8Array(stored.buffer), {
            status: 200,
            headers: { 'Content-Type': stored.mime }
          })
        }
      }

      // 3. Check local disk imagesDir
      const fullPath = resolveImagePath(getSystemDirs().imagesDir, filename)
      if (existsSync(fullPath)) {
        return net.fetch(pathToFileURL(fullPath).toString())
      }

      // 4. Fallback to local backend HTTP server (if running as a separate Windows service)
      const cfg = configStore(getSystemDirs()).get()
      return net.fetch(`http://127.0.0.1:${cfg.apiPort}/api/v1/covers/${encodeURIComponent(filename)}`)
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}

async function runBackend(): Promise<void> {
  const dirs = getAppDirs()
  const systemDirs = getSystemDirs()
  ensureDirs(dirs)
  ensureSystemDirs(systemDirs)
  initLogger({ logsDir: systemDirs.logsDir })

  if (backendServices?.network) {
    await backendServices.network.stop().catch(() => undefined)
  }
  if (adminMongo) {
    await adminMongo.end().catch(() => undefined)
    adminMongo = null
  }

  const build = buildAdminServices(dirs, systemDirs, {
    broadcastSettings: () => {},
    broadcastSession: () => {}
  })

  const { services, mongo, repo } = await build()
  backendServices = services
  adminMongo = mongo

  const legacySqlitePath = dirs.dbPath
  if (existsSync(legacySqlitePath)) {
    const report = await migrateSqliteFrom({
      mongo,
      repo,
      sqlitePath: legacySqlitePath,
      imagesDir: systemDirs.imagesDir
    })
    if (report.migrated) {
      logger.info('legacy SQLite data migrated to MongoDB', { counts: report.counts, warnings: report.warnings })
    }
  }

  try {
    await services.network?.start()
    logger.info('network server auto-started in backend mode')
  } catch (err) {
    logger.warn('network server start skipped or already bound', err)
  }
}

async function bootstrapAdmin(): Promise<void> {
  const dirs = getAppDirs()
  const systemDirs = getSystemDirs()
  ensureDirs(dirs)
  ensureSystemDirs(systemDirs)
  initLogger({ logsDir: dirs.logsDir })
  enableIpcSenderValidation()
  registerImageProtocol('admin')

  const { services, getConnection } = buildUserServices(dirs)
  getConnectionOverride = getConnection

  const cfgStore = configStore(systemDirs)

  // Try starting the local MongoDB backend in-process if not pointing to a remote server
  const conn = getConnection()
  const isRemoteHost =
    conn && conn.host && conn.host !== '127.0.0.1' && conn.host !== 'localhost'

  if (!isRemoteHost) {
    try {
      await runBackend()
    } catch (err) {
      logger.warn(
        'Could not auto-start local MongoDB backend on boot (MongoDB may not be running locally or remote server will be used)',
        err
      )
    }
  }

  services.mode = async () => 'admin'
  services.isAuthenticated = async () => true

  services.network = {
    status: async () => {
      if (backendServices?.network) {
        return backendServices.network.status()
      }
      const cfg = cfgStore.get()
      return {
        running: true,
        library: 'OPAC Library',
        databaseConnected: Boolean(adminMongo),
        host: conn?.host || '127.0.0.1',
        lanAddresses: [],
        apiPort: conn?.port || cfg.apiPort,
        apiVersion: '2.0.0',
        connectedUsers: 1
      }
    },
    start: async () => {
      if (!backendServices) {
        await runBackend()
      }
      return backendServices?.network ? backendServices.network.start() : services.network!.status()
    },
    stop: async () => {
      if (backendServices?.network) await backendServices.network.stop()
    },
    restart: async () => {
      if (backendServices?.network) return backendServices.network.restart()
      await runBackend()
      return services.network!.status()
    },
    setPort: async (port: number) => {
      if (backendServices?.network) return backendServices.network.setPort(port)
      cfgStore.setPort(port)
      return services.network!.status()
    },
    tokenInfo: async () => {
      if (backendServices?.network) return backendServices.network.tokenInfo()
      return { configured: false, label: '', created_at: null, last_used_at: null }
    },
    regenerateToken: async () => {
      if (backendServices?.network) return backendServices.network.regenerateToken()
      return { token: '', info: { configured: false, label: '', created_at: null, last_used_at: null } }
    },
    firewall: async () => {
      if (backendServices?.network) return backendServices.network.firewall()
      return {
        accessTokenConfigured: false,
        tokenLabel: '',
        suggestedFirewallCommand: firewallCommandFor(cfgStore.get().apiPort)
      }
    },
    setRemoteUrl: (url: string | null) => {
      if (backendServices?.network) {
        backendServices.network.setRemoteUrl(url)
      }
    }
  }

  services.database = {
    status: async () => {
      if (backendServices?.database) {
        return backendServices.database.status()
      }
      const c = cfgStore.get()
      return {
        connected: false,
        version: 'MongoDB (Disconnected)',
        schemaVersion: 1,
        libraryName: 'OPAC Library',
        mongoUriMasked: c.mongoUri.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:****@'),
        mongoDbName: c.mongoDbName
      }
    },
    clearCatalog: async () => {
      if (backendServices?.database) return backendServices.database.clearCatalog()
      throw new Error('Database not connected')
    },
    getMongoConfig: async (): Promise<MongoConfigInfo> => {
      const c = cfgStore.get()
      return { mongoUri: c.mongoUri, mongoDbName: c.mongoDbName }
    },
    setMongoConfig: async (input: MongoConfigInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const nextUri = (input.mongoUri || '').trim()
        const nextDb = (input.mongoDbName || 'opac').trim() || 'opac'
        cfgStore.setMongoConfig(nextUri, nextDb)
        await runBackend()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    testMongoUri: async (input: MongoConfigInput): Promise<{ ok: boolean; version?: string; error?: string }> => {
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

  registerAllIpc(services)

  finalizeBootstrap(dirs)
}

async function bootstrapUser(): Promise<void> {
  const dirs = getAppDirs()
  ensureDirs(dirs)
  initLogger({ logsDir: dirs.logsDir })
  enableIpcSenderValidation()
  registerImageProtocol('user')

  const { services, getConnection, store } = buildUserServices(dirs)
  getConnectionOverride = getConnection

  userAutoReconnect = createAutoReconnectService(store, (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.eventConnectionStatusChanged, event)
    }
  })
  userAutoReconnect.start()

  services.network = {
    status: async () => ({
      running: true,
      library: 'OPAC Library',
      databaseConnected: true,
      host: getConnection()?.host ?? 'localhost',
      lanAddresses: [],
      apiPort: getConnection()?.port ?? 47821,
      apiVersion: '2.0.0',
      connectedUsers: 0
    }),
    start: async () => services.network!.status(),
    stop: async () => {},
    restart: async () => services.network!.status(),
    setPort: async () => services.network!.status(),
    tokenInfo: async () => ({
      configured: false,
      label: '',
      created_at: null,
      last_used_at: null
    }),
    regenerateToken: async () => ({ token: '', info: await services.network!.tokenInfo() }),
    firewall: async () => ({
      accessTokenConfigured: false,
      tokenLabel: '',
      suggestedFirewallCommand: ''
    }),
    setRemoteUrl: () => {}
  }

  registerAllIpc(services)
  finalizeBootstrap(dirs)
}

async function finalizeBootstrap(dirs: { userData: string }): Promise<void> {
  await session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['clipboard-sanitized-write', 'clipboard-read']
    callback(allowed.includes(permission))
  })
  createWindow()
  logger.info('application started', {
    version: app.getVersion(),
    mode: getAppMode(),
    userData: dirs.userData
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (userAutoReconnect) {
    userAutoReconnect.stop()
    userAutoReconnect = null
  }
  if (backendServices?.network) {
    backendServices.network.stop().catch((err: unknown) => logger.warn('network server stop error', err))
  }
  if (adminMongo) {
    adminMongo.end().catch((err: unknown) => logger.warn('mongodb close error', err))
    adminMongo = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

const smokeFlagIndex = process.argv.indexOf('--smoke-test')
const smokeDirFlagIndex = process.argv.indexOf('--smoke-dir')
const resetPasswordFlagIndex = process.argv.indexOf('--reset-password')

app.whenReady().then(async () => {
  if (resetPasswordFlagIndex !== -1) {
    const nextArg = process.argv[resetPasswordFlagIndex + 1]
    const customPassword = nextArg && !nextArg.startsWith('-') ? nextArg : undefined
    try {
      const { runResetPassword } = await import('./reset-password')
      await runResetPassword({ newPassword: customPassword })
      app.exit(0)
    } catch (err) {
      console.error('[reset-password] FAILED:', err)
      logger.error('reset password failed', err)
      try {
        writeFileSync(
          join(process.cwd(), '.password-reset.txt'),
          `FAILED ${new Date().toISOString()}\n${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
        )
      } catch {
        // ignore diagnostics write failures
      }
      app.exit(1)
    }
    return
  }

  if (smokeFlagIndex !== -1) {
    const dir = smokeDirFlagIndex !== -1 ? process.argv[smokeDirFlagIndex + 1] : '.smoke-tmp'
    try {
      const { runSmoke } = await import('./smoke')
      await runSmoke({ dir })
      app.exit(0)
    } catch (err) {
      console.error('[smoke] FAILED:', err)
      logger.error('smoke test failed', err)
      try {
        writeFileSync(
          join(process.cwd(), '.smoke-failure.txt'),
          `FAILED ${new Date().toISOString()}\n${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
        )
      } catch {
        // ignore diagnostics write failures
      }
      app.exit(1)
    }
    return
  }

  const runBackendIndex = process.argv.indexOf('--run-backend')
  if (runBackendIndex !== -1) {
    try {
      await runBackend()
      return // keep process alive
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('failed to start backend', { message })
      app.exit(1)
    }
  }

  const mode = getAppMode()
  logger.info('boot mode', { mode })
  try {
    if (mode === 'admin') {
      await bootstrapAdmin()
    } else {
      await bootstrapUser()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('failed to start application', { message })
    dialog.showErrorBox('Unable to start', `${message}\n\nSee the log file for details.`)
    app.exit(1)
  }
})

process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', err)
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', reason)
})
