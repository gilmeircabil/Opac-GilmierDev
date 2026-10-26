import type { TextareaHTMLAttributes } from 'react'
import { classNames } from '../../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export default function Textarea({ label, className, id, ...rest }: TextareaProps) {
  const textareaId = id ?? rest.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-xs font-semibold text-slate-700">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={classNames(
          'ring-focus w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-all duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/15',
          'scrollbar-thin'
        )}
        {...rest}
      />
    </div>
  )
}
