import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './ui'

/**
 * Accessible modal dialog. Closes on Escape or backdrop click (unless busy),
 * traps initial focus, and restores focus when closed.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  busy?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const titleId = useId()
  const descId = useId()
  const panel = useRef<HTMLDivElement>(null)

  // Stable references for callbacks to prevent re-running focus trap on re-renders
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) onCloseRef.current()
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        const list = Array.from(f).filter((el) => !el.hasAttribute('disabled'))
        if (!list.length) return
        const first = list[0]
        const last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'

    // Initial autofocus only when opening, and only if focus is not already inside the dialog
    const t = window.setTimeout(() => {
      if (!panel.current?.contains(document.activeElement)) {
        const target = panel.current?.querySelector<HTMLElement>('[data-autofocus], textarea, input, select') ?? panel.current
        target?.focus()
      }
    }, 30)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      window.clearTimeout(t)
      prev?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-brand-950/45 backdrop-blur-[3px]" onClick={() => !busy && onClose()} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full animate-scale-in flex-col overflow-hidden rounded-t-2xl bg-white shadow-raised ring-1 ring-ink-100 sm:rounded-2xl',
          size === 'sm'
            ? 'sm:max-w-md'
            : size === 'md'
            ? 'sm:max-w-xl'
            : size === 'lg'
            ? 'sm:max-w-2xl'
            : 'sm:max-w-3xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink-900 sm:text-xl">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-2 text-sm leading-relaxed text-ink-600">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="-mr-2 -mt-1 sm:-mr-2 sm:-mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children && <div className="overflow-y-auto overflow-x-hidden px-6 py-6 sm:px-8 sm:py-7">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2.5 border-t border-ink-100 bg-ink-50/70 px-6 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-8 sm:py-4.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
