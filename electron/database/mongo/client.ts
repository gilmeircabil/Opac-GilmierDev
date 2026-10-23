import { MongoClient, type Db as MongoNativeDb } from 'mongodb'
import { logger } from '../../utils/logger'

export interface MongoConnectionOptions {
  uri: string
  dbName?: string
}

export interface MongoDb {
  client: MongoClient
  db: MongoNativeDb
  uri: string
  dbName: string
  nextSeq(sequenceName: string): Promise<number>
  setSeqIfGreater(sequenceName: string, value: number): Promise<void>
  end(): Promise<void>
}

interface CounterDoc {
  _id: string
  seq: number
}

function extractDbNameFromUri(uri: string): string {
  try {
    const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '')
    const slashIdx = withoutScheme.indexOf('/')
    if (slashIdx === -1) return 'opac'
    const afterSlash = withoutScheme.slice(slashIdx + 1)
    const qIdx = afterSlash.indexOf('?')
    const name = (qIdx === -1 ? afterSlash : afterSlash.slice(0, qIdx)).trim()
    return name || 'opac'
  } catch {
    return 'opac'
  }
}

export async function connectMongoDb(options: MongoConnectionOptions): Promise<MongoDb> {
  const uri = options.uri.trim() || 'mongodb://127.0.0.1:27017/opac'
  const dbName = options.dbName || extractDbNameFromUri(uri)

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    appName: 'opac-library-system'
  })

  await client.connect()
  const db = client.db(dbName)

  client.on('error', (err) => {
    logger.error('mongodb client error', err)
  })

  const counters = db.collection<CounterDoc>('counters')

  return {
    client,
    db,
    uri,
    dbName,
    async nextSeq(sequenceName: string): Promise<number> {
      const res = await counters.findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      )
      return res?.seq ?? 1
    },
    async setSeqIfGreater(sequenceName: string, value: number): Promise<void> {
      const existing = await counters.findOne({ _id: sequenceName })
      if (!existing || existing.seq < value) {
        await counters.updateOne(
          { _id: sequenceName },
          { $set: { seq: value } },
          { upsert: true }
        )
      }
    },
    async end(): Promise<void> {
      await client.close().catch((err) => {
        logger.warn('error closing mongodb client', err)
      })
    }
  }
}
