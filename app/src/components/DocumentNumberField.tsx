import { DOCUMENT_NUMBER_LIMIT } from '../data/documentNumbers'
import { Field, Input } from './form'

export function DocumentNumberField({ value, onChange, required = false, disabled, error }: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  error?: string
}) {
  return (
    <Field label="Document number" required={required} optional={!required} error={error}>
      <Input
        name="documentNumber"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        maxLength={DOCUMENT_NUMBER_LIMIT}
        placeholder="Enter the number on the source document"
      />
    </Field>
  )
}
