import { FriendlyError } from '../content/language'
import { browserRequest } from '../lib/browserStorage'
import { getDb } from './store'
import type { Origin, Role, User } from './types'

export const CLASS_RECORD_ROLES: Role[] = ['faculty', 'chairperson', 'ids_principal', 'dean', 'secretary']
export const CLASS_RECORD_CATEGORIES = ['Attendance', 'Grades', 'Assessment', 'Other'] as const
export const CLASS_RECORD_TERMS = ['First semester', 'Second semester', 'Summer term'] as const
export const CLASS_RECORD_FILE_LIMIT = 12

type Category = typeof CLASS_RECORD_CATEGORIES[number]
type Term = typeof CLASS_RECORD_TERMS[number]
export type ClassRecordFormat = 'pdf' | 'csv' | 'xlsx'

export interface ClassRecordFields {
  course: string
  section: string
  academicYear: string
  term: Term
  category: Category
}

export interface ClassRecord extends ClassRecordFields {
  id: string
  ownerId: string
  ownerName: string
  department: string
  origin?: Origin
  uploadedAt: string
  fileName: string
  size: number
  format: ClassRecordFormat
}

type StoredClassRecord = ClassRecord & { file: File }

export function classRecordErrors(fields: ClassRecordFields): Partial<Record<keyof ClassRecordFields, string>> {
  const errors: Partial<Record<keyof ClassRecordFields, string>> = {}
  if (!fields.course.trim() || fields.course.trim().length > 80) errors.course = 'Enter a course code or title of up to 80 characters.'
  if (!fields.section.trim() || fields.section.trim().length > 40) errors.section = 'Enter a section of up to 40 characters.'
  const year = fields.academicYear.trim().match(/^(\d{4})-(\d{4})$/)
  if (!year || Number(year[2]) !== Number(year[1]) + 1) errors.academicYear = 'Enter consecutive years in YYYY-YYYY format.'
  if (!CLASS_RECORD_TERMS.includes(fields.term)) errors.term = 'Choose a term.'
  if (!CLASS_RECORD_CATEGORIES.includes(fields.category)) errors.category = 'Choose a category.'
  return errors
}

export function classRecordFileError(file: File | null): string | undefined {
  if (!file?.size) return 'Select a non-empty class record file.'
  if (!/\.(pdf|csv|xlsx)$/i.test(file.name)) return 'Choose a PDF, CSV, or Excel (.xlsx) file.'
  if (file.size > CLASS_RECORD_FILE_LIMIT * 1024 * 1024) return `Choose a file of ${CLASS_RECORD_FILE_LIMIT} MB or less.`
}

export function canViewClassRecord(user: User, record: ClassRecord): boolean {
  if (!user.active) return false
  switch (user.role) {
    case 'faculty': return record.ownerId === user.id
    case 'chairperson': return Boolean(user.department.trim()) && user.department.trim().toLowerCase() === record.department.trim().toLowerCase()
    case 'ids_principal': return record.origin === 'IDS'
    case 'dean':
    case 'secretary': return true
    default: return false
  }
}

function activeViewer(userId: string): User {
  const user = getDb().users.find((item) => item.id === userId)
  if (!user?.active || !CLASS_RECORD_ROLES.includes(user.role)) throw new FriendlyError('Your account cannot access class records.')
  return user
}

const recordsStore = { database: 'docuflow.class-records', collection: 'records', keyPath: 'id' }

export async function listClassRecords(user: User): Promise<ClassRecord[]> {
  activeViewer(user.id)
  const records = await browserRequest<StoredClassRecord[]>(recordsStore, 'readonly', (store) => store.getAll())
  const viewer = activeViewer(user.id)
  return records.filter((record) => canViewClassRecord(viewer, record))
    .map(({ file: _file, ...record }) => record)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

export async function uploadClassRecord(user: User, fields: ClassRecordFields, file: File): Promise<ClassRecord> {
  if (activeViewer(user.id).role !== 'faculty') throw new FriendlyError('Only faculty can upload class records.')
  const error = Object.values(classRecordErrors(fields))[0] ?? classRecordFileError(file)
  if (error) throw new FriendlyError(error)
  const format = file.name.split('.').pop()?.toLowerCase() as ClassRecordFormat
  const header = await file.slice(0, 5).text()
  if ((format === 'pdf' && header !== '%PDF-') || (format === 'xlsx' && !header.startsWith('PK\x03\x04'))) {
    throw new FriendlyError('The file contents do not match its format. Export it again and retry.')
  }
  const actor = activeViewer(user.id)
  if (actor.role !== 'faculty') throw new FriendlyError('Only faculty can upload class records.')
  const record: ClassRecord = {
    ...fields,
    course: fields.course.trim(),
    section: fields.section.trim(),
    academicYear: fields.academicYear.trim(),
    id: crypto.randomUUID(),
    ownerId: actor.id,
    ownerName: actor.name,
    department: actor.department,
    origin: actor.origin,
    uploadedAt: new Date().toISOString(),
    fileName: file.name,
    size: file.size,
    format,
  }
  await browserRequest(recordsStore, 'readwrite', (store) => store.add({ ...record, file }))
  return record
}

export async function retrieveClassRecord(user: User, id: string): Promise<File> {
  activeViewer(user.id)
  const record = await browserRequest<StoredClassRecord | undefined>(recordsStore, 'readonly', (store) => store.get(id))
  if (!record || !canViewClassRecord(activeViewer(user.id), record)) {
    throw new FriendlyError('This class record is unavailable to your account.')
  }
  return record.file
}
