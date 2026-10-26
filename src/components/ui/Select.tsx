import type { SelectHTMLAttributes } from 'react'
import { classNames } from '../../lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export default function Select({ label, className, children, id, ...rest }: SelectProps) {
  const selectId = id ?? rest.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-xs font-semibold text-slate-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={classNames(
          'ring-focus w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-all duration-150 hover:border-slate-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/15'
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  )
}
