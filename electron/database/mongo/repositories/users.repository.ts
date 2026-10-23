import type { MongoDb } from '../client'
import { nowIso, toIso } from './utils'
import type { AdminUser } from '@shared/types'

export interface AdminUserRecord {
  username: string
  passwordHash: string
  full_name?: string | null
}

interface AdminUserDoc {
  id: number
  username: string
  username_lower: string
  password_hash: string
  full_name: string | null
  created_at: string
  updated_at: string
}

export interface UsersRepository {
  hasAdmin(): Promise<boolean>
  count(): Promise<number>
  findByUsername(username: string): Promise<{ id: number } | null>
  create(input: AdminUserRecord): Promise<AdminUser>
  createFirstAdmin(input: AdminUserRecord): Promise<AdminUser>
  updatePassword(id: number, passwordHash: string): Promise<void>
  getById(id: number): Promise<AdminUser | null>
  getFirstAdmin(): Promise<{ id: number; username: string } | null>
  getPasswordHash(id: number): Promise<string | null>
}

export function mongoUsersRepository(mongo: MongoDb): UsersRepository {
  const col = mongo.db.collection<AdminUserDoc>('admin_users')

  function mapUser(doc: AdminUserDoc): AdminUser {
    return {
      id: Number(doc.id),
      username: doc.username,
      full_name: doc.full_name ?? null,
      created_at: toIso(doc.created_at)
    }
  }

  return {
    async hasAdmin(): Promise<boolean> {
      const c = await col.countDocuments()
      return c > 0
    },
    async count(): Promise<number> {
      return col.countDocuments()
    },
    async findByUsername(username: string): Promise<{ id: number } | null> {
      const lower = username.trim().toLowerCase()
      const doc = await col.findOne({
        $or: [{ username_lower: lower }, { username: { $regex: `^${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }]
      })
      return doc ? { id: Number(doc.id) } : null
    },
    async create(input: AdminUserRecord): Promise<AdminUser> {
      const username = input.username.trim()
      const lower = username.toLowerCase()
      const existing = await this.findByUsername(username)
      if (existing) throw new Error('An account with that username already exists')

      const id = await mongo.nextSeq('admin_users')
      const ts = nowIso()
      const doc: AdminUserDoc = {
        id,
        username,
        username_lower: lower,
        password_hash: input.passwordHash,
        full_name: input.full_name ?? null,
        created_at: ts,
        updated_at: ts
      }
      await col.insertOne(doc)
      return mapUser(doc)
    },
    async createFirstAdmin(input: AdminUserRecord): Promise<AdminUser> {
      return this.create(input)
    },
    async updatePassword(id: number, passwordHash: string): Promise<void> {
      await col.updateOne(
        { id },
        { $set: { password_hash: passwordHash, updated_at: nowIso() } }
      )
    },
    async getById(id: number): Promise<AdminUser | null> {
      const doc = await col.findOne({ id })
      return doc ? mapUser(doc) : null
    },
    async getFirstAdmin(): Promise<{ id: number; username: string } | null> {
      const doc = await col.find().sort({ id: 1 }).limit(1).next()
      return doc ? { id: Number(doc.id), username: doc.username } : null
    },
    async getPasswordHash(id: number): Promise<string | null> {
      const doc = await col.findOne({ id })
      return doc?.password_hash ?? null
    }
  }
}
