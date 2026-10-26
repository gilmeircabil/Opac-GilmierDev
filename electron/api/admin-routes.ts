import type { FastifyInstance } from 'fastify'
import type { Services } from '../ipc/types'
import type { BookFilters, BookInput, AdminUser, CreateAdminInput } from '@shared/types'
import { randomBytes } from 'node:crypto'

export interface AdminRoutesDeps {
  services: Services
}

// In-memory token store for Admin HTTP sessions
const ACTIVE_TOKENS = new Map<string, AdminUser>()

export function adminRoutes(fastify: FastifyInstance, deps: AdminRoutesDeps) {
  const { services } = deps

  // Admin Auth Middleware
  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0]
    if (!url.startsWith('/api/v1/admin/')) return
    if (url === '/api/v1/admin/auth/login') return
    if (url === '/api/v1/admin/auth/needs-setup') return
    if (url === '/api/v1/admin/auth/setup') return
    if (url === '/api/v1/admin/auth/recover') return
    if (url === '/api/v1/admin/auth/verify-pin') return
    if (url === '/api/v1/admin/auth/session') return

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' })
    }

    const token = authHeader.substring(7)
    const user = ACTIVE_TOKENS.get(token)
    if (!user) {
      return reply.code(401).send({ ok: false, error: 'Invalid or expired token' })
    }

    ;(request as any).adminUser = user
  })

  fastify.get('/api/v1/admin/auth/needs-setup', async () => {
    try {
      if (!services.auth) throw new Error('Auth service unavailable')
      const needs = await services.auth.needsSetup()
      return { ok: true, data: needs }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/auth/setup', async (request) => {
    try {
      const input = request.body as CreateAdminInput
      if (!services.auth) throw new Error('Auth service unavailable')
      const user = await services.auth.setup(input)
      const token = randomBytes(32).toString('hex')
      ACTIVE_TOKENS.set(token, user)
      return { ok: true, data: { user, token } }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/auth/login', async (request) => {
    try {
      const { username, password } = request.body as any
      if (!services.auth) throw new Error('Auth service unavailable')
      const user = await services.auth.login(username, password)
      const token = randomBytes(32).toString('hex')
      ACTIVE_TOKENS.set(token, user)
      return { ok: true, data: { user, token } }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/auth/recover', async (request) => {
    try {
      const { pin, newPassword, username } = request.body as {
        pin: string
        newPassword: string
        username?: string
      }
      if (!services.auth) throw new Error('Auth service unavailable')
      const result = await services.auth.recoverPassword(pin, newPassword, username)
      return { ok: true, data: result }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/auth/verify-pin', async (request) => {
    try {
      const { pin } = request.body as { pin: string }
      if (!services.auth) throw new Error('Auth service unavailable')
      const valid = await services.auth.verifyPin(pin ?? '')
      return { ok: true, data: valid }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/auth/logout', async (request) => {
    try {
      const token = request.headers.authorization?.substring(7)
      if (token) ACTIVE_TOKENS.delete(token)
      if (services.auth) await services.auth.logout()
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.get('/api/v1/admin/auth/session', async (request) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return { ok: true, data: null }
    }
    const token = authHeader.substring(7)
    const user = ACTIVE_TOKENS.get(token)
    return { ok: true, data: user || null }
  })

  // Remote image upload from Admin laptop (e.g. at a coffee shop) into MongoDB + server disk
  fastify.post('/api/v1/admin/images/upload', async (request) => {
    try {
      const { fileName, base64 } = request.body as { fileName: string; base64: string }
      if (!services.images?.uploadBase64) throw new Error('Image upload service unavailable')
      const result = await services.images.uploadBase64(fileName, base64)
      return { ok: true, data: result }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Books
  fastify.get('/api/v1/admin/books', async (request) => {
    try {
      const filters = request.query as BookFilters
      if (!services.books) throw new Error('Books service unavailable')
      const data = await services.books.list(filters)
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  fastify.post('/api/v1/admin/books', async (request) => {
    try {
      const input = request.body as BookInput
      if (!services.books) throw new Error('Books service unavailable')
      const data = await services.books.create(input)
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Generic RPC endpoint for all other Admin UI operations
  fastify.post('/api/v1/admin/rpc', async (request) => {
    try {
      const { service, method, args } = request.body as { service: string; method: string; args: any[] }

      const svc = (services as any)[service]
      if (!svc) throw new Error(`Service ${service} not found`)

      const fn = svc[method]
      if (typeof fn !== 'function') throw new Error(`Method ${method} not found on ${service}`)

      const result = await fn.apply(svc, args || [])
      return { ok: true, data: result }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })
}
