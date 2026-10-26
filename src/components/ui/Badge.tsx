import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { classNames } from '../../lib/utils'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'primary'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  warning: 'bg-amber-50 text-amber-700 border-amber-200/80',
  danger: 'bg-rose-50 text-rose-700 border-rose-200/80',
  info: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  muted: 'bg-slate-100 text-slate-600 border-slate-200/80',
  primary: 'bg-indigo-50 text-indigo-900 border-indigo-200/80 font-semibold'
}

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  icon?: LucideIcon
  className?: string
}

export default function Badge({ children, tone = 'muted', icon: Icon, className }: BadgeProps) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight',
        TONE_CLASSES[tone],
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  )
}
