import dgram from 'node:dgram'
import { lanAddresses } from './server.service'
import { logger } from '../utils/logger'

export const DISCOVERY_PORT = 47822
export const OPAC_MAGIC = 'OPAC_SERVER_BEACON'
export const OPAC_DISCOVER_MAGIC = 'OPAC_DISCOVER'

export interface DiscoveryServerConfig {
  getLibraryName: () => Promise<string>
  getApiPort: () => number
  getRemoteUrl: () => string | null
}

export interface DiscoveryServer {
  start(): Promise<void>
  stop(): Promise<void>
  broadcastNow(): Promise<void>
  setRemoteUrl(url: string | null): void
}

export function createDiscoveryServer(config: DiscoveryServerConfig): DiscoveryServer {
  let socket: dgram.Socket | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let currentRemoteUrl: string | null = config.getRemoteUrl()

  async function buildPayload(): Promise<Buffer> {
    let name = 'OPAC Library'
    try {
      name = await config.getLibraryName()
    } catch {
      // fallback
    }
    const data = {
      opac_magic: OPAC_MAGIC,
      library_name: name,
      port: config.getApiPort(),
      remote_url: currentRemoteUrl,
      addresses: lanAddresses(),
      api_version: '2.0.0',
      timestamp: Date.now()
    }
    return Buffer.from(JSON.stringify(data))
  }

  async function sendBroadcast(): Promise<void> {
    if (!socket) return
    try {
      const payload = await buildPayload()
      socket.send(payload, 0, payload.length, DISCOVERY_PORT, '255.255.255.255', (err) => {
        if (err && (err as NodeJS.ErrnoException).code !== 'ENETUNREACH') {
          logger.debug('Discovery beacon broadcast warning', err)
        }
      })
    } catch (err) {
      logger.debug('Discovery beacon send error', err)
    }
  }

  return {
    async start(): Promise<void> {
      if (socket) return
      return new Promise<void>((resolve) => {
        const s = dgram.createSocket({ type: 'udp4', reuseAddr: true })

        s.on('error', (err) => {
          logger.warn('Discovery UDP socket error', err)
          try {
            s.close()
          } catch {
            // ignore
          }
          socket = null
        })

        s.on('message', async (msg, rinfo) => {
          try {
            const text = msg.toString('utf8')
            if (text.includes(OPAC_DISCOVER_MAGIC)) {
              const reply = await buildPayload()
              s.send(reply, 0, reply.length, rinfo.port, rinfo.address, () => {})
            }
          } catch {
            // ignore malformed packets
          }
        })

        s.on('listening', () => {
          try {
            s.setBroadcast(true)
          } catch (err) {
            logger.warn('Unable to enable UDP broadcast flag', err)
          }
          socket = s
          timer = setInterval(() => {
            void sendBroadcast()
          }, 3500)
          void sendBroadcast()
          logger.info('Discovery beacon listening on UDP port', { port: DISCOVERY_PORT })
          resolve()
        })

        try {
          s.bind(DISCOVERY_PORT, '0.0.0.0')
        } catch (err) {
          logger.warn(`Could not bind UDP discovery socket on port ${DISCOVERY_PORT}`, err)
          resolve()
        }
      })
    },

    async stop(): Promise<void> {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (socket) {
        try {
          socket.close()
        } catch {
          // ignore
        }
        socket = null
      }
      logger.info('Discovery beacon server stopped')
    },

    async broadcastNow(): Promise<void> {
      await sendBroadcast()
    },

    setRemoteUrl(url: string | null): void {
      currentRemoteUrl = url && url.trim() ? url.trim().replace(/\/+$/, '') : null
      void sendBroadcast()
    }
  }
}
