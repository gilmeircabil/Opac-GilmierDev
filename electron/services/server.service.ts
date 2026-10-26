import { networkInterfaces, hostname } from 'node:os'
import type { ApiServerDeps, ApiServer } from '../api/server'
import { buildApiServer, API_VERSION } from '../api/server'
import type { AdminConfig } from './config.service'
import { logger } from '../utils/logger'
import type { ServerStatus } from '@shared/types'
import { createDiscoveryServer, type DiscoveryServer } from './discovery-server.service'

export function lanAddresses(): string[] {
  const out: string[] = []
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        out.push(entry.address)
      }
    }
  }
  return out
}

export interface NetworkService {
  status(): Promise<ServerStatus>
  start(): Promise<ServerStatus>
  stop(): Promise<void>
  restart(): Promise<ServerStatus>
  setPort(port: number): Promise<ServerStatus>
  setRemoteUrl(url: string | null): void
}

interface ActiveServer {
  api: ApiServer
  discovery: DiscoveryServer
}

export function networkService(
  deps: Omit<ApiServerDeps, 'onRequest'>,
  getConfig: () => AdminConfig
): NetworkService {
  let active: ActiveServer | null = null
  let currentRemoteUrl: string | null = null
  const recentIps = new Map<string, number>()

  // Tracks requests per IP within a rolling window, used for the connected-user
  // counter reported to the admin UI.
  const onRequest = (ip: string): void => {
    const now = Date.now()
    recentIps.set(ip, now)
    for (const [key, last] of recentIps) {
      if (now - last > 60_000) recentIps.delete(key)
    }
  }

  const getFullDeps = (): ApiServerDeps => ({
    ...deps,
    getRemoteUrl: () => currentRemoteUrl,
    onRequest
  })

  async function buildLibrary(): Promise<string> {
    try {
      return await deps.libraryName()
    } catch {
      return 'OPAC Library'
    }
  }

  return {
    async status(): Promise<ServerStatus> {
      const cfg = getConfig()
      const library = await buildLibrary()
      return {
        running: Boolean(active),
        library,
        databaseConnected: true,
        host: hostname(),
        lanAddresses: lanAddresses(),
        apiPort: cfg.apiPort,
        apiVersion: API_VERSION,
        connectedUsers: recentIps.size
      }
    },
    async start(): Promise<ServerStatus> {
      if (active) return this.status()
      const cfg = getConfig()
      const api = await buildApiServer(getFullDeps())
      try {
        await api.instance.listen({ host: '0.0.0.0', port: cfg.apiPort })
      } catch (err) {
        await api.instance.close().catch(() => undefined)
        logger.error('failed to start API server', err)
        throw new Error(`Could not start the server on port ${cfg.apiPort}. The port may already be in use.`)
      }

      const discovery = createDiscoveryServer({
        getLibraryName: deps.libraryName,
        getApiPort: () => cfg.apiPort,
        getRemoteUrl: () => currentRemoteUrl
      })
      await discovery.start().catch((err) => {
        logger.warn('Discovery beacon start error', err)
      })

      active = { api, discovery }
      logger.info('API server started', { port: cfg.apiPort, apiVersion: API_VERSION })
      return this.status()
    },
    async stop(): Promise<void> {
      if (!active) return
      const { api, discovery } = active
      active = null
      recentIps.clear()
      await discovery.stop().catch(() => undefined)
      await api.instance.close().catch((err) => {
        logger.error('error stopping API server', err)
      })
      logger.info('API server stopped')
    },
    async restart(): Promise<ServerStatus> {
      await this.stop()
      return this.start()
    },
    setRemoteUrl(url: string | null): void {
      currentRemoteUrl = url && url.trim() ? url.trim().replace(/\/+$/, '') : null
      if (active?.discovery) {
        active.discovery.setRemoteUrl(currentRemoteUrl)
      }
    },
    async setPort(port: number): Promise<ServerStatus> {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error('API port must be between 1024 and 65535')
      }
      const cfg = getConfig()
      cfg.apiPort = port
      if (active) {
        return this.restart()
      }
      return this.status()
    }
  }
}

export type { ServerStatus } from '@shared/types'