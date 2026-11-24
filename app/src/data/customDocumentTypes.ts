import type { DocumentType } from './types'

export const CUSTOM_DOCUMENT_TYPE_LIMIT = 100

const customTypeIds: Record<DocumentType['audience'], string> = {
  student: 'student-others',
  faculty: 'faculty-others',
}

export function isCustomDocumentType(typeId: string): boolean {
  return typeId === customTypeIds.student || typeId === customTypeIds.faculty
}

export function createCustomDocumentTypes(): DocumentType[] {
  const audiences: DocumentType['audience'][] = ['student', 'faculty']
  return audiences.map((audience) => ({
    id: customTypeIds[audience],
    name: 'Others',
    audience,
    summary: 'Request a document that is missing from the list. Describe what you need so the College Secretary can review your request.',
    requirements: [],
    processingDays: [3, 5],
    higherApproval: [],
  }))
}

export function customDocumentTypeError(value: string | undefined): string | undefined {
  const name = value?.trim() ?? ''
  if (!name) return 'Enter the name of the document type you need.'
  if (name.length > CUSTOM_DOCUMENT_TYPE_LIMIT) return `Use ${CUSTOM_DOCUMENT_TYPE_LIMIT} characters or fewer.`
}
