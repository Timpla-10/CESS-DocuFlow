import { cn } from './ui'

/** CESS DocuFlow product mark. This is an app mark, not an official college seal. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden>
      <defs>
        <linearGradient id="dfmark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-brand-500)" />
          <stop offset="1" stopColor="var(--color-brand-800)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#dfmark)" />
      <path d="M22 14h14l10 10v24a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" fill="var(--color-brand-50)" />
      <path d="M36 14v8a2 2 0 0 0 2 2h8" fill="var(--color-brand-300)" />
      <path d="M25 37l5 5 10-11" fill="none" stroke="var(--color-brand-600)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ tone = 'dark', subtitle = true }: { tone?: 'dark' | 'light'; subtitle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-tight">
        <span className={cn('block text-[15px] font-extrabold tracking-tight', tone === 'light' ? 'text-white' : 'text-brand-900')}>
          CESS <span className={tone === 'light' ? 'text-brand-200' : 'text-brand-600'}>DocuFlow</span>
        </span>
        {subtitle && (
          <span className={cn('block text-[11px] font-medium', tone === 'light' ? 'text-brand-200/80' : 'text-ink-500')}>
            MSU at Naawan
          </span>
        )}
      </span>
    </span>
  )
}
