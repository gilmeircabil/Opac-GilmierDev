import { registerAppIpc } from './app.ipc'
import { registerAuthIpc } from './auth.ipc'
import { registerBooksIpc } from './books.ipc'
import { registerAuthorsIpc } from './authors.ipc'
import { registerCategoriesIpc } from './categories.ipc'
import { registerPublishersIpc } from './publishers.ipc'
import { registerBorrowingsIpc } from './borrowings.ipc'
import { registerBackupIpc } from './backup.ipc'
import { registerImagesIpc } from './images.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerConnectionsIpc } from './connections.ipc'
import { registerNetworkIpc } from './network.ipc'
import { registerDatabaseIpc } from './database.ipc'
import type { Services } from './types'

export function registerAllIpc(services: Services): void {
  registerAppIpc(services)
  if (services.auth) registerAuthIpc(services)
  registerBooksIpc(services)
  registerAuthorsIpc(services)
  registerCategoriesIpc(services)
  registerPublishersIpc(services)
  if (services.borrowings) registerBorrowingsIpc(services)
  if (services.backup) registerBackupIpc(services)
  registerImagesIpc(services)
  registerSettingsIpc(services)
  if (services.connection) registerConnectionsIpc(services)
  if (services.network) registerNetworkIpc(services)
  registerDatabaseIpc(services)
}