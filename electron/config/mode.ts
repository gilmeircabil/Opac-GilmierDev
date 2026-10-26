import { app } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { platform } from 'node:os'
import type { AppMode } from '@shared/types'
import { logger } from '../utils/logger'

interface InstallConfig {
  mode: AppMode
  installedVersion: string | null
}

const INSTALL_FILE = (): string => {
  if (platform() !== 'win32') return join(app.getPath('userData'), 'install.json')
  const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData'
  return join(programData, 'OpacLibrarySystem', 'install.json')
}

/** Per-user fallback used when the installer could not write under ProgramData. */
const USER_INSTALL_FILE = (): string => join(app.getPath('userData'), 'install.json')

function parseMode(value: string | undefined): AppMode | null {
  if (value === 'admin' || value === 'user') return value
  return null
}

function readInstallConfig(): InstallConfig | null {
  const candidates = [INSTALL_FILE(), USER_INSTALL_FILE()]
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as {
        mode?: unknown
        installedVersion?: unknown
      }
      const mode = parseMode(String(raw.mode))
      if (!mode) continue
      return {
        mode,
        installedVersion: typeof raw.installedVersion === 'string' ? raw.installedVersion : null
      }
    } catch (err) {
      logger.warn('failed to read install config', { file, error: err })
    }
  }
  return null
}

/**
 * Determines which installation type this computer was installed as.
 *
 * Priority: CLI flag > environment > installer config file > default (admin).
 */
export function getAppMode(): AppMode {
  const cliIndex = process.argv.indexOf('--mode')
  if (cliIndex !== -1) {
    const mode = parseMode(process.argv[cliIndex + 1])
    if (mode) return mode
  }
  const envMode = parseMode(process.env.OPAC_MODE)
  if (envMode) return envMode
  const install = readInstallConfig()
  return install?.mode ?? 'admin'
}