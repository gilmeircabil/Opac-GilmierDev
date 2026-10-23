import { dialog } from 'electron'
import { copyFileSync, existsSync, readFileSync, unlinkSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { logger } from '../utils/logger'
import type { ImageResult } from '@shared/types'
import type { ImagesRepository } from '../database/mongo/repositories/images.repository'

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const ALLOWED_MIME_SIGNATURES: Array<{ bytes: number[]; ext: string[]; mime: string }> = [
  { bytes: [0xff, 0xd8, 0xff], ext: ['.jpg', '.jpeg'], mime: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], ext: ['.png'], mime: 'image/png' },
  { bytes: [0x52, 0x49, 0x46, 0x46], ext: ['.webp'], mime: 'image/webp' }
]
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export interface ImageFileResult {
  filename: string | null
  error?: string
}

export interface BookImageService {
  pickCover(): Promise<ImageResult>
  pickLogo(): Promise<ImageResult>
  saveFromPath(sourcePath: string): Promise<ImageFileResult>
  uploadBase64(fileName: string, base64Data: string): Promise<ImageResult>
  getBuffer(filename: string): Promise<{ mime: string; buffer: Buffer } | null>
  delete(filename: string): Promise<void>
}

export function bookImageService(imagesDir: string, imagesRepo?: ImagesRepository): BookImageService {
  function sanitizeExtension(filePath: string): string | null {
    const idx = filePath.lastIndexOf('.')
    if (idx === -1) return null
    const ext = filePath.slice(idx).toLowerCase()
    return ALLOWED_EXTENSIONS.includes(ext) ? ext : null
  }

  function detectSignature(buf: Buffer, ext: string): string | null {
    const signature = ALLOWED_MIME_SIGNATURES.find((s) => s.ext.includes(ext))
    if (!signature) return null
    if (buf.byteLength < signature.bytes.length) return null
    const ok = signature.bytes.every((byte, i) => buf[i] === byte)
    return ok ? signature.mime : null
  }

  async function saveBuffer(buf: Buffer, ext: string): Promise<ImageFileResult> {
    try {
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        return { filename: null, error: 'Image is too large (maximum 12 MB)' }
      }
      const mime = detectSignature(buf, ext)
      if (!mime) {
        return { filename: null, error: 'The selected file is not a valid JPG, PNG, or WEBP image' }
      }
      const filename = `book-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
      try {
        mkdirSync(imagesDir, { recursive: true })
        writeFileSync(join(imagesDir, filename), buf)
      } catch {
        // ignore disk cache error if running on remote/read-only path
      }
      if (imagesRepo) {
        await imagesRepo.save(filename, mime, buf)
      }
      return { filename }
    } catch (err) {
      logger.error('failed to save image buffer', err)
      return { filename: null, error: 'Unable to save the image file' }
    }
  }

  async function saveFromPath(sourcePath: string): Promise<ImageFileResult> {
    try {
      if (!sourcePath || !existsSync(sourcePath)) {
        return { filename: null, error: 'Selected file does not exist' }
      }
      const ext = sanitizeExtension(sourcePath)
      if (!ext) {
        return { filename: null, error: 'Only JPG, PNG, and WEBP images are allowed' }
      }
      const size = statSync(sourcePath).size
      if (size > MAX_IMAGE_BYTES) {
        return { filename: null, error: 'Image is too large (maximum 12 MB)' }
      }
      const buf = readFileSync(sourcePath)
      return saveBuffer(buf, ext)
    } catch (err) {
      logger.error('failed to save image', err)
      return { filename: null, error: 'Unable to save the image file' }
    }
  }

  async function pick(): Promise<ImageResult> {
    const result = await dialog.showOpenDialog({
      title: 'Select Image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { filename: null }
    }
    return saveFromPath(result.filePaths[0])
  }

  return {
    pickCover: () => pick(),
    pickLogo: () => pick(),
    saveFromPath: (sourcePath) => saveFromPath(sourcePath),
    async uploadBase64(fileName: string, base64Data: string): Promise<ImageResult> {
      const ext = sanitizeExtension(fileName)
      if (!ext) {
        return { filename: null, error: 'Only JPG, PNG, and WEBP images are allowed' }
      }
      const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '')
      const buf = Buffer.from(cleanBase64, 'base64')
      return saveBuffer(buf, ext)
    },
    async getBuffer(filename: string): Promise<{ mime: string; buffer: Buffer } | null> {
      const safeName = filename.replaceAll('\\', '/').split('/').pop() ?? ''
      if (!safeName || /\.\.|[:*?"<>|]/.test(safeName)) return null
      if (imagesRepo) {
        const fromDb = await imagesRepo.get(safeName)
        if (fromDb) return fromDb
      }
      const diskPath = join(imagesDir, safeName)
      if (existsSync(diskPath)) {
        const ext = sanitizeExtension(safeName) ?? '.jpg'
        const buf = readFileSync(diskPath)
        const mime = detectSignature(buf, ext) ?? 'image/jpeg'
        if (imagesRepo) {
          await imagesRepo.save(safeName, mime, buf).catch(() => undefined)
        }
        return { mime, buffer: buf }
      }
      return null
    },
    async delete(filename: string) {
      const safeName = filename.replaceAll('\\', '/').split('/').pop() ?? ''
      if (!safeName || safeName !== filename || /\.\./.test(safeName)) {
        throw new Error('Invalid image filename')
      }
      if (imagesRepo) {
        await imagesRepo.delete(safeName).catch(() => undefined)
      }
      const full = join(imagesDir, safeName)
      try {
        if (existsSync(full)) unlinkSync(full)
      } catch (err) {
        logger.warn('failed to delete image', { filename, error: err })
      }
    }
  }
}

export async function pickLocalImageAsBase64(): Promise<{ fileName: string; base64: string } | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Image',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  const sourcePath = result.filePaths[0]
  const size = statSync(sourcePath).size
  if (size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large (maximum 12 MB)')
  }
  const fileName = sourcePath.replaceAll('\\', '/').split('/').pop() ?? 'image.jpg'
  const buf = readFileSync(sourcePath)
  return { fileName, base64: buf.toString('base64') }
}

export { copyFileSync }
