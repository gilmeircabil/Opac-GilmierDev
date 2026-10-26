import type { ConnectionConfig, ConnectionStateEvent } from '@shared/types'
import type { ConnectionStore } from './connection.service'
import { discoverAllServers } from './discovery-client.service'
import { logger } from '../utils/logger'

export interface AutoReconnectService {
  start(): void
  stop(): void
  triggerImmediateCheck(): Promise<boolean>
  getState(): { connected: boolean; reconnecting: boolean }
}

export function createAutoReconnectService(
  store: ConnectionStore,
  onStatusChange: (event: ConnectionStateEvent) => void
): AutoReconnectService {
  let timer: ReturnType<typeof setInterval> | null = null
  let isChecking = false
  let consecutiveFailures = 0
  let isConnected = false
  let isReconnecting = false

  async function checkOnce(): Promise<boolean> {
    if (isChecking) return isConnected
    isChecking = true

    try {
      const current = store.get() || { host: '127.0.0.1', port: 47821 }
      
      // 1. Try testing the current saved configuration
      const status = await store.test(current)
      if (status.ok) {
        consecutiveFailures = 0
        if (!isConnected || isReconnecting) {
          isConnected = true
          isReconnecting = false
          logger.info('Library server connection established/restored', {
            host: current.host,
            port: current.port,
            remote_url: current.remote_url
          })
          onStatusChange({
            connected: true,
            reconnecting: false,
            host: current.host,
            port: current.port,
            remote_url: current.remote_url,
            library_name: status.library_name
          })
        }
        return true
      }

      // If test failed
      consecutiveFailures++
      if (consecutiveFailures >= 2 && !isReconnecting) {
        isConnected = false
        isReconnecting = true
        logger.warn('Connection to library server lost. Searching for server on local network...')
        onStatusChange({
          connected: false,
          reconnecting: true,
          host: current.host,
          port: current.port
        })
      }

      // If we are in reconnecting mode, run multi-tier LAN discovery
      if (isReconnecting || consecutiveFailures >= 2) {
        const discovery = await discoverAllServers(current.port || 47821)
        if (discovery.found && discovery.servers.length > 0) {
          // Select the best server (prefer one with non-localhost IP if available)
          const target = discovery.servers.find((s) => s.host !== '127.0.0.1') || discovery.servers[0]
          
          // Determine if we should adopt the new LAN IP or the new Cloudflare remote_url
          const nextConfig: ConnectionConfig = {
            host: target.host,
            port: target.port,
            token: current.token,
            remote_url: target.remote_url || current.remote_url
          }

          // If the user's current host was a trycloudflare URL and the server reported a new remote_url
          if (/trycloudflare\.com/i.test(current.host) && target.remote_url && target.remote_url !== current.host) {
            nextConfig.host = target.remote_url
          }

          store.save(nextConfig)
          consecutiveFailures = 0
          isConnected = true
          isReconnecting = false

          logger.info('Discovered and automatically connected to library server!', {
            newHost: nextConfig.host,
            newPort: nextConfig.port,
            remoteUrl: nextConfig.remote_url,
            library: target.library_name
          })

          onStatusChange({
            connected: true,
            reconnecting: false,
            host: nextConfig.host,
            port: nextConfig.port,
            remote_url: nextConfig.remote_url,
            library_name: target.library_name
          })
          return true
        }
      }

      return false
    } catch (err) {
      logger.debug('Auto-reconnect check iteration error', err)
      return false
    } finally {
      isChecking = false
    }
  }

  return {
    start(): void {
      if (timer) return
      // Run immediately on boot
      void checkOnce()
      // Poll every 5 seconds
      timer = setInterval(() => {
        void checkOnce()
      }, 5000)
    },

    stop(): void {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    triggerImmediateCheck(): Promise<boolean> {
      return checkOnce()
    },

    getState(): { connected: boolean; reconnecting: boolean } {
      return { connected: isConnected, reconnecting: isReconnecting }
    }
  }
}
