import { app } from 'electron'
import { join, sep } from 'node:path'
import { mkdirSync } from 'node:fs'
import { platform } from 'node:os'

export interface AppDirs {
  userData: string
  dataDir: string
  dbPath: string
  imagesDir: string
  backupsDir: string
  logsDir: string
}

export interface SystemDirs {
  root: string
  databaseDir: string
  imagesDir: string
  backupsDir: string
  logsDir: string
  configFile: string
}

function machineDataRoot(): string {
  if (platform() === 'win32') {
    const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData'
    return join(programData, 'OpacLibrarySystem')
  }
  return join(app.getPath('userData'), 'opac-system')
}

/** Application data stored under the per-user AppData directory. */
export function getAppDirs(): AppDirs {
  const userData = app.getPath('userData')
  const dataDir = join(userData, 'data')
  const imagesDir = join(userData, 'book-images')
  const backupsDir = join(userData, 'backups')
  const logsDir = join(userData, 'logs')
  return {
    userData,
    dataDir,
    dbPath: join(dataDir, 'opac.db'),
    imagesDir,
    backupsDir,
    logsDir
  }
}

/**
 * Machine-level data directories for an Admin installation.
 * Lives outside Program Files so data survives application updates and reinstalls.
 */
export function getSystemDirs(): SystemDirs {
  const root = machineDataRoot()
  const databaseDir = join(root, 'database')
  return {
    root,
    databaseDir,
    imagesDir: join(root, 'book-covers'),
    backupsDir: join(root, 'backups'),
    logsDir: join(root, 'logs'),
    configFile: join(root, 'config.json')
  }
}

export function ensureDirs(dirs: AppDirs): void {
  for (const dir of [
    dirs.userData,
    dirs.dataDir,
    dirs.imagesDir,
    dirs.backupsDir,
    dirs.logsDir
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}

export function ensureSystemDirs(dirs: SystemDirs): void {
  for (const dir of [dirs.root, dirs.databaseDir, dirs.imagesDir, dirs.backupsDir, dirs.logsDir]) {
    mkdirSync(dir, { recursive: true })
  }
}

/** True when `candidate` is `parent` itself or lives inside `parent`. */
export function isPathWithin(parent: string, candidate: string): boolean {
  const resolvedParent = join(parent)
  const resolvedCandidate = join(candidate)
  if (resolvedCandidate === resolvedParent) return true
  const prefix = resolvedParent.endsWith(sep) ? resolvedParent : resolvedParent + sep
  if (platform() === 'win32') {
    return resolvedCandidate.toLowerCase().startsWith(prefix.toLowerCase())
  }
  return resolvedCandidate.startsWith(prefix)
}

/** Resolves a stored cover filename safely inside the given images directory. */
export function resolveImagePath(imagesDir: string, filename: string): string {
  const normalized = filename.replaceAll('\\', '/')
  const base = normalized.split('/').pop() ?? ''
  if (!base || base !== filename) {
    throw new Error('Invalid image filename')
  }
  if (/\.\.|[:*?"<>|]/.test(base) || /^\//.test(base)) {
    throw new Error('Invalid image filename')
  }
  return join(imagesDir, base)
}