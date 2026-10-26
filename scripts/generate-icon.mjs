import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'build')
const LOGO_PNG = join(ROOT, 'src', 'assets', 'logo.png')
const PS1_SCRIPT = join(ROOT, 'scripts', 'update-logo.ps1')

if (existsSync(PS1_SCRIPT)) {
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${PS1_SCRIPT}"`, { stdio: 'inherit' })
    process.exit(0)
  } catch {
    // fallback to copy if powershell is not available
  }
}

if (existsSync(LOGO_PNG)) {
  const pngBuf = readFileSync(LOGO_PNG)
  writeFileSync(join(OUT_DIR, 'icon.png'), pngBuf)

  // Minimal single-entry ICO header for png
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngBuf.length, 8)
  entry.writeUInt32LE(22, 12)
  writeFileSync(join(OUT_DIR, 'icon.ico'), Buffer.concat([header, entry, pngBuf]))
  console.log('Synchronized build/icon.png and build/icon.ico from src/assets/logo.png')
}
