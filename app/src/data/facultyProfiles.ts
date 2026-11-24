import { FriendlyError } from '../content/language'
import { browserRequest, runBrowserTransaction } from '../lib/browserStorage'
import { accountOrigin, canReviewAcademicUnit } from './academicScopes'
import { getDb } from './store'
import type { Origin, User } from './types'

export const CREDENTIAL_CATEGORIES = ['Degree', 'License', 'Certificate', 'Award', 'Other'] as const
export const CREDENTIAL_FILE_LIMIT_MB = 10
export const PROFILE_ENTRY_LIMIT = 20

export type CredentialCategory = typeof CREDENTIAL_CATEGORIES[number]
export interface ProfileEntry { id: string; title: string; institution: string; year: string }
export interface FacultyProfileFields {
  name: string
  title: string
  email: string
  specialties: string
  biography: string
  education: ProfileEntry[]
  accomplishments: ProfileEntry[]
}
export interface Credential {
  id: string
  title: string
  category: CredentialCategory
  fileName: string
  format: 'application/pdf' | 'image/png' | 'image/jpeg'
  uploadedAt: string
}
export interface FacultyProfile extends FacultyProfileFields {
  ownerId: string
  version: number
  updatedAt: string
  credentials: Credential[]
}
export interface FacultyProfileSummary extends FacultyProfile {
  department: string
  origin: Origin
}
export interface PendingCredential { id: string; title: string; category: CredentialCategory; file: File }
type StoredCredential = Credential & { file: File }
type StoredProfile = Omit<FacultyProfile, 'credentials'> & { credentials: StoredCredential[] }
type ProfileInput = FacultyProfileFields & { version: number; keep: string[]; uploads: PendingCredential[] }

const profileStore = { database: 'docuflow.faculty-profiles', collection: 'profiles', keyPath: 'ownerId' }

export function newProfile(user: User): FacultyProfile {
  return { ownerId: user.id, name: user.name, title: user.position, email: user.email, specialties: '', biography: '', education: [], accomplishments: [], credentials: [], version: 0, updatedAt: '' }
}

export function facultyProfileErrors(fields: FacultyProfileFields): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!fields.name.trim() || fields.name.trim().length > 100) errors.name = 'Enter a name of up to 100 characters.'
  if (!fields.title.trim() || fields.title.trim().length > 120) errors.title = 'Enter a professional title of up to 120 characters.'
  const email = fields.email.trim()
  if (email && (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.email = 'Enter a valid email address.'
  if (fields.specialties.trim().length > 240) errors.specialties = 'Use up to 240 characters.'
  if (fields.biography.trim().length > 1500) errors.biography = 'Use up to 1,500 characters.'
  for (const group of ['education', 'accomplishments'] as const) {
    if (fields[group].length > PROFILE_ENTRY_LIMIT) errors[group] = `Keep at most ${PROFILE_ENTRY_LIMIT} entries.`
    for (const entry of fields[group]) {
      if (!entry.title.trim() || entry.title.trim().length > 140) errors[`${group}-${entry.id}-title`] = 'Enter a title of up to 140 characters.'
      if (entry.institution.trim().length > 140) errors[`${group}-${entry.id}-institution`] = 'Use up to 140 characters.'
      if (entry.year.trim() && !/^(19|20|21)\d{2}$/.test(entry.year.trim())) errors[`${group}-${entry.id}-year`] = 'Enter a four-digit year such as 2026.'
    }
  }
  return errors
}

export function credentialFileError(file: File | null): string | undefined {
  if (!file?.size) return 'Choose a non-empty credential file.'
  if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) return 'Choose a PDF, PNG, or JPEG file.'
  if (file.size > CREDENTIAL_FILE_LIMIT_MB * 1024 * 1024) return `Choose a file of ${CREDENTIAL_FILE_LIMIT_MB} MB or less.`
}

export function canReadFacultyProfile(viewer: User, owner: User): boolean {
  return viewer.active && owner.active && owner.role === 'faculty' && (viewer.id === owner.id || canReviewAcademicUnit(viewer, accountOrigin(owner)))
}

function activeUser(id: string): User {
  const user = getDb().users.find((member) => member.id === id && member.active)
  if (!user) throw new FriendlyError('This account is unavailable.')
  return user
}

function readProfileRecord(ownerId: string) {
  return browserRequest<StoredProfile | undefined>(profileStore, 'readonly', (store) => store.get(ownerId))
}

function stripFiles(profile: StoredProfile): FacultyProfile {
  return { ...profile, credentials: profile.credentials.map(({ file: _file, ...credential }) => credential) }
}

export async function loadFacultyProfile(viewer: User): Promise<FacultyProfile | null> {
  if (activeUser(viewer.id).role !== 'faculty') throw new FriendlyError('Only faculty can edit a faculty profile.')
  const record = await readProfileRecord(viewer.id)
  if (activeUser(viewer.id).role !== 'faculty') throw new FriendlyError('Only faculty can edit a faculty profile.')
  return record ? stripFiles(record) : null
}

export async function listFacultyProfiles(viewer: User): Promise<FacultyProfileSummary[]> {
  const actor = activeUser(viewer.id)
  if (!canReviewAcademicUnit(actor, 'CESS') && !canReviewAcademicUnit(actor, 'IDS')) throw new FriendlyError('Your account cannot view the faculty profile overview.')
  const records = await browserRequest<StoredProfile[]>(profileStore, 'readonly', (store) => store.getAll())
  const latestActor = activeUser(viewer.id)
  return records.flatMap((record) => {
    const owner = getDb().users.find((person) => person.id === record.ownerId)
    return owner && canReadFacultyProfile(latestActor, owner) ? [{ ...stripFiles(record), origin: accountOrigin(owner), department: owner.department }] : []
  }).sort((a, b) => a.name.localeCompare(b.name))
}

async function prepareCredential(input: PendingCredential): Promise<StoredCredential> {
  const error = credentialFileError(input.file)
  if (error) throw new FriendlyError(error)
  if (!input.title.trim() || input.title.trim().length > 140 || !CREDENTIAL_CATEGORIES.includes(input.category)) {
    throw new FriendlyError('Each credential needs a title and valid category.')
  }
  const bytes = new Uint8Array(await input.file.slice(0, 8).arrayBuffer())
  let format: Credential['format'] | undefined
  if (/\.pdf$/i.test(input.file.name) && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') format = 'application/pdf'
  if (/\.png$/i.test(input.file.name) && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) format = 'image/png'
  if (/\.jpe?g$/i.test(input.file.name) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) format = 'image/jpeg'
  if (!format) throw new FriendlyError(`“${input.file.name}” could not be recognized. Choose a valid PDF, PNG, or JPEG.`)
  return { id: input.id, title: input.title.trim(), category: input.category, fileName: input.file.name, file: input.file, format, uploadedAt: new Date().toISOString() }
}

export async function saveFacultyProfile(viewer: User, input: ProfileInput): Promise<FacultyProfile> {
  if (activeUser(viewer.id).role !== 'faculty') throw new FriendlyError('Only faculty can save a faculty profile.')
  const error = Object.values(facultyProfileErrors(input))[0]
  if (error) throw new FriendlyError(error)
  if (input.keep.length + input.uploads.length > PROFILE_ENTRY_LIMIT) throw new FriendlyError(`Keep at most ${PROFILE_ENTRY_LIMIT} credentials.`)
  const uploads = await Promise.all(input.uploads.map(prepareCredential))
  const cleanEntries = (entries: ProfileEntry[]) => entries.map((entry) => ({ id: entry.id, title: entry.title.trim(), institution: entry.institution.trim(), year: entry.year.trim() }))
  return runBrowserTransaction<FacultyProfile>(profileStore, 'readwrite', (store, setResult, fail) => {
    const request = store.get(viewer.id)
    request.onsuccess = () => {
      try {
        if (activeUser(viewer.id).role !== 'faculty') throw new FriendlyError('Only faculty can save a faculty profile.')
        const existing = request.result as StoredProfile | undefined
        if ((existing?.version ?? 0) !== input.version) throw new FriendlyError('This profile changed in another tab. Reload it before saving again.')
        const updated: StoredProfile = {
          ownerId: viewer.id, version: input.version + 1, updatedAt: new Date().toISOString(),
          name: input.name.trim(), title: input.title.trim(), email: input.email.trim(),
          specialties: input.specialties.trim(), biography: input.biography.trim(),
          education: cleanEntries(input.education), accomplishments: cleanEntries(input.accomplishments),
          credentials: [...(existing?.credentials ?? []).filter((credential) => input.keep.includes(credential.id)), ...uploads],
        }
        store.put(updated)
        setResult(stripFiles(updated))
      } catch (error) { fail(error) }
    }
  })
}

export async function retrieveFacultyCredential(viewer: User, ownerId: string, id: string): Promise<Blob> {
  if (!canReadFacultyProfile(activeUser(viewer.id), activeUser(ownerId))) throw new FriendlyError('This credential is unavailable to your account.')
  const record = await readProfileRecord(ownerId)
  const credential = record?.credentials.find((item) => item.id === id)
  if (!credential || !canReadFacultyProfile(activeUser(viewer.id), activeUser(ownerId))) throw new FriendlyError('This credential is unavailable to your account.')
  return credential.file.slice(0, credential.file.size, credential.format)
}
