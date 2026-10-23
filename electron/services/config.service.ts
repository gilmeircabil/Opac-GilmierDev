import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { SystemDirs } from '../config/paths'
import { logger } from '../utils/logger'
import { encryptSecret, decryptSecret } from '../utils/crypto'

export interface AdminConfig {
  apiPort: number
  serverEnabled: boolean
  autoStartServer: boolean
  mongoUri: string
  mongoDbName: string
}

export function defaultAdminConfig(): AdminConfig {
  return {
    apiPort: 47821,
    serverEnabled: true,
    autoStartServer: true,
    mongoUri: process.env.OPAC_MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/opac',
    mongoDbName: process.env.OPAC_MONGO_DB || 'opac'
  }
}

function isInRange(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535
}

export function loadAdminConfig(configFile: string): AdminConfig {
  const cfg = defaultAdminConfig()
  try {
    if (existsSync(configFile)) {
      const raw = JSON.parse(readFileSync(configFile, 'utf8')) as Record<string, unknown>
      if (typeof raw.apiPort === 'number' && isInRange(raw.apiPort)) cfg.apiPort = Math.trunc(raw.apiPort)
      if (typeof raw.serverEnabled === 'boolean') cfg.serverEnabled = raw.serverEnabled
      if (typeof raw.autoStartServer === 'boolean') cfg.autoStartServer = raw.autoStartServer
      if (typeof raw.mongoUri === 'string' && raw.mongoUri.trim()) {
        try {
          cfg.mongoUri = decryptSecret(raw.mongoUri.trim())
        } catch {
          cfg.mongoUri = raw.mongoUri.trim()
        }
      }
      if (typeof raw.mongoDbName === 'string' && raw.mongoDbName.trim()) {
        cfg.mongoDbName = raw.mongoDbName.trim()
      }
    }
  } catch (err) {
    logger.error('failed to load configuration, using defaults', err)
  }
  if (process.env.OPAC_MONGO_URI) cfg.mongoUri = process.env.OPAC_MONGO_URI
  if (process.env.MONGODB_URI) cfg.mongoUri = process.env.MONGODB_URI
  if (process.env.OPAC_MONGO_DB) cfg.mongoDbName = process.env.OPAC_MONGO_DB
  return cfg
}

export function saveAdminConfig(configFile: string, cfg: AdminConfig): void {
  const data = {
    apiPort: cfg.apiPort,
    serverEnabled: cfg.serverEnabled,
    autoStartServer: cfg.autoStartServer,
    mongoUri: cfg.mongoUri ? encryptSecret(cfg.mongoUri) : '',
    mongoDbName: cfg.mongoDbName || 'opac'
  }
  writeFileSync(configFile, JSON.stringify(data, null, 2), 'utf8')
}

export interface ConfigStore {
  get(): AdminConfig
  setPort(port: number): void
  setServerEnabled(enabled: boolean): void
  setAutoStart(autoStart: boolean): void
  setMongoConfig(mongoUri: string, mongoDbName?: string): void
}

export function configStore(dirs: SystemDirs): ConfigStore {
  return {
    get(): AdminConfig {
      return loadAdminConfig(dirs.configFile)
    },
    setPort(port: number): void {
      if (!isInRange(port)) throw new Error('API port must be between 1024 and 65535')
      const cfg = this.get()
      cfg.apiPort = port
      saveAdminConfig(dirs.configFile, cfg)
      logger.info('API port configured', { port })
    },
    setServerEnabled(enabled: boolean): void {
      const cfg = this.get()
      cfg.serverEnabled = enabled
      saveAdminConfig(dirs.configFile, cfg)
      logger.info('server enabled state set', { enabled })
    },
    setAutoStart(autoStart: boolean): void {
      const cfg = this.get()
      cfg.autoStartServer = autoStart
      saveAdminConfig(dirs.configFile, cfg)
      logger.info('auto-start server set', { autoStart })
    },
    setMongoConfig(mongoUri: string, mongoDbName?: string): void {
      const cleanUri = mongoUri.trim()
      if (!/^mongodb(\+srv)?:\/\//i.test(cleanUri)) {
        throw new Error('MongoDB URI must start with mongodb:// or mongodb+srv://')
      }
      const cfg = this.get()
      cfg.mongoUri = cleanUri
      if (mongoDbName && mongoDbName.trim()) {
        cfg.mongoDbName = mongoDbName.trim()
      }
      saveAdminConfig(dirs.configFile, cfg)
      logger.info('MongoDB configuration updated')
    }
  }
}
