/**
 * Form controls. Every field has a VISIBLE label (never placeholder-only),
 * optional helper text, and an error message shown right beside the field.
 */
import { AlertCircle, ChevronDown } from 'lucide-react'
import { cloneElement, forwardRef, isValidElement, useId, useState, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from './ui'

export function Field({
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  optional?: boolean
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
  className?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': !!error })
    : children
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink-800">
        {label}
        {required && <span className="text-xs font-semibold text-brand-700">Required</span>}
        {optional && <span className="text-xs font-medium text-ink-500">Optional</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[13px] leading-snug text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-[13px] font-medium text-danger-700" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

const controlBase =
  'block w-full rounded-lg bg-white text-sm text-ink-900 ring-1 ring-inset ring-ink-200 transition-shadow ' +
  'placeholder:text-ink-400 hover:ring-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500 ' +
  'aria-[invalid=true]:ring-danger-500 aria-[invalid=true]:bg-danger-50/40 disabled:bg-ink-50 disabled:text-ink-500'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, 'h-10 px-3.5', className)} {...rest} />
}

export function Textarea({ className, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(controlBase, 'px-3.5 py-2.5 leading-relaxed', className)} {...rest} />
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(
    {
      className,
      children,
      id,
      disabled,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      onFocus,
      onBlur,
      onChange,
      ...rest
    },
    ref,
  ) {
    const [isFocused, setIsFocused] = useState(false)
    const widthClass = className?.match(/\b(w-\S+|min-w-\S+|max-w-\S+)\b/g)?.join(' ')
    return (
      <div className={cn('group relative', widthClass || 'w-full')}>
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          onFocus={(e) => {
            setIsFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            onBlur?.(e)
          }}
          onChange={(e) => {
            setIsFocused(false)
            e.currentTarget.blur()
            onChange?.(e)
          }}
          className={cn(
            controlBase,
            'h-10 appearance-none pl-3.5 pr-10 text-sm font-medium cursor-pointer',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <ChevronDown
            className={cn(
              'size-4 transform-gpu transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
              disabled
                ? 'text-ink-300'
                : isFocused
                ? 'text-brand-600'
                : 'text-ink-500 group-hover:translate-y-0.5 group-hover:text-brand-600',
            )}
            style={{
              transform: isFocused ? 'rotate(180deg)' : 'rotate(0deg)',
              transformOrigin: 'center',
            }}
            aria-hidden="true"
          />
        </div>
      </div>
    )
  },
)

export function Checkbox({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId()
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3', className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-brand-600" {...rest} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-ink-500">{hint}</span>}
      </span>
    </label>
  )
}
