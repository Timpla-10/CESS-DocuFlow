export const DOCUMENT_NUMBER_LIMIT = 80

export function documentNumberError(value: string | undefined, required = false): string | undefined {
  const number = value?.trim() ?? ''
  if (required && !number) return 'Enter the document number for this request.'
  if (number.length > DOCUMENT_NUMBER_LIMIT) return `Use ${DOCUMENT_NUMBER_LIMIT} characters or fewer.`
}
