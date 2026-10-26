import type { InputHTMLAttributes, ReactNode } from 'react'
import { classNames } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: ReactNode
  error?: string
}

export default function Input({ label, icon, error, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-slate-700">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={classNames(
            'ring-focus w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-all duration-150 placeholder:text-slate-400',
            icon ? 'pl-10' : '',
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
              : 'border-slate-200 hover:border-slate-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/15',
            className
          )}
          {...rest}
        />
      </div>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  )
}
