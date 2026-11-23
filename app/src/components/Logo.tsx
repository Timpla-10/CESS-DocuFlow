import msunLogo from '../assets/msun-logo.png'
import cessLogo from '../assets/cess-logo.png'
import { cn } from './ui'

/**
 * Dual institutional seal mark (MSUN official university seal & CESS college seal).
 */
export function LogoMark({ className, size = 'md' }: { className?: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const imgSize = size === 'xs' ? 'size-5' : size === 'sm' ? 'size-6' : size === 'lg' ? 'size-9' : 'size-7'
  return (
    <span className={cn('inline-flex items-center justify-center gap-1 shrink-0', className)}>
      <img
        src={msunLogo}
        alt="MSU Naawan Official Seal"
        className={cn(imgSize, 'object-contain shrink-0 drop-shadow-sm select-none')}
      />
      <img
        src={cessLogo}
        alt="CESS College Seal"
        className={cn(imgSize, 'object-contain shrink-0 drop-shadow-sm select-none')}
      />
    </span>
  )
}

/**
 * Full product logo combining MSUN and CESS official seals side-by-side with brand typography.
 */
export function Logo({
  tone = 'dark',
  subtitle = true,
  size = 'md',
}: {
  tone?: 'dark' | 'light'
  subtitle?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const imgSize = size === 'sm' ? 'size-7' : size === 'lg' ? 'size-10' : 'size-[34px]'
  return (
    <span className="flex items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 shrink-0">
        <img
          src={msunLogo}
          alt="MSU Naawan Official Seal"
          className={cn(imgSize, 'object-contain shrink-0 drop-shadow-sm select-none')}
        />
        <img
          src={cessLogo}
          alt="CESS College Seal"
          className={cn(imgSize, 'object-contain shrink-0 drop-shadow-sm select-none')}
        />
      </span>
      <span className="leading-tight">
        <span className={cn('block text-[15px] font-extrabold tracking-tight', tone === 'light' ? 'text-white' : 'text-brand-900')}>
          CESS <span className={tone === 'light' ? 'text-dsee-200' : 'text-brand-600'}>DocuFlow</span>
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
