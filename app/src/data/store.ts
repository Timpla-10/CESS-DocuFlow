/**
 * Browser store for locally created records and cached server data.
 */
import { useSyncExternalStore } from 'react'
import { FriendlyError, MESSAGES } from '../content/language'
import { apiFetch, postJson, requestJson, storeAuthToken } from '../lib/authApi'
import { respondToConsultation, submitConsultation } from './consultations'
import { createCustomDocumentTypes, isCustomDocumentType } from './customDocumentTypes'
import * as engine from './engine'
import { DB_VERSION, createDatabase, removeLegacyDemoData } from './database'
import { submitServiceFeedback } from './serviceFeedback'
import type {
  Database,
  DocumentFolder,
  DocumentType,
  ExternalOfficeId,
  ExternalOfficeItem,
  ExternalReturnOutcome,
  FacultyEntry,
  FolderCategory,
  NoticeAudience,
  NoticeStatus,
  NotificationPreference,
  Origin,
  Role,
  SyllabusRecord,
  SyllabusTemplate,
  SyllabusVersion,
  TosCognitiveLevels,
  TosRecord,
  User,
  WhitelistEntry,
} from './types'

const KEY = 'docuflow.db'
const listeners = new Set<() => void>()

function load(): Database {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if ([11, 12, 13, 14, 15, 16, DB_VERSION].includes(parsed.version)) {
        if (parsed.version !== DB_VERSION) removeLegacyDemoData(parsed)
        for (const u of parsed.users) {
          if (u.role === 'ids_principal' && !u.origin) {
            u.origin = 'IDS'
          }
          if (!u.notificationPreference) {
            u.notificationPreference = 'both'
          }
        }
        for (const type of createCustomDocumentTypes()) {
          if (!parsed.documentTypes.some((item) => item.id === type.id)) parsed.documentTypes.push(type)
        }
        return parsed
      }
    }
  } catch {
    /* Unreadable browser data cannot be loaded. */
  }
  return createDatabase()
}

let db: Database = load()
persist()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage full or unavailable — keep working in memory */
  }
}

function commit(next: Database, requirePersistence = false) {
  if (requirePersistence) localStorage.setItem(KEY, JSON.stringify(next))
  db = next
  if (!requirePersistence) persist()
  listeners.forEach((l) => l())
}

export function getDb(): Database {
  return db
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** React hook — re-renders whenever the data changes. */
export function useDb(): Database {
  return useSyncExternalStore(subscribe, getDb)
}

/** Runs an engine action on a copy of the data, then saves it. */
async function mutate<T>(fn: (draft: Database, at: string) => T, requirePersistence = false): Promise<T> {
  const draft = structuredClone(db)
  try {
    const result = fn(draft, new Date().toISOString())
    commit(draft, requirePersistence)
    return result
  } catch (err) {
    if (err instanceof FriendlyError) throw err
    console.error(err)
    throw new FriendlyError(MESSAGES.saveFailed)
  }
}

interface CatalogType {
  id: string | number
  name: string
  audience: DocumentType['audience']
  summary: string
  standard_processing_days: number
  template_url?: string
  requirements?: { id: string | number; label: string; required: boolean; source?: string }[]
}

async function syncDocumentCatalog() {
  const { documentTypes } = await requestJson<{ documentTypes: CatalogType[] }>('/api/document-types')
  await mutate((draft) => {
    for (const type of documentTypes) {
      const id = String(type.id)
      const index = draft.documentTypes.findIndex((item) => item.id === id)
      const existing = draft.documentTypes[index]
      const mapped: DocumentType = {
        ...existing, id, name: type.name, audience: type.audience, summary: type.summary,
        templateUrl: type.template_url || existing?.templateUrl,
        processingDays: [type.standard_processing_days, type.standard_processing_days],
        higherApproval: existing?.higherApproval ?? [],
        requirements: (type.requirements ?? []).map((item) => ({ ...item, id: String(item.id) })),
      }
      if (existing) draft.documentTypes[index] = mapped
      else draft.documentTypes.push(mapped)
    }
  })
}

async function syncDirectory() {
  const { users } = await requestJson<{ users: User[] }>('/api/auth/directory')
  await mutate((draft) => {
    for (const user of users) {
      const index = draft.users.findIndex((entry) => entry.id === user.id)
      if (index === -1) draft.users.push(user)
      else draft.users[index] = { ...draft.users[index], ...user }
      if (user.role === 'faculty' && !draft.faculty.some((entry) => entry.userId === user.id || entry.name === user.name)) {
        draft.faculty.push({ id: user.id, userId: user.id, name: user.name, department: user.department, subjects: [] })
      }
    }
  })
}

// Send any reminders that came due while the app was closed (REQ-NOT-3).
{
  const draft = structuredClone(db)
  const before = draft.notifications.length
  engine.runReminders(draft, Date.now())
  if (draft.notifications.length !== before) commit(draft)
}

export const api = {
  submitServiceFeedback: (user: User, input: Parameters<typeof submitServiceFeedback>[2]) =>
    mutate((d, at) => submitServiceFeedback(d, user, input, at), true),

  async signIn(email: string, password: string, rememberMe: boolean): Promise<User> {
    const result = await postJson<{ token?: string; user?: User }>('/api/auth/login', { email, password, rememberMe })
    if (!result.token || !result.user?.id || !result.user.active) throw new FriendlyError(MESSAGES.signInFailed)
    const user = result.user
    storeAuthToken(result.token, rememberMe)
    await mutate((draft) => {
      const index = draft.users.findIndex((entry) => entry.id === user.id || entry.email === user.email)
      if (index === -1) draft.users.push(user)
      else draft.users[index] = { ...draft.users[index], ...user }
    })
    await Promise.allSettled([syncDocumentCatalog(), syncDirectory()])
    return user
  },

  async signOut() {
    const request = apiFetch('/api/auth/logout', { method: 'POST' })
    storeAuthToken(null)
    await request.catch(() => undefined)
  },

  requestPasswordReset: (email: string) => postJson<{ success: boolean }>('/api/auth/forgot-password', { email }),

  confirmPasswordReset: (email: string, code: string, newPassword: string, confirmPassword: string) =>
    postJson<{ success: boolean }>('/api/auth/reset-password', { email, code, newPassword, confirmPassword }),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    postJson<{ success: boolean }>('/api/auth/change-password', { currentPassword, newPassword, confirmPassword }),

  submitConsultation: (user: User, input: Parameters<typeof submitConsultation>[2]) =>
    mutate((d, at) => submitConsultation(d, user, input, at), true),

  respondToConsultation: (user: User, requestId: string, input: Parameters<typeof respondToConsultation>[3]) =>
    mutate((d, at) => respondToConsultation(d, user, requestId, input, at), true),

  submitRequest: (user: User, input: Parameters<typeof engine.submitRequest>[2]) =>
    mutate((d, at) => engine.submitRequest(d, user, input, at), isCustomDocumentType(input.typeId)),

  /** REQ-REC-8: College Secretary creates a record for a document received in person. */
  encodeWalkInRequest: (
    actor: User,
    { requesterId, ...input }: Parameters<typeof engine.submitRequest>[2] & { requesterId: string },
  ) =>
    mutate((d, at) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can encode walk-in documents.')
      const requester = d.users.find((u) => u.id === requesterId)
      if (!requester) throw new FriendlyError('Please select a valid requester account.')
      return engine.submitRequest(
        d,
        requester,
        {
          ...input,
          encodedBySecretary: true,
          encodedByName: actor.name,
        },
        at,
      )
    }, isCustomDocumentType(input.typeId)),

  resubmit: async (user: User, docId: string, input: Parameters<typeof engine.resubmit>[3]) => {
    // PB-18 / PB-19: Sync live backend if connected
    try {
      await apiFetch(`/api/documents/${docId}/resubmit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          document_number: input.documentNumber?.trim() || null,
          notes: input.note,
          files: input.files,
        }),
      })
    } catch {
      // Fallback gracefully to client store
    }
    return mutate((d, at) => engine.resubmit(d, user, docId, input, at))
  },

  signDocument: (user: User, documentId: string, input: Parameters<typeof engine.signDocument>[3]) =>
    mutate((draft, at) => engine.signDocument(draft, user, documentId, input, at), true),

  checkRequirements: (user: User, docId: string, input: { decision?: 'complete' | 'return' | 'reject'; missing: string[]; reasons: string }) =>
    mutate((d, at) => engine.checkRequirements(d, user, docId, input, at)),

  recordReview: (user: User, docId: string, input: { kind: engine.ReviewKind; remarks: string }) =>
    mutate((d, at) => engine.recordReview(d, user, docId, input, at)),

  sendToExternal: (
    user: User,
    docId: string,
    input: {
      office: ExternalOfficeId
      transferDate?: string
      handedBy: string
      referenceNumber?: string
      remarks: string
    },
  ) => mutate((d, at) => engine.sendToExternal(d, user, docId, input, at)),

  recordExternalReturn: (
    user: User,
    docId: string,
    input: {
      returnDate?: string
      outcome?: ExternalReturnOutcome
      remarks: string
    },
  ) => mutate((d, at) => engine.recordExternalReturn(d, user, docId, input, at)),

  markReady: (user: User, docId: string) => mutate((d, at) => engine.markReady(d, user, docId, at)),

  recordRelease: (user: User, docId: string, input: { receivedBy: string; signedFile?: engine.NewFile }) =>
    mutate((d, at) => engine.recordRelease(d, user, docId, input, at)),

  postNotice: (
    user: User,
    input: {
      kind: 'notice' | 'minutes'
      title: string
      summary: string
      fileName: string
      status?: NoticeStatus
      targetAudience?: NoticeAudience
      publishDate?: string
      expiryDate?: string
      content?: string
    },
  ) => mutate((d, at) => engine.postNotice(d, user, input, at)),

  updateNotice: (
    user: User,
    id: string,
    input: {
      kind: 'notice' | 'minutes'
      title: string
      summary: string
      fileName: string
      status?: NoticeStatus
      targetAudience?: NoticeAudience
      publishDate?: string
      expiryDate?: string
      content?: string
    },
  ) => mutate((d) => engine.updateNotice(d, user, id, input)),

  publishNotice: (user: User, id: string) => mutate((d, at) => engine.publishDraftNotice(d, user, id, at)),

  deleteNotice: (user: User, id: string) => mutate((d) => engine.deleteNotice(d, user, id)),

  retryNotification: (user: User, id: string) => mutate((d) => engine.retryNotification(d, user, id)),

  markNotificationsRead: (user: User, ids: string[]) =>
    mutate((d) => {
      for (const n of d.notifications) if (ids.includes(n.id) && !n.readBy.includes(user.id)) n.readBy.push(user.id)
    }),

  markNoticeRead: (user: User, id: string) =>
    mutate((d) => {
      const n = d.notices.find((x) => x.id === id)
      if (n && !n.readBy.includes(user.id)) n.readBy.push(user.id)
    }),

  /** REQ-NOT-7: Toggle hybrid notification preferences (email, in-system, or both). */
  updateNotificationPreference: (user: User, preference: NotificationPreference) =>
    mutate((d) => {
      const u = d.users.find((x) => x.id === user.id)
      if (!u) throw new FriendlyError('Account not found.')
      u.notificationPreference = preference
      return u
    }),

  /** REQ-AUTH-3: Create or edit user account and assign role. */
  async refreshAccountManagement() {
    const [directory, whitelist, pending] = await Promise.all([
      requestJson<{ users: User[] }>('/api/auth/users'),
      requestJson<{ whitelist: (User & { created_at?: string })[] }>('/api/auth/whitelist'),
      requestJson<{ pendingRegistrations: (User & { created_at?: string })[] }>('/api/auth/pending'),
    ])
    await mutate((draft) => {
      const cachedUsers = draft.users.filter((user) => /^u-\d+$/.test(user.id) && !directory.users.some((item) => item.email === user.email))
      draft.users = [...cachedUsers, ...directory.users.map((user) => ({ ...draft.users.find((item) => item.id === user.id), ...user }))]
      const cachedWhitelist = draft.whitelist.filter((entry) => /^wl-\d+$/.test(entry.id) && !whitelist.whitelist.some((item) => item.email === entry.email))
      draft.whitelist = [...cachedWhitelist, ...whitelist.whitelist.map((user): WhitelistEntry => {
        const cached = draft.whitelist.find((item) => item.email === user.email)
        return {
          id: user.id, idNumber: cached?.idNumber ?? '', name: user.name, email: user.email,
          role: user.role as WhitelistEntry['role'], department: user.department, origin: user.origin,
          term: cached?.term ?? '', status: user.active ? 'activated' : 'pre_registered',
          importedAt: cached?.importedAt || user.created_at || '', importedBy: cached?.importedBy ?? '',
        }
      })]
      const cachedPending = draft.pendingRegistrations.filter((entry) => /^pr-\d+$/.test(entry.id) && !directory.users.some((item) => item.email === entry.email))
      draft.pendingRegistrations = [...cachedPending, ...pending.pendingRegistrations.map((user) => ({
        id: user.id, name: user.name, email: user.email, requestedRole: user.role, department: user.department,
        origin: user.origin, submittedAt: user.created_at ?? '', status: 'pending' as const,
      }))]
    })
  },

  async saveUserAccount(_actor: User, input: {
    id?: string
    name: string
    email: string
    role: Role
    origin?: Origin
    department: string
    position: string
    notificationPreference?: NotificationPreference
  }) {
    const existing = db.users.find((user) => user.id === input.id)
    if (existing && existing.email !== input.email) throw new FriendlyError('An existing university email cannot be changed here.')
    const result = await postJson<{ user: User }>('/api/auth/users', { ...input, active: existing?.active ?? true })
    await mutate((draft) => {
      const index = draft.users.findIndex((user) => user.id === result.user.id)
      const user = { ...result.user, position: input.position, notificationPreference: input.notificationPreference }
      if (index < 0) draft.users.push(user)
      else draft.users[index] = user
    })
    return result.user
  },

  async setUserActive(actor: User, userId: string, active: boolean) {
    if (actor.id === userId) throw new FriendlyError('You can’t deactivate your own account.')
    const user = db.users.find((item) => item.id === userId)
    if (!user) throw new FriendlyError('Account not found.')
    const saved = await postJson<{ user: User }>('/api/auth/users', { ...user, active })
    await mutate((draft) => { draft.users = draft.users.map((item) => item.id === userId ? { ...item, ...saved.user } : item) })
  },

  async importWhitelist(actor: User, entries: Omit<WhitelistEntry, 'id' | 'status' | 'term' | 'importedAt' | 'importedBy'>[], term: string) {
    if (!term.trim()) throw new FriendlyError('Specify the academic term for this masterlist.')
    const result = await postJson<{ entries: User[] }>('/api/auth/whitelist/import', { entries, term })
    return mutate((draft, at) => {
      let added = 0
      let updated = 0
      for (const user of result.entries) {
        const input = entries.find((item) => item.email.toLowerCase() === user.email.toLowerCase())
        const index = draft.whitelist.findIndex((item) => item.email.toLowerCase() === user.email.toLowerCase())
        const entry: WhitelistEntry = {
          id: user.id, idNumber: input?.idNumber ?? '', name: user.name, email: user.email, role: user.role as WhitelistEntry['role'],
          department: user.department, origin: user.origin, term, status: user.active ? 'activated' : 'pre_registered',
          importedAt: at, importedBy: actor.name,
        }
        if (index === -1) { draft.whitelist.push(entry); added++ }
        else { draft.whitelist[index] = entry; updated++ }
      }
      return { added, updated, total: result.entries.length }
    })
  },

  async deleteWhitelistEntry(_actor: User, entryId: string) {
    await requestJson('/api/auth/whitelist/' + encodeURIComponent(entryId), { method: 'DELETE' })
    await mutate((draft) => { draft.whitelist = draft.whitelist.filter((item) => item.id !== entryId) })
  },

  async approvePendingRegistration(_actor: User, id: string, overrides?: { role?: Role; department?: string; origin?: Origin }) {
    const result = await postJson<{ user: User }>('/api/auth/pending/' + encodeURIComponent(id) + '/approve', overrides ?? {})
    await mutate((draft) => {
      draft.pendingRegistrations = draft.pendingRegistrations.filter((item) => item.id !== id)
      draft.users = [...draft.users.filter((user) => user.id !== result.user.id), result.user]
    })
    return result.user
  },

  async rejectPendingRegistration(_actor: User, id: string, reason: string) {
    await postJson('/api/auth/pending/' + encodeURIComponent(id) + '/reject', { reason })
    await mutate((draft) => { draft.pendingRegistrations = draft.pendingRegistrations.filter((item) => item.id !== id) })
  },

  registerUser: (input: {
    name: string
    email: string
    password: string
    idNumber?: string
    requestedRole: Role
    department: string
    origin?: Origin
  }) => postJson<{ status: 'pending'; message: string }>('/api/auth/register', input),

  updateProcessingDays: (actor: User, typeId: string, days: [number, number]) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can change document settings.')
      if (!(days[0] >= 1 && days[1] >= days[0] && days[1] <= 60))
        throw new FriendlyError('Please enter working days between 1 and 60, with the shortest time first.')
      const t = d.documentTypes.find((x) => x.id === typeId)
      if (t) t.processingDays = days
    }),

  /** REQ-REQT-1, REQ-REQT-10, REQ-ROUTE-1: Save document type checklist, template, and CESS/IDS routes. */
  saveDocumentType: (actor: User, docType: DocumentType) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary (System Admin) can edit document types.')
      if (!docType.name.trim()) throw new FriendlyError('Please enter a name for the document type.')
      if (docType.requirements.length === 0 && !isCustomDocumentType(docType.id))
        throw new FriendlyError('Please include at least one required form or attachment in the checklist.')
      const idx = d.documentTypes.findIndex((t) => t.id === docType.id)
      const cleaned: DocumentType = {
        ...docType,
        id: docType.id || engine.nextId(d, 'dt-'),
        name: docType.name.trim(),
        summary: docType.summary.trim(),
        templateName: docType.templateName?.trim() || undefined,
      }
      if (idx >= 0) {
        d.documentTypes[idx] = cleaned
      } else {
        d.documentTypes.push(cleaned)
      }
      return cleaned
    }, true),

  /** REQ-EXT-1: Add, edit, or remove external offices. */
  saveExternalOffice: (actor: User, item: ExternalOfficeItem) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can edit external offices.')
      if (!item.label.trim() || !item.shortLabel.trim())
        throw new FriendlyError('Please enter both the full office name and short name.')
      const id = item.id || item.shortLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
      const existing = d.externalOffices.find((o) => o.id === id)
      if (existing) {
        existing.label = item.label.trim()
        existing.shortLabel = item.shortLabel.trim()
      } else {
        d.externalOffices.push({ id, label: item.label.trim(), shortLabel: item.shortLabel.trim() })
      }
    }),

  deleteExternalOffice: (actor: User, id: string) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can edit external offices.')
      if (d.externalOffices.length <= 1) throw new FriendlyError('At least one external office must remain configured.')
      d.externalOffices = d.externalOffices.filter((o) => o.id !== id)
    }),

  /** REQ-INFO-3: Add, edit, or remove faculty and subjects in the directory roster (Secretary only). Preserves existing faculty syllabi. */
  saveFacultyEntry: (actor: User, entry: FacultyEntry) =>
    mutate((d) => {
      if (actor.role !== 'secretary')
        throw new FriendlyError('Only the College Secretary can add or edit faculty records.')
      if (!entry.name.trim() || !entry.department.trim())
        throw new FriendlyError('Please enter the faculty member’s name and department.')
      const existing = d.faculty.find((f) => f.id === entry.id)
      const cleaned: FacultyEntry = {
        id: entry.id || engine.nextId(d, 'fac-'),
        userId: entry.userId || existing?.userId,
        name: entry.name.trim(),
        department: entry.department.trim(),
        subjects: entry.subjects
          .filter((s) => s.code.trim() || s.title.trim())
          .map((s) => {
            // Preserve existing syllabus if already uploaded by faculty
            const priorSub = existing?.subjects.find(
              (p) => p.code.trim().toLowerCase() === s.code.trim().toLowerCase(),
            )
            return {
              code: s.code.trim(),
              title: s.title.trim(),
              syllabusFile: priorSub?.syllabusFile || s.syllabusFile?.trim() || undefined,
            }
          }),
      }
      const idx = d.faculty.findIndex((f) => f.id === cleaned.id)
      if (idx >= 0) {
        d.faculty[idx] = cleaned
      } else {
        d.faculty.push(cleaned)
      }
      return cleaned
    }),

  deleteFacultyEntry: (actor: User, id: string) =>
    mutate((d) => {
      if (actor.role !== 'secretary')
        throw new FriendlyError('Only the College Secretary can remove faculty records.')
      d.faculty = d.faculty.filter((f) => f.id !== id)
    }),

  /** College Secretary: Upload or replace official institutional course syllabus template. */
  updateSyllabusTemplate: (actor: User, template: SyllabusTemplate) =>
    mutate((d) => {
      if (actor.role !== 'secretary')
        throw new FriendlyError('Only the College Secretary can upload or update the official syllabus template.')
      if (!template.fileName.trim())
        throw new FriendlyError('Please provide a valid template file name.')
      d.syllabusTemplate = {
        fileName: template.fileName.trim(),
        fileUrl: template.fileUrl,
        updatedAt: new Date().toISOString(),
        uploadedBy: actor.name,
        fileSize: template.fileSize,
      }
    }),

  /** Faculty self-service: Upload or update syllabus for own subject. */
  uploadFacultySyllabus: (actor: User, facultyId: string, subjectCode: string, fileName: string, fileUrl: string, fileSizeKb: number) =>
    mutate((d) => {
      const fac = d.faculty.find((f) => f.id === facultyId)
      if (!fac) throw new FriendlyError('Faculty record not found.')
      const isOwner =
        (fac.userId && fac.userId === actor.id) ||
        fac.name.trim().toLowerCase() === actor.name.trim().toLowerCase()
      if (!isOwner) {
        throw new FriendlyError('Only the assigned faculty member can upload or edit this course syllabus.')
      }
      const subject = fac.subjects.find((s) => s.code.trim().toLowerCase() === subjectCode.trim().toLowerCase())
      if (!subject) throw new FriendlyError(`Subject ${subjectCode} not found for this instructor.`)
      subject.syllabusFile = fileName.trim()

      if (!d.syllabi) d.syllabi = []
      const existingSyl = d.syllabi.find(
        (s) =>
          s.facultyId === facultyId &&
          s.subjectCode.trim().toLowerCase() === subjectCode.trim().toLowerCase(),
      )
      if (existingSyl) {
        existingSyl.fileName = fileName.trim()
        existingSyl.fileUrl = fileUrl
        existingSyl.fileSizeKb = fileSizeKb
        existingSyl.uploadedAt = new Date().toISOString()
        existingSyl.status = 'active'
      } else {
        d.syllabi.push({
          id: engine.nextId(d, 'syl-'),
          subjectCode: subject.code,
          subjectTitle: subject.title,
          facultyId: fac.id,
          facultyName: fac.name,
          facultyUserId: fac.userId,
          department: fac.department,
          academicYear: '2026-2027',
          semester: '1st Semester',
          fileName: fileName.trim(),
          fileUrl,
          fileSizeKb,
          uploadedAt: new Date().toISOString(),
          status: 'active',
        })
      }
    }),

  /** Faculty self-service: Remove syllabus from own subject. */
  removeFacultySyllabus: (actor: User, facultyId: string, subjectCode: string) =>
    mutate((d) => {
      const fac = d.faculty.find((f) => f.id === facultyId)
      if (!fac) throw new FriendlyError('Faculty record not found.')
      const isOwner =
        (fac.userId && fac.userId === actor.id) ||
        fac.name.trim().toLowerCase() === actor.name.trim().toLowerCase()
      if (!isOwner) {
        throw new FriendlyError('Only the assigned faculty member can remove this course syllabus.')
      }
      const subject = fac.subjects.find((s) => s.code.trim().toLowerCase() === subjectCode.trim().toLowerCase())
      if (!subject) throw new FriendlyError(`Subject ${subjectCode} not found for this instructor.`)
      delete subject.syllabusFile

      if (d.syllabi) {
        d.syllabi = d.syllabi.filter(
          (s) =>
            !(
              s.facultyId === facultyId &&
              s.subjectCode.trim().toLowerCase() === subjectCode.trim().toLowerCase()
            ),
        )
      }
    }),

  /**
   * Dedicated Syllabus Management - Upload or update a syllabus record with versioning and replacement rules.
   */
  uploadSyllabusRecord: (
    actor: User,
    payload: {
      subjectCode: string
      subjectTitle: string
      academicYear?: string
      semester?: string
      fileName: string
      fileUrl: string
      fileSizeKb?: number
      description?: string
      department?: string
      facultyId?: string
      facultyName?: string
      changeNote?: string
      templateCompliant?: boolean
    },
  ) =>
    mutate((d) => {
      if (actor.role === 'student') {
        throw new FriendlyError('Students are not permitted to upload course syllabi.')
      }

      const code = payload.subjectCode.trim().toUpperCase()
      const title = payload.subjectTitle.trim()
      const fileName = payload.fileName.trim()
      const ay = payload.academicYear || '2026-2027'
      const sem = payload.semester || '1st Semester'

      if (!code) throw new FriendlyError('Course code is required (e.g. EDUC 101).')
      if (!title) throw new FriendlyError('Course title is required.')
      if (!fileName) throw new FriendlyError('Syllabus file is required.')

      if (!d.syllabi) d.syllabi = []

      // Faculty / Subject association
      let fac: FacultyEntry | undefined
      if (payload.facultyId) {
        fac = d.faculty.find((f) => f.id === payload.facultyId)
      } else if (payload.facultyName) {
        fac = d.faculty.find((f) => f.name.trim().toLowerCase() === payload.facultyName?.trim().toLowerCase())
      }

      if (!fac) {
        fac = d.faculty.find(
          (f) =>
            (f.userId && f.userId === actor.id) ||
            f.name.trim().toLowerCase() === actor.name.trim().toLowerCase(),
        )
      }

      if (!fac && actor.role === 'faculty') {
        fac = {
          id: engine.nextId(d, 'fac-'),
          userId: actor.id,
          name: actor.name,
          department: actor.department || payload.department || 'College of Education and Social Sciences',
          subjects: [],
        }
        d.faculty.push(fac)
      }

      const facultyName = fac ? fac.name : (payload.facultyName || actor.name)
      const facultyId = fac ? fac.id : (payload.facultyId || `fac-${actor.id}`)
      const department =
        fac?.department || actor.department || payload.department || 'College of Education and Social Sciences'

      const existingIdx = d.syllabi.findIndex(
        (s) =>
          s.subjectCode.trim().toUpperCase() === code &&
          s.academicYear === ay &&
          s.semester === sem,
      )

      if (existingIdx >= 0) {
        const existing = d.syllabi[existingIdx]
        if (
          actor.role === 'faculty' &&
          existing.facultyUserId &&
          existing.facultyUserId !== actor.id
        ) {
          throw new FriendlyError('Only the assigned instructor or College Secretary can update this course syllabus.')
        }

        // Version & Replacement Rules: archive current version into version history
        const prevVersion = existing.version || 1
        const history: SyllabusVersion[] = existing.versionHistory ? [...existing.versionHistory] : []
        history.push({
          version: prevVersion,
          fileName: existing.fileName,
          fileUrl: existing.fileUrl,
          fileSizeKb: existing.fileSizeKb,
          uploadedAt: existing.uploadedAt,
          uploadedBy: existing.facultyName,
          changeNote: existing.changeNote || 'Initial syllabus release',
        })

        d.syllabi[existingIdx] = {
          ...existing,
          subjectTitle: title,
          fileName,
          fileUrl: payload.fileUrl,
          fileSizeKb: payload.fileSizeKb,
          description: payload.description || existing.description,
          uploadedAt: new Date().toISOString(),
          status: 'active',
          version: prevVersion + 1,
          changeNote: payload.changeNote || 'Updated syllabus content and OBE alignment.',
          versionHistory: history,
          templateCompliant: payload.templateCompliant ?? true,
        }
      } else {
        const newRecord: SyllabusRecord = {
          id: engine.nextId(d, 'syl-'),
          subjectCode: code,
          subjectTitle: title,
          facultyId,
          facultyName,
          facultyUserId: fac?.userId || (actor.role === 'faculty' ? actor.id : undefined),
          department,
          academicYear: ay,
          semester: sem,
          fileName,
          fileUrl: payload.fileUrl,
          fileSizeKb: payload.fileSizeKb,
          description: payload.description || 'Outcome-Based Education (OBE) course syllabus.',
          uploadedAt: new Date().toISOString(),
          status: 'active',
          version: 1,
          changeNote: payload.changeNote || 'Initial syllabus release.',
          versionHistory: [],
          templateCompliant: payload.templateCompliant ?? true,
        }
        d.syllabi.push(newRecord)
      }

      if (fac) {
        let sub = fac.subjects.find((s) => s.code.trim().toUpperCase() === code)
        if (sub) {
          sub.title = title
          sub.syllabusFile = fileName
        } else {
          fac.subjects.push({
            code,
            title,
            syllabusFile: fileName,
          })
        }
      }
    }),

  /**
   * Dedicated Syllabus Management - Delete a syllabus record.
   */
  deleteSyllabusRecord: (actor: User, syllabusId: string) =>
    mutate((d) => {
      if (!d.syllabi) return
      const target = d.syllabi.find((s) => s.id === syllabusId)
      if (!target) throw new FriendlyError('Syllabus record not found.')

      const isOwner =
        (target.facultyUserId && target.facultyUserId === actor.id) ||
        target.facultyName.trim().toLowerCase() === actor.name.trim().toLowerCase()
      const isSec = actor.role === 'secretary'

      if (!isOwner && !isSec) {
        throw new FriendlyError('Only the assigned instructor or College Secretary can remove this course syllabus.')
      }

      d.syllabi = d.syllabi.filter((s) => s.id !== syllabusId)

      const fac = d.faculty.find(
        (f) => f.id === target.facultyId || (f.userId && f.userId === target.facultyUserId),
      )
      if (fac) {
        const sub = fac.subjects.find(
          (s) => s.code.trim().toUpperCase() === target.subjectCode.trim().toUpperCase(),
        )
        if (sub) {
          delete sub.syllabusFile
        }
      }
    }),

  /**
   * PB-57: Dedicated Table of Specifications (TOS) Management - Update template.
   */
  updateTosTemplate: (actor: User, fileName: string, fileUrl: string, fileSize?: string) =>
    mutate((d) => {
      if (actor.role !== 'secretary') {
        throw new FriendlyError('Only the College Secretary is authorized to update the institutional TOS template.')
      }
      d.tosTemplate = {
        fileName,
        updatedAt: new Date().toISOString(),
        uploadedBy: `${actor.name} (College Secretary)`,
        fileUrl,
        fileSize,
      }
    }),

  /**
   * PB-57: Dedicated Table of Specifications (TOS) Management - Upload/Replace TOS.
   */
  uploadTosRecord: (
    actor: User,
    payload: {
      subjectCode: string
      subjectTitle: string
      academicYear?: string
      semester?: string
      term?: 'Midterm' | 'Final' | 'Midterm & Final'
      examType?: string
      totalItems?: number
      cognitiveDistribution?: TosCognitiveLevels
      fileName: string
      fileUrl: string
      fileSizeKb?: number
      description?: string
      department?: string
    },
  ) =>
    mutate((d) => {
      if (actor.role === 'student') {
        throw new FriendlyError('Students are not permitted to upload Tables of Specifications.')
      }

      const code = payload.subjectCode.trim().toUpperCase()
      const title = payload.subjectTitle.trim()
      const fileName = payload.fileName.trim()
      const ay = payload.academicYear || '2026-2027'
      const sem = payload.semester || '1st Semester'
      const term = payload.term || 'Midterm'
      const examType = payload.examType || `${term} Examination`
      const totalItems = payload.totalItems ?? 0
      if (!Number.isInteger(totalItems) || totalItems < 1) throw new FriendlyError('Enter the total number of examination items.')

      if (!code) throw new FriendlyError('Course code is required (e.g. EDUC 101).')
      if (!title) throw new FriendlyError('Course title is required.')
      if (!fileName) throw new FriendlyError('TOS file is required.')

      if (!d.tos) d.tos = []

      let fac = d.faculty.find(
        (f) =>
          (f.userId && f.userId === actor.id) ||
          f.name.trim().toLowerCase() === actor.name.trim().toLowerCase(),
      )

      if (!fac && actor.role === 'faculty') {
        fac = {
          id: engine.nextId(d, 'fac-'),
          userId: actor.id,
          name: actor.name,
          department: actor.department || payload.department || 'College of Education and Social Sciences',
          subjects: [],
        }
        d.faculty.push(fac)
      }

      const facultyName = fac ? fac.name : actor.name
      const facultyId = fac ? fac.id : `fac-${actor.id}`
      const department =
        fac?.department || actor.department || payload.department || 'College of Education and Social Sciences'

      const existingIdx = d.tos.findIndex(
        (t) =>
          t.subjectCode.trim().toUpperCase() === code &&
          t.academicYear === ay &&
          t.semester === sem &&
          t.term === term,
      )

      if (existingIdx >= 0) {
        const existing = d.tos[existingIdx]
        if (
          actor.role === 'faculty' &&
          existing.facultyUserId &&
          existing.facultyUserId !== actor.id
        ) {
          throw new FriendlyError('Only the assigned instructor or College Secretary can update this Table of Specifications.')
        }

        d.tos[existingIdx] = {
          ...existing,
          subjectTitle: title,
          examType,
          totalItems,
          cognitiveDistribution: payload.cognitiveDistribution || existing.cognitiveDistribution,
          fileName,
          fileUrl: payload.fileUrl,
          fileSizeKb: payload.fileSizeKb,
          description: payload.description || existing.description,
          uploadedAt: new Date().toISOString(),
          status: 'active',
        }
      } else {
        const newRecord: TosRecord = {
          id: engine.nextId(d, 'tos-'),
          subjectCode: code,
          subjectTitle: title,
          facultyId,
          facultyName,
          facultyUserId: actor.id,
          department,
          academicYear: ay,
          semester: sem,
          term,
          examType,
          totalItems,
          cognitiveDistribution: payload.cognitiveDistribution,
          fileName,
          fileUrl: payload.fileUrl,
          fileSizeKb: payload.fileSizeKb,
          description: payload.description || `${term} assessment examination blueprint.`,
          uploadedAt: new Date().toISOString(),
          status: 'active',
        }
        d.tos.push(newRecord)
      }
    }),

  /**
   * PB-57: Dedicated Table of Specifications (TOS) Management - Delete TOS record.
   */
  deleteTosRecord: (actor: User, tosId: string) =>
    mutate((d) => {
      if (!d.tos) return
      const target = d.tos.find((t) => t.id === tosId)
      if (!target) throw new FriendlyError('TOS record not found.')

      const isOwner =
        (target.facultyUserId && target.facultyUserId === actor.id) ||
        target.facultyName.trim().toLowerCase() === actor.name.trim().toLowerCase()
      const isSec = actor.role === 'secretary'
      const isDean = actor.role === 'dean'

      if (!isOwner && !isSec && !isDean) {
        throw new FriendlyError('Only the assigned instructor or College Secretary can remove this Table of Specifications.')
      }

      d.tos = d.tos.filter((t) => t.id !== tosId)
    }),

  /**
   * PB-58: Create and Manage Document Folders - Create Folder.
   */
  createDocumentFolder: (
    actor: User,
    payload: {
      name: string
      description?: string
      category?: FolderCategory
      purpose?: string
      origin?: Origin
      allowedRoles?: Role[]
    },
  ) =>
    mutate((d) => {
      if (actor.role === 'student') {
        throw new FriendlyError('Students are not authorized to create repository folders.')
      }

      const name = payload.name.trim()
      if (!name) throw new FriendlyError('Folder name is required.')

      if (!d.folders) d.folders = []

      const exists = d.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())
      if (exists) throw new FriendlyError(`A folder named "${name}" already exists.`)

      const folder: DocumentFolder = {
        id: engine.nextId(d, 'fld-'),
        name,
        description: payload.description?.trim() || 'Custom document collection folder.',
        category: payload.category || 'general',
        purpose: payload.purpose?.trim() || 'Organize and manage academic documents.',
        createdBy: actor.id,
        createdByName: actor.name,
        createdByRole: actor.role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSystem: false,
        origin: payload.origin ?? actor.origin ?? 'CESS',
        allowedRoles: payload.allowedRoles,
      }

      d.folders.push(folder)
      return folder
    }),

  /**
   * PB-58: Create and Manage Document Folders - Rename / Edit Folder.
   */
  renameDocumentFolder: (
    actor: User,
    folderId: string,
    payload: {
      name: string
      description?: string
      category?: FolderCategory
      purpose?: string
    },
  ) =>
    mutate((d) => {
      if (!d.folders) throw new FriendlyError('Folder not found.')
      const folder = d.folders.find((f) => f.id === folderId)
      if (!folder) throw new FriendlyError('Folder not found.')

      if (folder.isSystem && actor.role !== 'secretary') {
        throw new FriendlyError('System folders can only be modified by the College Secretary.')
      }

      const isOwner = folder.createdBy === actor.id
      const isPrivileged = actor.role === 'secretary' || actor.role === 'dean'

      if (!isOwner && !isPrivileged) {
        throw new FriendlyError('You do not have permission to modify this folder.')
      }

      const name = payload.name.trim()
      if (!name) throw new FriendlyError('Folder name is required.')

      const duplicate = d.folders.some(
        (f) => f.id !== folderId && f.name.toLowerCase() === name.toLowerCase(),
      )
      if (duplicate) throw new FriendlyError(`A folder named "${name}" already exists.`)

      folder.name = name
      if (payload.description !== undefined) folder.description = payload.description.trim()
      if (payload.category) folder.category = payload.category
      if (payload.purpose !== undefined) folder.purpose = payload.purpose.trim()
      folder.updatedAt = new Date().toISOString()
    }),

  /**
   * PB-58: Create and Manage Document Folders - Delete Folder.
   */
  deleteDocumentFolder: (actor: User, folderId: string) =>
    mutate((d) => {
      if (!d.folders) return
      const folder = d.folders.find((f) => f.id === folderId)
      if (!folder) throw new FriendlyError('Folder not found.')

      if (folder.isSystem) {
        throw new FriendlyError('Official system category folders cannot be deleted.')
      }

      const isOwner = folder.createdBy === actor.id
      const isPrivileged = actor.role === 'secretary' || actor.role === 'dean'

      if (!isOwner && !isPrivileged) {
        throw new FriendlyError('You do not have permission to delete this folder.')
      }

      d.folders = d.folders.filter((f) => f.id !== folderId)

      // Unassign documents in this folder
      d.documents.forEach((doc) => {
        if (doc.folderId === folderId) {
          delete doc.folderId
        }
      })
    }),

  /**
   * PB-58: Move / Assign Document to Folder.
   */
  moveDocumentToFolder: (actor: User, docId: string, folderId: string | null) =>
    mutate((d) => {
      const doc = d.documents.find((doc) => doc.id === docId)
      if (!doc) throw new FriendlyError('Document not found.')

      const isRequester = doc.requesterId === actor.id
      const isStaff =
        actor.role === 'secretary' ||
        actor.role === 'dean' ||
        actor.role === 'chairperson' ||
        actor.role === 'ids_principal'

      if (!isRequester && !isStaff) {
        throw new FriendlyError('You are not authorized to organize this document.')
      }

      if (folderId) {
        const folder = (d.folders || []).find((f) => f.id === folderId)
        if (!folder) throw new FriendlyError('Target folder not found.')
        doc.folderId = folderId
      } else {
        delete doc.folderId
      }
      doc.updatedAt = new Date().toISOString()
    }),

  updateReminderDays: (actor: User, days: number) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can change reminder settings.')
      if (!(days >= 1 && days <= 14)) throw new FriendlyError('Please choose a number of days between 1 and 14.')
      d.settings.reminderEveryDays = days
    }),

  /** PB-30: Batch trigger automated 3-day follow-up reminders across all eligible waiting documents */
  triggerReminders: (actor: User) => {
    let sentCount = 0
    mutate((d) => {
      if (actor.role !== 'secretary' && actor.role !== 'dean') {
        throw new FriendlyError('Only the College Secretary or Dean can dispatch follow-up reminders.')
      }
      const before = d.notifications.length
      engine.runReminders(d, Date.now())
      sentCount = d.notifications.length - before
    })
    return sentCount
  },

  /** PB-30: Dispatch an immediate follow-up reminder for a specific aging document, enforcing anti-duplicate rules */
  sendSingleReminder: (actor: User, docId: string) => {
    let officeName = ''
    mutate((d) => {
      if (actor.role !== 'secretary' && actor.role !== 'dean') {
        throw new FriendlyError('Only the College Secretary or Dean can dispatch follow-up reminders.')
      }
      officeName = engine.sendSingleReminder(d, docId, Date.now())
    })
    return officeName
  },

}
