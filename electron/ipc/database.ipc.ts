import { IPC } from '@shared/api'
import type { MongoConfigInput } from '@shared/types'
import { registerIpc } from './register'
import { requireService } from './util'
import type { Services } from './types'

export function registerDatabaseIpc({ database, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(IPC.databaseStatus, () => requireService(database, 'Database status').status(), {
    context: ctx
  })
  registerIpc(IPC.databaseClearCatalog, () => requireService(database, 'Database').clearCatalog(), {
    context: ctx,
    requireAuth: true
  })
  registerIpc(
    IPC.databaseGetMongoConfig,
    () => {
      const svc = requireService(database, 'Database')
      if (!svc.getMongoConfig) throw new Error('MongoDB config service unavailable')
      return svc.getMongoConfig()
    },
    { context: ctx }
  )
  registerIpc(
    IPC.databaseSetMongoConfig,
    (input: MongoConfigInput) => {
      const svc = requireService(database, 'Database')
      if (!svc.setMongoConfig) throw new Error('MongoDB config service unavailable')
      return svc.setMongoConfig(input)
    },
    { context: ctx }
  )
  registerIpc(
    IPC.databaseTestMongoUri,
    (input: MongoConfigInput) => {
      const svc = requireService(database, 'Database')
      if (!svc.testMongoUri) throw new Error('MongoDB config service unavailable')
      return svc.testMongoUri(input)
    },
    { context: ctx }
  )
}
