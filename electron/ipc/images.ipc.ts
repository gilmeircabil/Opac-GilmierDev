import { IPC } from '@shared/api'
import { registerIpc } from './register'
import { requireService } from './util'
import { pickLocalImageAsBase64 } from '../services/book-image.service'
import type { Services } from './types'

export function registerImagesIpc({ images, isAuthenticated }: Services): void {
  const ctx = { isAuthenticated }

  registerIpc(
    IPC.imagesPickLocalBase64,
    async () => {
      try {
        const picked = await pickLocalImageAsBase64()
        if (!picked) return { canceled: true }
        return { canceled: false, fileName: picked.fileName, base64: picked.base64 }
      } catch (err) {
        return {
          canceled: false,
          error: err instanceof Error ? err.message : 'Unable to read image'
        }
      }
    },
    { context: ctx }
  )

  if (images) {
    const svc = requireService(images, 'Image management')
    registerIpc(IPC.imagesPickCover, () => svc.pickCover(), { context: ctx, requireAuth: true })
    registerIpc(IPC.imagesPickLogo, () => svc.pickLogo(), { context: ctx, requireAuth: true })
    registerIpc(
      IPC.imagesDelete,
      (filename: string) => {
        if (typeof filename !== 'string' || !filename) throw new Error('Invalid image filename')
        return svc.delete(filename)
      },
      { context: ctx, requireAuth: true }
    )
  }
}
