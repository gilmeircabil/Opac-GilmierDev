import type { MongoDb } from '../client'
import type { Repositories as BaseRepositories } from '../../pg/repositories'
import { mongoUsersRepository } from './users.repository'
import { mongoSettingsRepository } from './settings.repository'
import { mongoAuthorsRepository } from './authors.repository'
import { mongoCategoriesRepository } from './categories.repository'
import { mongoPublishersRepository } from './publishers.repository'
import { mongoBooksRepository } from './books.repository'
import { mongoBorrowingsRepository } from './borrowings.repository'
import { mongoImagesRepository, type ImagesRepository } from './images.repository'

export interface MongoRepositories extends BaseRepositories {
  images: ImagesRepository
}

export function mongoRepositories(mongo: MongoDb): MongoRepositories {
  return {
    users: mongoUsersRepository(mongo),
    settings: mongoSettingsRepository(mongo),
    authors: mongoAuthorsRepository(mongo),
    categories: mongoCategoriesRepository(mongo),
    publishers: mongoPublishersRepository(mongo),
    books: mongoBooksRepository(mongo),
    borrowings: mongoBorrowingsRepository(mongo),
    images: mongoImagesRepository(mongo)
  }
}

export type { ImagesRepository }
