import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from './ui'

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  title: string
  body?: string
}

interface ToastApi {
  success: (title: string, body?: string) => void
  error: (title: string, body?: string) => void
  info: (title: string, body?: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t.slice(-3), { id, tone, title, body }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 6000)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({
      success: (t, b) => push('success', t, b),
      error: (t, b) => push('error', t, b),
      info: (t, b) => push('info', t, b),
    }),
    [push],
  )

  const icon = { success: CheckCircle2, error: XCircle, info: Info }
  const tone = {
    success: 'text-success-600',
    error: 'text-danger-600',
    info: 'text-brand-600',
  }
  const bar = { success: 'bg-success-500', error: 'bg-danger-500', info: 'bg-brand-500' }

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icon[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto relative flex w-full max-w-sm animate-slide-in gap-3 overflow-hidden rounded-xl bg-white p-4 pl-5 shadow-raised ring-1 ring-ink-100"
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', bar[t.tone])} aria-hidden />
              <Icon className={cn('mt-0.5 size-5 shrink-0', tone[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-900">{t.title}</p>
                {t.body && <p className="mt-0.5 text-sm leading-snug text-ink-600">{t.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                aria-label="Dismiss message"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
