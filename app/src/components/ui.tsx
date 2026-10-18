/**
 * Core UI primitives for CESS DocuFlow.
 * All colours come from the tokens in index.css — no raw hex values here.
 */
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Tone } from '../content/language'

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type IconType = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>

/* ------------------------------------------------------------------------ */
/* Button                                                                    */
/* ------------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft' | 'on-dark'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-all duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-px select-none'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-brand hover:bg-brand-700 hover:shadow-raised disabled:hover:bg-brand-600 disabled:shadow-none',
  secondary: 'bg-white text-brand-800 ring-1 ring-inset ring-ink-200 hover:bg-brand-50 hover:ring-brand-300 shadow-xs',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-xs',
  'danger-soft': 'bg-white text-danger-700 ring-1 ring-inset ring-danger-100 hover:bg-danger-50 hover:ring-danger-500/40',
  'on-dark': 'bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20 backdrop-blur',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], extra)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconType
  iconRight?: IconType
  loading?: boolean
  loadingText?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading,
  loadingText,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      <span>{loading && loadingText ? loadingText : children}</span>
      {IconRight && !loading ? <IconRight className="size-4" aria-hidden /> : null}
    </button>
  )
}

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  children,
  className,
}: {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconType
  iconRight?: IconType
  children: ReactNode
  className?: string
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      <span>{children}</span>
      {IconRight ? <IconRight className="size-4" aria-hidden /> : null}
    </Link>
  )
}

/* ------------------------------------------------------------------------ */
/* Badge                                                                     */
/* ------------------------------------------------------------------------ */

const badgeTones: Record<Tone, string> = {
  brand: 'bg-brand-100 text-brand-800 ring-brand-200',
  neutral: 'bg-ink-50 text-ink-700 ring-ink-200',
  success: 'bg-success-50 text-success-700 ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
}

const dotTones: Record<Tone, string> = {
  brand: 'bg-brand-600',
  neutral: 'bg-ink-400',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
}

export function Badge({ tone = 'neutral', children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dotTones[tone])} aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  )
}

/* ------------------------------------------------------------------------ */
/* Surfaces                                                                  */
/* ------------------------------------------------------------------------ */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl bg-white shadow-card ring-1 ring-ink-100', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, description, action, icon: Icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: IconType }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <header className="mb-6 flex animate-fade-up flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-brand-600">{eyebrow}</div>}
        <h1 className="text-balance text-2xl font-extrabold tracking-tight text-brand-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/* ------------------------------------------------------------------------ */
/* Callout                                                                   */
/* ------------------------------------------------------------------------ */

const calloutTones: Record<Tone, string> = {
  brand: 'bg-brand-50 ring-brand-200 [--icon:var(--color-brand-600)]',
  neutral: 'bg-ink-50 ring-ink-200 [--icon:var(--color-ink-500)]',
  success: 'bg-success-50 ring-success-100 [--icon:var(--color-success-600)]',
  warning: 'bg-warning-50 ring-warning-100 [--icon:var(--color-warning-600)]',
  danger: 'bg-danger-50 ring-danger-100 [--icon:var(--color-danger-600)]',
}

export function Callout({
  tone = 'brand',
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone?: Tone
  icon?: IconType
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex gap-3 rounded-xl p-4 ring-1 ring-inset', calloutTones[tone], className)} role={tone === 'danger' ? 'alert' : undefined}>
      {Icon && <Icon className="mt-0.5 size-5 shrink-0 text-(--icon)" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold text-ink-900">{title}</p>}
        {children && <div className={cn('text-sm leading-relaxed text-ink-700', title ? 'mt-1' : undefined)}>{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Empty state & loading                                                     */
/* ------------------------------------------------------------------------ */

export function EmptyState({ icon: Icon, title, children, action }: { icon: IconType; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand-100 opacity-60 blur-xl" aria-hidden />
        <span className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-brand-200">
          <Icon className="size-6" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">{children}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-600" role="status">
      <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
      {label}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Stat card & bar chart                                                     */
/* ------------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  to,
}: {
  label: string
  value: number | string
  hint?: string
  icon: IconType
  tone?: Tone
  to?: string
}) {
  const iconTone: Record<Tone, string> = {
    brand: 'bg-brand-100 text-brand-700',
    neutral: 'bg-ink-100 text-ink-600',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
    danger: 'bg-danger-100 text-danger-700',
  }
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink-600">{label}</p>
        <span className={cn('grid size-9 place-items-center rounded-lg transition-transform group-hover:scale-110', iconTone[tone])}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </>
  )
  const cls = 'group block rounded-xl bg-white p-5 shadow-card ring-1 ring-ink-100 transition-all'
  return to ? (
    <Link to={to} className={cn(cls, 'hover:-translate-y-0.5 hover:shadow-raised hover:ring-brand-200')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function BarList({ items, emptyLabel }: { items: { label: string; value: number; tone?: Tone }[]; emptyLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const fill: Record<Tone, string> = {
    brand: 'bg-gradient-to-r from-brand-500 to-brand-700',
    neutral: 'bg-ink-300',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  }
  if (items.every((i) => i.value === 0)) return <p className="py-6 text-center text-sm text-ink-500">{emptyLabel}</p>
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-ink-700">{i.label}</span>
            <span className="font-bold tabular-nums text-ink-900">{i.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="presentation">
            <div
              className={cn('h-full rounded-full transition-[width] duration-700 ease-out', fill[i.tone ?? 'brand'])}
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------------ */
/* Tabs (segmented)                                                          */
/* ------------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-ink-50 p-1 ring-1 ring-inset ring-ink-100">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all',
              active ? 'bg-white text-brand-800 shadow-xs ring-1 ring-brand-200' : 'text-ink-600 hover:text-brand-700',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  active ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Misc                                                                      */
/* ------------------------------------------------------------------------ */

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const initials = name
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.|Atty\.)\s+/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-base' }
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 font-bold text-white ring-2 ring-white',
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{i.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-ink-900">{i.value}</dd>
          {i.hint && <dd className="mt-0.5 text-xs text-ink-500">{i.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
