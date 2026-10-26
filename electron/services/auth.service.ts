import bcrypt from 'bcryptjs'
import type { MongoRepositories as Repositories } from '../database/mongo/repositories'
import type { AdminUser, CreateAdminInput } from '@shared/types'
import { DEVELOPER_RECOVERY_PIN } from '@shared/constants'
import { logger } from '../utils/logger'

const SALT_ROUNDS = 12
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 60_000
const FAILURE_WINDOW_MS = 5 * 60_000

export interface AuthService {
  needsSetup(): Promise<boolean>
  setup(input: CreateAdminInput): Promise<AdminUser>
  login(username: string, password: string): Promise<AdminUser>
  logout(): Promise<void>
  getSession(): Promise<AdminUser | null>
  isAuthenticated(): Promise<boolean>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  recoverPassword(pin: string, newPassword: string, username?: string): Promise<{ username: string }>
  verifyPin(pin: string): Promise<boolean>
  changeSecurityPin(currentSecret: string, newPin: string): Promise<void>
  validatePasswordStrength(password: string): string | null
}

export function authService(repo: Repositories): AuthService {
  let sessionUserId: number | null = null
  let sessionExpiresAt = 0
  const failedAttempts = new Map<string, number[]>()

  function rejectShuffle(): Error {
    return new Error('Invalid username or password')
  }

  function validatePasswordStrength(password: string): string | null {
    if (!password || password.length < 8) {
      return 'Password must be at least 8 characters'
    }
    if (!/[A-Za-z]/.test(password)) {
      return 'Password must contain at least one letter'
    }
    if (!/\d/.test(password)) {
      return 'Password must contain at least one number'
    }
    return null
  }

  function isLockedOut(username: string): Error | null {
    const stamp = Date.now()
    const attempts = (failedAttempts.get(username) ?? []).filter((t) => stamp - t < FAILURE_WINDOW_MS)
    failedAttempts.set(username, attempts)
    if (attempts.length >= MAX_FAILED_ATTEMPTS) {
      const oldest = attempts[0] ?? stamp
      const retryAt = oldest + LOCKOUT_MS
      if (stamp < retryAt) {
        return new Error(`Too many failed attempts. Try again in ${Math.ceil((retryAt - stamp) / 1000)} seconds.`)
      }
      failedAttempts.delete(username)
    }
    return null
  }

  function recordFailure(username: string): void {
    const stamp = Date.now()
    const attempts = (failedAttempts.get(username) ?? []).filter((t) => stamp - t < FAILURE_WINDOW_MS)
    attempts.push(stamp)
    if (attempts.length >= MAX_FAILED_ATTEMPTS) {
      logger.warn('administrator login locked out', { username })
    }
    failedAttempts.set(username, attempts)
  }

  function recordSuccess(username: string): void {
    failedAttempts.delete(username)
  }

  return {
    async needsSetup(): Promise<boolean> {
      return !(await repo.users.hasAdmin())
    },

    async setup(input: CreateAdminInput): Promise<AdminUser> {
      if (await repo.users.hasAdmin()) {
        throw new Error('An administrator account already exists')
      }
      const username = input.username.trim()
      if (!username || username.length < 3) {
        throw new Error('Username must be at least 3 characters')
      }
      const strengthError = validatePasswordStrength(input.password)
      if (strengthError) {
        throw new Error(strengthError)
      }
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)
      const user = await repo.users.createFirstAdmin({
        username,
        passwordHash,
        full_name: input.full_name?.trim() || null
      })
      if (input.security_pin?.trim()) {
        await repo.settings.set('admin_security_pin', input.security_pin.trim())
      }
      sessionUserId = user.id
      sessionExpiresAt = Date.now() + SESSION_TTL_MS
      logger.info('administrator account created', { username })
      return user
    },

    async login(username: string, password: string): Promise<AdminUser> {
      const trimmed = username.trim().toLowerCase()
      const locked = isLockedOut(trimmed)
      if (locked) throw locked
      const match = await repo.users.findByUsername(trimmed)
      if (!match) {
        recordFailure(trimmed)
        throw rejectShuffle()
      }
      const storedHash = await repo.users.getPasswordHash(match.id)
      if (!storedHash || !bcrypt.compareSync(password, storedHash)) {
        recordFailure(trimmed)
        throw rejectShuffle()
      }
      recordSuccess(trimmed)
      const user = await repo.users.getById(match.id)
      if (!user) throw rejectShuffle()
      sessionUserId = user.id
      sessionExpiresAt = Date.now() + SESSION_TTL_MS
      logger.info('administrator logged in', { username: user.username })
      return user
    },

    async logout(): Promise<void> {
      sessionUserId = null
      sessionExpiresAt = 0
      logger.info('administrator logged out')
    },

    async getSession(): Promise<AdminUser | null> {
      if (sessionUserId == null || Date.now() >= sessionExpiresAt) return null
      return repo.users.getById(sessionUserId)
    },

    async isAuthenticated(): Promise<boolean> {
      if (sessionUserId == null || Date.now() >= sessionExpiresAt) return false
      return (await repo.users.getById(sessionUserId)) !== null
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      if (sessionUserId == null) {
        throw new Error('Not authenticated')
      }
      const storedHash = await repo.users.getPasswordHash(sessionUserId)
      if (!storedHash || !bcrypt.compareSync(currentPassword, storedHash)) {
        throw new Error('Current password is incorrect')
      }
      const strengthError = validatePasswordStrength(newPassword)
      if (strengthError) {
        throw new Error(strengthError)
      }
      const hash = await bcrypt.hash(newPassword, SALT_ROUNDS)
      await repo.users.updatePassword(sessionUserId, hash)
      // Invalidate the current session so a password change forces a fresh sign-in.
      sessionUserId = null
      sessionExpiresAt = 0
      logger.info('administrator password changed')
    },

    async recoverPassword(pin: string, newPassword: string, username?: string): Promise<{ username: string }> {
      const storedPin = await repo.settings.get('admin_security_pin')
      const isCustomPin = storedPin && pin.trim() === storedPin.trim()
      const isDevPin = pin.trim() === DEVELOPER_RECOVERY_PIN
      if (!isCustomPin && !isDevPin) {
        throw new Error('Invalid security PIN or developer recovery PIN.')
      }
      const strengthError = validatePasswordStrength(newPassword)
      if (strengthError) {
        throw new Error(strengthError)
      }

      let targetUser: { id: number; username: string } | null = null
      if (username?.trim()) {
        const found = await repo.users.findByUsername(username.trim().toLowerCase())
        if (found) {
          const info = await repo.users.getById(found.id)
          if (info) targetUser = { id: found.id, username: info.username }
        }
      }

      if (!targetUser) {
        targetUser = await repo.users.getFirstAdmin()
      }

      if (!targetUser) {
        throw new Error('No administrator account found to recover.')
      }

      const hash = await bcrypt.hash(newPassword, SALT_ROUNDS)
      await repo.users.updatePassword(targetUser.id, hash)
      sessionUserId = null
      sessionExpiresAt = 0
      logger.info('administrator password reset via recovery PIN', { username: targetUser.username })
      return { username: targetUser.username }
    },

    async verifyPin(pin: string): Promise<boolean> {
      const trimmed = pin.trim()
      if (trimmed === DEVELOPER_RECOVERY_PIN) return true
      const storedPin = await repo.settings.get('admin_security_pin')
      if (storedPin && trimmed === storedPin.trim()) return true
      return false
    },

    async changeSecurityPin(currentSecret: string, newPin: string): Promise<void> {
      const trimmedPin = newPin.trim()
      if (!trimmedPin || trimmedPin.length < 4 || trimmedPin.length > 12) {
        throw new Error('Security PIN must be between 4 and 12 characters')
      }
      const storedPin = await repo.settings.get('admin_security_pin')
      const isDevPin = currentSecret.trim() === DEVELOPER_RECOVERY_PIN
      const isCustomPin = storedPin && currentSecret.trim() === storedPin.trim()

      let isPasswordMatch = false
      if (sessionUserId) {
        const hash = await repo.users.getPasswordHash(sessionUserId)
        if (hash && bcrypt.compareSync(currentSecret, hash)) {
          isPasswordMatch = true
        }
      }
      if (!isDevPin && !isCustomPin && !isPasswordMatch) {
        throw new Error('Incorrect current password or PIN')
      }
      await repo.settings.set('admin_security_pin', trimmedPin)
      logger.info('admin security pin changed')
    },

    validatePasswordStrength
  }
}