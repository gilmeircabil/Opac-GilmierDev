import bcrypt from 'bcryptjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSystemDirs } from './config/paths'
import { configStore } from './services/config.service'
import { connectMongoDb } from './database/mongo/client'
import { mongoRepositories } from './database/mongo/repositories'

export interface ResetPasswordOptions {
  newPassword?: string
  username?: string
}

export async function runResetPassword(options: ResetPasswordOptions = {}): Promise<{
  username: string
  newPassword: string
}> {
  const password = options.newPassword || 'Admin1234!'
  const systemDirs = getSystemDirs()
  const cfg = configStore(systemDirs).get()

  const mongo = await connectMongoDb({
    uri: cfg.mongoUri,
    dbName: cfg.mongoDbName
  })

  try {
    const repo = mongoRepositories(mongo)
    const targetUsername = options.username || 'admin'
    let user = await repo.users.findByUsername(targetUsername)

    if (!user) {
      const firstRow = await repo.users.getFirstAdmin()
      if (!firstRow) {
        throw new Error(
          'No administrator account found in the MongoDB database. Please launch the app to set up the first administrator.'
        )
      }
      user = { id: Number(firstRow.id) }
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await repo.users.updatePassword(user.id, passwordHash)

    const userInfo = await repo.users.getById(user.id)
    const resultUsername = userInfo?.username ?? targetUsername

    const resultMessage = [
      '====================================================',
      'OPAC LIBRARY SYSTEM - ADMIN PASSWORD RESET (MONGODB)',
      '====================================================',
      `Username:     ${resultUsername}`,
      `New Password: ${password}`,
      '====================================================',
      'You can now log in to the Admin Dashboard with these credentials.'
    ].join('\n')

    console.log(resultMessage)

    try {
      writeFileSync(join(process.cwd(), '.password-reset.txt'), `${resultMessage}\n`, 'utf8')
    } catch {
      // ignore
    }

    return {
      username: resultUsername,
      newPassword: password
    }
  } finally {
    await mongo.end()
  }
}
