import { IPC } from '@shared/api'
import type { ConnectionConfig } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerConnectionsIpc({ connection, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }
  const svc = requireService(connection, 'Connection settings')

  registerIpc(IPC.connectionGet, () => svc.get(), { context: ctx })
  registerIpc(
    IPC.connectionSave,
    (config: ConnectionConfig) => {
      validateConfig(config)
      svc.save(config)
    },
    { context: ctx }
  )
  registerIpc(
    IPC.connectionTest,
    (config: ConnectionConfig) => {
      validateConfig(config)
      return svc.test(config)
    },
    { context: ctx }
  )
  registerIpc(IPC.connectionReset, () => svc.reset(), { context: ctx })
  registerIpc(IPC.connectionDiscover, () => svc.discover(), { context: ctx })
  registerIpc(IPC.connectionSetRemoteUrl, (url: string | null) => svc.setRemoteUrl(url), { context: ctx })
}

function validateConfig(config: ConnectionConfig): void {
  if (!config || typeof config !== 'object') throw new Error('Invalid request')
  if (typeof config.host !== 'string' || !config.host.trim()) throw new Error('Server address is required')
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('Port must be between 1 and 65535')
  }
}