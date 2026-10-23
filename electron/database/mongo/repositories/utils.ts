export function nowIso(): string {
  return new Date().toISOString()
}

export function toIso(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't'
}

export function toInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
