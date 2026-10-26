import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { ConnectionConfig, ConnectionDiscoveryResult, ConnectionStatus } from '@shared/types'
import { logger } from '../utils/logger'
import { encryptSecret, decryptSecret } from '../utils/crypto'
import { apiBaseUrl } from './remote.client'
import { discoverAllServers } from './discovery-client.service'

function connectionFilePath(userDataDir: string): string {
  return join(userDataDir, 'connection.json')
}

export interface ConnectionStore {
  get(): ConnectionConfig | null
  save(config: ConnectionConfig): void
  reset(): void
  test(config: ConnectionConfig): Promise<ConnectionStatus>
  discover(): Promise<ConnectionDiscoveryResult>
  setRemoteUrl(url: string | null): void
}

function sanitizeHost(host: string): string {
  return host.trim().replace(/\/+$/, '')
}

export function connectionStore(userDataDir: string): ConnectionStore {
  return {
    get(): ConnectionConfig | null {
      const file = connectionFilePath(userDataDir)
      try {
        if (!existsSync(file)) return { host: '127.0.0.1', port: 47821 }
        const raw = JSON.parse(readFileSync(file, 'utf8')) as {
          host?: unknown
          port?: unknown
          token?: unknown
          remote_url?: unknown
        }
        if (typeof raw.host !== 'string' || !raw.host.trim()) {
          return { host: '127.0.0.1', port: 47821 }
        }
        const port = typeof raw.port === 'number' && raw.port > 0 ? raw.port : 47821
        const token = typeof raw.token === 'string' && raw.token.trim() ? decryptSecret(raw.token) : undefined
        const remote_url = typeof raw.remote_url === 'string' && raw.remote_url.trim() ? sanitizeHost(raw.remote_url) : undefined
        return { host: sanitizeHost(raw.host), port, token, remote_url }
      } catch (err) {
        logger.error('failed to read connection configuration', err)
        return { host: '127.0.0.1', port: 47821 }
      }
    },
    save(config: ConnectionConfig): void {
      const clean: ConnectionConfig = {
        host: sanitizeHost(config.host),
        port: Number.isInteger(config.port) && config.port > 0 ? config.port : 47821,
        token: config.token && config.token.trim() ? encryptSecret(config.token.trim()) : undefined,
        remote_url: config.remote_url && config.remote_url.trim() ? sanitizeHost(config.remote_url) : undefined
      }
      writeFileSync(connectionFilePath(userDataDir), JSON.stringify(clean, null, 2), 'utf8')
      logger.info('connection configuration saved', { host: clean.host, port: clean.port, remote_url: clean.remote_url })
    },
    reset(): void {
      try {
        unlinkSync(connectionFilePath(userDataDir))
      } catch {
        // no-op when not present
      }
      logger.info('connection configuration reset')
    },
    setRemoteUrl(url: string | null): void {
      const current = this.get() || { host: '127.0.0.1', port: 47821 }
      current.remote_url = url && url.trim() ? sanitizeHost(url) : undefined
      this.save(current)
    },
    async discover(): Promise<ConnectionDiscoveryResult> {
      const current = this.get()
      return discoverAllServers(current?.port || 47821)
    },
    async test(config: ConnectionConfig): Promise<ConnectionStatus> {
      const host = sanitizeHost(config.host)
      const port = config.port || 47821
      if (!host) {
        return { ok: false, error: 'Enter the server address' }
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const headers: Record<string, string> = {}
        if (config.token?.trim()) {
          headers['Authorization'] = `Bearer ${config.token.trim()}`
        }
        const base = apiBaseUrl({ host, port, token: config.token })
        const res = await fetch(`${base}/api/v1/library`, {
          signal: controller.signal,
          headers
        })
        if (res.status === 401) {
          return { ok: false, error: 'Access unauthorized' }
        }
        if (!res.ok) {
          return { ok: false, error: `Server returned HTTP ${res.status}` }
        }
        const data = (await res.json()) as {
          name?: string
          address?: string
          contact_info?: string
          api_version?: string
          remote_url?: string
        }
        return {
          ok: true,
          library_name: data.name ?? 'OPAC Library',
          library_address: data.address ?? '',
          contact_info: data.contact_info ?? '',
          api_version: data.api_version,
          remote_url: data.remote_url
        }
      } catch (err) {
        const message =
          err instanceof Error && err.name === 'AbortError'
            ? 'Connection timed out'
            : 'Could not reach the library server'
        return { ok: false, error: message }
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
