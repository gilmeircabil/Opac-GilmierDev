import type { ApiTokenInfo, NetworkAccessInfo, ServerStatus } from '@shared/types'
import type { NetworkService } from './server.service'
import type { ApiTokenService } from './api-token.service'

export interface NetworkAdminService {
  status(): Promise<ServerStatus>
  start(): Promise<ServerStatus>
  stop(): Promise<void>
  restart(): Promise<ServerStatus>
  setPort(port: number): Promise<ServerStatus>
  setRemoteUrl(url: string | null): void
  tokenInfo(): Promise<ApiTokenInfo>
  regenerateToken(): Promise<{ token: string; info: ApiTokenInfo }>
  firewall(): Promise<NetworkAccessInfo>
}

export function firewallCommandFor(port: number): string {
  return `netsh advfirewall firewall add rule name="OPAC Library API" dir=in action=allow protocol=TCP localport=${port} profile=private && netsh advfirewall firewall add rule name="OPAC Library Discovery" dir=in action=allow protocol=UDP localport=47822 profile=private`
}

export function networkAdminService(
  network: NetworkService,
  token: ApiTokenService,
  getPort: () => number
): NetworkAdminService {
  return {
    status: () => network.status(),
    start: () => network.start(),
    stop: () => network.stop(),
    restart: () => network.restart(),
    setPort: (port) => network.setPort(port),
    setRemoteUrl: (url) => network.setRemoteUrl(url),
    tokenInfo: () => token.getInfo(),
    regenerateToken: async () => {
      const result = await token.regenerate()
      return result
    },
    firewall: async () => {
      const info = await token.getInfo()
      return {
        accessTokenConfigured: info.configured,
        tokenLabel: info.label,
        suggestedFirewallCommand: firewallCommandFor(getPort())
      }
    }
  }
}