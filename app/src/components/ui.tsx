/**
 * Core UI primitives for CESS DocuFlow.
 * All colours come from the tokens in index.css — no raw hex values here.
 */
import { Loader2 } from 'lucide-react'
import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
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
  ids: 'bg-ids-50 text-ids-700 ring-ids-200',
  dsee: 'bg-dsee-50 text-dsee-700 ring-dsee-200',
  dssh: 'bg-dssh-50 text-dssh-700 ring-dssh-200',
}

const dotTones: Record<Tone, string> = {
  brand: 'bg-brand-600',
  neutral: 'bg-ink-400',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  ids: 'bg-ids-400',
  dsee: 'bg-dsee-300',
  dssh: 'bg-dssh-600',
}

export function Badge({ tone = 'neutral', children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dotTones[tone])} aria-hidden />}
      <span className="inline-flex items-center gap-1">{children}</span>
    </span>
  )
}

/** DepartmentBadge deprecated: department acronym labels removed by request */
export function DepartmentBadge(_props?: {
  department?: string
  origin?: string
  full?: boolean
  className?: string
}) {
  return null
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-6 py-4.5">
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
  ids: 'bg-ids-50 ring-ids-200 [--icon:var(--color-ids-500)]',
  dsee: 'bg-dsee-50 ring-dsee-200 [--icon:var(--color-dsee-700)]',
  dssh: 'bg-dssh-50 ring-dssh-200 [--icon:var(--color-dssh-600)]',
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
    ids: 'bg-ids-100 text-ids-700',
    dsee: 'bg-dsee-100 text-dsee-700',
    dssh: 'bg-dssh-100 text-dssh-700',
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
    ids: 'bg-ids-400',
    dsee: 'bg-dsee-300',
    dssh: 'bg-dssh-600',
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
/* Pie chart (solid circular sector distribution with pop-out & legend)    */
/* ------------------------------------------------------------------------ */

export interface PieChartItem {
  label: string
  value: number
  color?: string
  gradient?: [string, string]
  tone?: Tone
}

export function PieChart({
  items,
  emptyLabel = 'No documents currently under review.',
  centerLabel = 'In Review',
}: {
  items: PieChartItem[]
  emptyLabel?: string
  centerLabel?: string
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const rawId = useId()
  const chartId = rawId.replace(/[^a-zA-Z0-9]/g, '')

  // Institutional and collegiate gradient pairs [startColor, endColor]
  const defaultGradients: [string, string][] = [
    ['#8B5CF6', '#581C87'], // Chairperson: Royal Violet (DSSH)
    ['#FB7185', '#BE185D'], // IDS Principal: Warm Rose Pink (IDS)
    ['#C084FC', '#6B21A8'], // College Dean: Amethyst Purple
    ['#60A5FA', '#1D4ED8'], // OVCAA: University Azure Blue
    ['#FBBF24', '#B45309'], // Chancellor: Executive Amber Gold
    ['#34D399', '#047857'], // Emerald
    ['#F472B6', '#A21CAF'], // Fuchsia
    ['#818CF8', '#3730A3'], // Indigo
  ]

  const total = items.reduce((sum, it) => sum + it.value, 0)

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="relative mb-3 size-36">
          <svg className="size-full" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={31}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={26}
              strokeDasharray="4 4"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-extrabold text-ink-300">0</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-ink-400">{centerLabel}</span>
          </div>
        </div>
        <p className="text-xs text-ink-500">{emptyLabel}</p>
      </div>
    )
  }

  const radius = 44
  const innerRadius = 18 // Compact inner hole: creates a chunky "semi pie / semi donut" aesthetic

  const segments = items.map((item, idx) => {
    const fraction = total > 0 ? item.value / total : 0
    const priorFraction = items
      .slice(0, idx)
      .reduce((sum, prev) => sum + (total > 0 ? prev.value / total : 0), 0)

    const startAngle = 2 * Math.PI * priorFraction - Math.PI / 2
    const endAngle = 2 * Math.PI * (priorFraction + fraction) - Math.PI / 2
    const midAngle = (startAngle + endAngle) / 2

    // Outer arc boundary
    const x1Out = 50 + radius * Math.cos(startAngle)
    const y1Out = 50 + radius * Math.sin(startAngle)
    const x2Out = 50 + radius * Math.cos(endAngle)
    const y2Out = 50 + radius * Math.sin(endAngle)

    // Inner hole boundary
    const x1In = 50 + innerRadius * Math.cos(startAngle)
    const y1In = 50 + innerRadius * Math.sin(startAngle)
    const x2In = 50 + innerRadius * Math.cos(endAngle)
    const y2In = 50 + innerRadius * Math.sin(endAngle)

    const largeArcFlag = fraction > 0.5 ? 1 : 0

    // Pop-out displacement when hovered
    const popDistance = 3.5
    const dx = popDistance * Math.cos(midAngle)
    const dy = popDistance * Math.sin(midAngle)

    const gradient =
      item.gradient ||
      (item.color ? [item.color, item.color] : defaultGradients[idx % defaultGradients.length])
    const percent = fraction * 100
    const percentageFormatted = percent.toFixed(percent % 1 === 0 ? 0 : 1)

    return {
      ...item,
      originalIndex: idx,
      fraction,
      percentageFormatted,
      gradient,
      gradientId: `pie-grad-${chartId}-${idx}`,
      x1Out,
      y1Out,
      x2Out,
      y2Out,
      x1In,
      y1In,
      x2In,
      y2In,
      largeArcFlag,
      dx,
      dy,
    }
  })

  const activeSegments = segments.filter((s) => s.value > 0)
  const currentHovered = hoveredIdx !== null ? segments.find((s) => s.originalIndex === hoveredIdx) : null

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Semi Pie / Semi Donut Graphic */}
      <div className="relative size-44 sm:size-48">
        <svg
          className="size-full overflow-visible drop-shadow-sm"
          viewBox="-6 -6 112 112"
          aria-hidden
        >
          <defs>
            {segments.map((seg) => (
              <linearGradient
                key={seg.gradientId}
                id={seg.gradientId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={seg.gradient[0]} />
                <stop offset="100%" stopColor={seg.gradient[1]} />
              </linearGradient>
            ))}
            <filter id={`pie-shadow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.22" />
            </filter>
          </defs>

          {/* Center Hole Backdrop Circle */}
          <circle
            cx="50"
            cy="50"
            r={innerRadius - 0.5}
            fill="#FFFFFF"
            stroke="#F1F5F9"
            strokeWidth="1"
          />

          {activeSegments.length === 1 ? (
            // Single 100% item full donut ring with gradient
            <circle
              cx="50"
              cy="50"
              r={(radius + innerRadius) / 2}
              fill="none"
              stroke={`url(#${activeSegments[0].gradientId})`}
              strokeWidth={radius - innerRadius}
              className="cursor-pointer transition-transform duration-200"
              onMouseEnter={() => setHoveredIdx(activeSegments[0].originalIndex)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ) : (
            segments.map((seg) => {
              if (seg.value === 0) return null
              const isHovered = hoveredIdx === seg.originalIndex
              const isAnyHovered = hoveredIdx !== null

              const pathData = `M ${seg.x1Out.toFixed(3)} ${seg.y1Out.toFixed(3)} A ${radius} ${radius} 0 ${seg.largeArcFlag} 1 ${seg.x2Out.toFixed(3)} ${seg.y2Out.toFixed(3)} L ${seg.x2In.toFixed(3)} ${seg.y2In.toFixed(3)} A ${innerRadius} ${innerRadius} 0 ${seg.largeArcFlag} 0 ${seg.x1In.toFixed(3)} ${seg.y1In.toFixed(3)} Z`

              return (
                <path
                  key={seg.label}
                  d={pathData}
                  fill={`url(#${seg.gradientId})`}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="cursor-pointer transition-all duration-200 ease-out"
                  style={{
                    transform: isHovered
                      ? `translate(${seg.dx.toFixed(2)}px, ${seg.dy.toFixed(2)}px)`
                      : 'translate(0px, 0px)',
                    opacity: isAnyHovered ? (isHovered ? 1 : 0.4) : 1,
                    filter: isHovered ? `url(#pie-shadow-${chartId})` : 'none',
                  }}
                  onMouseEnter={() => setHoveredIdx(seg.originalIndex)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              )
            })
          )}
        </svg>

        {/* Center Hole Metrics (Like reference image with total / hovered value) */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {currentHovered ? (
            <div className="flex flex-col items-center justify-center">
              <span className="text-xl font-black tracking-tight text-ink-900 leading-none">
                {currentHovered.value}
              </span>
              <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-600 leading-tight">
                {currentHovered.percentageFormatted}%
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <span className="text-xl font-black tracking-tight text-ink-900 leading-none">
                {total}
              </span>
              <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wider text-ink-400 leading-tight">
                {centerLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Inspector Pill */}
      <div className="flex min-h-[32px] w-full items-center justify-center rounded-lg bg-ink-50/80 px-3 py-1.5 text-center transition-all">
        {currentHovered ? (
          <div className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-full shadow-xs"
              style={{
                background: `linear-gradient(135deg, ${currentHovered.gradient[0]}, ${currentHovered.gradient[1]})`,
              }}
              aria-hidden
            />
            <span className="font-semibold text-ink-900">{currentHovered.label}:</span>
            <span className="font-bold text-brand-700">
              {currentHovered.value} {currentHovered.value === 1 ? 'doc' : 'docs'}
            </span>
            <span className="rounded bg-brand-100/60 px-1 py-0.2 text-[10px] font-bold text-brand-800">
              {currentHovered.percentageFormatted}%
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <span className="font-bold tabular-nums text-ink-800">{total}</span>
            <span>total documents {centerLabel.toLowerCase()}</span>
          </div>
        )}
      </div>

      {/* Interactive Legend List */}
      <ul className="w-full space-y-1 divide-y divide-ink-50 border-t border-ink-100/70 pt-2.5">
        {segments.map((seg) => {
          const isHovered = hoveredIdx === seg.originalIndex
          const isAnyHovered = hoveredIdx !== null
          return (
            <li
              key={seg.label}
              onMouseEnter={() => setHoveredIdx(seg.originalIndex)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={cn(
                'group flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                isHovered ? 'bg-brand-50/70 font-semibold' : 'hover:bg-ink-50/70',
                isAnyHovered && !isHovered && 'opacity-55',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full shadow-xs transition-transform group-hover:scale-125"
                  style={{
                    background: `linear-gradient(135deg, ${seg.gradient[0]}, ${seg.gradient[1]})`,
                  }}
                  aria-hidden
                />
                <span className="truncate text-ink-700 group-hover:text-ink-900">
                  {seg.label}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-bold tabular-nums text-ink-900">
                  {seg.value}
                </span>
                <span className="rounded bg-ink-100/70 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">
                  {seg.percentageFormatted}%
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Aliases for backwards compatibility
export const DonutChart = PieChart
export type DonutChartItem = PieChartItem

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
  options: { value: T; label: ReactNode; icon?: IconType; count?: number }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-ink-50 p-1 ring-1 ring-inset ring-ink-100">
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
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
            {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
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
        'grid shrink-0 place-items-center rounded-full bg-[#191970] font-bold text-white',
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
