import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'
import type { DiscoveredServer, ConnectionDiscoveryResult } from '@shared/types'
import { DISCOVERY_PORT, OPAC_MAGIC, OPAC_DISCOVER_MAGIC } from './discovery-server.service'
import { logger } from '../utils/logger'

export function getLocalIpv4Subnets(): string[] {
  const subnets: string[] = []
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && entry.address) {
        const parts = entry.address.split('.')
        if (parts.length === 4) {
          subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`)
        }
      }
    }
  }
  return Array.from(new Set(subnets))
}

async function verifyHttpServer(
  host: string,
  port: number,
  timeoutMs = 600
): Promise<{ ok: boolean; library_name: string; api_version?: string; remote_url?: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`http://${host}:${port}/api/v1/library`, {
      signal: controller.signal
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      name?: string
      api_version?: string
      remote_url?: string
    }
    if (json && typeof json === 'object') {
      return {
        ok: true,
        library_name: json.name || 'OPAC Library',
        api_version: json.api_version,
        remote_url: json.remote_url
      }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function probeUdpDiscovery(listenMs = 1200): Promise<DiscoveredServer[]> {
  return new Promise((resolve) => {
    const servers = new Map<string, DiscoveredServer>()
    let socket: dgram.Socket | null = null

    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    } catch {
      return resolve([])
    }

    const cleanup = () => {
      if (socket) {
        try {
          socket.close()
        } catch {
          // ignore
        }
        socket = null
      }
      resolve(Array.from(servers.values()))
    }

    const timeout = setTimeout(cleanup, listenMs)

    socket.on('error', () => {
      clearTimeout(timeout)
      cleanup()
    })

    socket.on('message', async (msg, rinfo) => {
      try {
        const text = msg.toString('utf8')
        const data = JSON.parse(text) as {
          opac_magic?: string
          library_name?: string
          port?: number
          remote_url?: string
          api_version?: string
        }
        if (data.opac_magic === OPAC_MAGIC) {
          const host = rinfo.address
          const port = data.port || 47821
          const key = `${host}:${port}`
          if (!servers.has(key)) {
            servers.set(key, {
              host,
              port,
              library_name: data.library_name || 'OPAC Library',
              api_version: data.api_version,
              remote_url: data.remote_url
            })
          }
        }
      } catch {
        // ignore malformed packets
      }
    })

    socket.on('listening', () => {
      try {
        socket?.setBroadcast(true)
        const payload = Buffer.from(JSON.stringify({ opac_magic: OPAC_DISCOVER_MAGIC }))
        socket?.send(payload, 0, payload.length, DISCOVERY_PORT, '255.255.255.255', () => {})
      } catch (err) {
        logger.debug('UDP probe send error', err)
      }
    })

    try {
      // Bind to an ephemeral port
      socket.bind(0)
    } catch {
      clearTimeout(timeout)
      cleanup()
    }
  })
}

export async function scanSubnetForServers(
  port = 47821,
  concurrency = 25,
  timeoutMs = 500
): Promise<DiscoveredServer[]> {
  const subnets = getLocalIpv4Subnets()
  const results: DiscoveredServer[] = []
  const candidates: string[] = []

  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) {
      candidates.push(`${subnet}.${i}`)
    }
  }

  // Also include localhost / 127.0.0.1
  candidates.unshift('127.0.0.1')

  for (let i = 0; i < candidates.length; i += concurrency) {
    const chunk = candidates.slice(i, i + concurrency)
    const promises = chunk.map(async (ip) => {
      const verified = await verifyHttpServer(ip, port, timeoutMs)
      if (verified) {
        return {
          host: ip,
          port,
          library_name: verified.library_name,
          api_version: verified.api_version,
          remote_url: verified.remote_url
        }
      }
      return null
    })

    const found = await Promise.all(promises)
    for (const item of found) {
      if (item && !results.some((r) => r.host === item.host && r.port === item.port)) {
        results.push(item)
      }
    }

    // If we found a valid remote LAN server (not just 127.0.0.1), we can break early
    if (results.some((r) => r.host !== '127.0.0.1')) {
      break
    }
  }

  return results
}

export async function discoverAllServers(preferredPort = 47821): Promise<ConnectionDiscoveryResult> {
  const discoveredMap = new Map<string, DiscoveredServer>()

  // Tier 1: Fast UDP Discovery
  try {
    const udpServers = await probeUdpDiscovery(1000)
    for (const s of udpServers) {
      discoveredMap.set(`${s.host}:${s.port}`, s)
    }
  } catch (err) {
    logger.debug('UDP discovery error', err)
  }

  // Tier 2: If UDP didn't find any external LAN servers, run fast Subnet Scan fallback
  const hasLanServer = Array.from(discoveredMap.values()).some((s) => s.host !== '127.0.0.1')
  if (!hasLanServer) {
    try {
      const scanned = await scanSubnetForServers(preferredPort, 30, 450)
      for (const s of scanned) {
        discoveredMap.set(`${s.host}:${s.port}`, s)
      }
    } catch (err) {
      logger.debug('Subnet scan error', err)
    }
  }

  // Double check and verify all discovered servers with HTTP
  const servers: DiscoveredServer[] = []
  for (const item of discoveredMap.values()) {
    const verified = await verifyHttpServer(item.host, item.port, 800)
    if (verified) {
      servers.push({
        ...item,
        library_name: verified.library_name || item.library_name,
        remote_url: verified.remote_url || item.remote_url,
        api_version: verified.api_version || item.api_version
      })
    }
  }

  return {
    found: servers.length > 0,
    servers
  }
}
