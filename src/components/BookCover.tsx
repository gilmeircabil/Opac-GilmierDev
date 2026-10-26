import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { imageUrl, classNames } from '../lib/utils'

interface BookCoverProps {
  filename: string | null | undefined
  title: string
  className?: string
  sizes?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZES: Record<NonNullable<BookCoverProps['sizes']>, string> = {
  sm: 'h-24 w-16 text-[10px]',
  md: 'h-36 w-24 text-xs',
  lg: 'h-48 w-32 text-sm',
  xl: 'h-64 w-44 text-sm'
}

export default function BookCover({ filename, title, className, sizes = 'md' }: BookCoverProps) {
  const url = imageUrl(filename)
  const [failed, setFailed] = useState(false)

  if (!url || failed) {
    return (
      <div
        role="img"
        aria-label={`Cover of ${title}`}
        className={classNames(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-indigo-100/60 p-2.5 text-center shadow-sm select-none',
          SIZES[sizes],
          className
        )}
      >
        <BookOpen className="h-1/3 w-1/3 max-h-8 text-indigo-400" />
        <span className="line-clamp-2 px-1 font-semibold leading-tight text-indigo-900">
          {title}
        </span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={`Cover of ${title}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={classNames(
        'rounded-xl border border-slate-200/80 object-cover shadow-sm transition-shadow',
        SIZES[sizes],
        className
      )}
    />
  )
}
