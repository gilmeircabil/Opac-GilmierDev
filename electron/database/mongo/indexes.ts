import type { MongoDb } from './client'
import { logger } from '../../utils/logger'

export const CURRENT_MONGO_SCHEMA_VERSION = 1

export async function ensureMongoIndexes(mongo: MongoDb): Promise<number> {
  const { db } = mongo

  try {
    await Promise.all([
      db.collection('authors').createIndex({ id: 1 }, { unique: true }),
      db.collection('authors').createIndex({ name_lower: 1 }, { unique: true }),
      db.collection('authors').createIndex({ is_archived: 1 }),

      db.collection('categories').createIndex({ id: 1 }, { unique: true }),
      db.collection('categories').createIndex({ name_lower: 1 }, { unique: true }),
      db.collection('categories').createIndex({ is_archived: 1 }),

      db.collection('publishers').createIndex({ id: 1 }, { unique: true }),
      db.collection('publishers').createIndex({ name_lower: 1 }, { unique: true }),
      db.collection('publishers').createIndex({ is_archived: 1 }),

      db.collection('books').createIndex({ id: 1 }, { unique: true }),
      db.collection('books').createIndex(
        { isbn_lower: 1 },
        { unique: true, partialFilterExpression: { isbn_lower: { $type: 'string', $gt: '' } } }
      ),
      db.collection('books').createIndex({ author_id: 1 }),
      db.collection('books').createIndex({ category_id: 1 }),
      db.collection('books').createIndex({ publisher_id: 1 }),
      db.collection('books').createIndex({ is_archived: 1 }),
      db.collection('books').createIndex({ available_copies: 1 }),
      db.collection('books').createIndex({ publication_year: 1 }),
      db.collection('books').createIndex({ created_at: -1 }),

      db.collection('borrowings').createIndex({ id: 1 }, { unique: true }),
      db.collection('borrowings').createIndex({ book_id: 1 }),
      db.collection('borrowings').createIndex({ status: 1 }),
      db.collection('borrowings').createIndex({ borrowed_at: -1 }),

      db.collection('admin_users').createIndex({ id: 1 }, { unique: true }),
      db.collection('admin_users').createIndex({ username_lower: 1 }, { unique: true }),

      db.collection('settings').createIndex({ key: 1 }, { unique: true }),
      db.collection('images').createIndex({ filename: 1 }, { unique: true })
    ])

    await db.collection('schema_migrations').updateOne(
      { version: CURRENT_MONGO_SCHEMA_VERSION },
      {
        $setOnInsert: {
          version: CURRENT_MONGO_SCHEMA_VERSION,
          name: 'initial_mongo_schema',
          applied_at: new Date().toISOString()
        }
      },
      { upsert: true }
    )
    logger.info('mongodb indexes verified', { schemaVersion: CURRENT_MONGO_SCHEMA_VERSION })
    return CURRENT_MONGO_SCHEMA_VERSION
  } catch (err) {
    logger.warn('failed to create some mongodb indexes', err)
    return CURRENT_MONGO_SCHEMA_VERSION
  }
}

export async function currentMongoSchemaVersion(mongo: MongoDb): Promise<number> {
  try {
    const doc = await mongo.db
      .collection<{ version: number }>('schema_migrations')
      .find()
      .sort({ version: -1 })
      .limit(1)
      .next()
    return doc?.version ?? CURRENT_MONGO_SCHEMA_VERSION
  } catch {
    return CURRENT_MONGO_SCHEMA_VERSION
  }
}
