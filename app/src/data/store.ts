/**
 * Mock backend for the prototype.
 *
 * Mirrors the shape of the future Express + Supabase API: every action is
 * async, runs the shared workflow engine, and either resolves or throws a
 * FriendlyError. Data is persisted in localStorage so the demo survives
 * page reloads. To connect a real backend, replace the bodies of `api.*`
 * with fetch calls — the pages only depend on this module's exports.
 */
import { useSyncExternalStore } from 'react'
import { FriendlyError, MESSAGES } from '../content/language'
import * as engine from './engine'
import { DB_VERSION, DEMO_PASSWORD, createSeed } from './seed'
import type {
  Database,
  DocumentType,
  ExternalOfficeId,
  ExternalOfficeItem,
  FacultyEntry,
  NotificationPreference,
  Origin,
  Role,
  User,
} from './types'

const KEY = 'docuflow.db'
const listeners = new Set<() => void>()

function load(): Database {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if (parsed.version === DB_VERSION) return parsed
    }
  } catch {
    /* fall through to a fresh seed */
  }
  return createSeed()
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

function commit(next: Database) {
  db = next
  persist()
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Runs an engine action on a copy of the data, then saves it. */
async function mutate<T>(fn: (draft: Database, at: string) => T): Promise<T> {
  await wait(350 + Math.random() * 350)
  const draft = structuredClone(db)
  try {
    const result = fn(draft, new Date().toISOString())
    commit(draft)
    return result
  } catch (err) {
    if (err instanceof FriendlyError) throw err
    console.error(err)
    throw new FriendlyError(MESSAGES.saveFailed)
  }
}

// Send any reminders that came due while the app was closed (REQ-NOT-3).
{
  const draft = structuredClone(db)
  const before = draft.notifications.length
  engine.runReminders(draft, Date.now())
  if (draft.notifications.length !== before) commit(draft)
}

export const api = {
  async signIn(email: string, password: string, role?: Role): Promise<User> {
    await wait(500)
    const cleanEmail = email.trim().toLowerCase()
    let user = db.users.find((u) => u.email.toLowerCase() === cleanEmail)
    if (role && (!user || user.role !== role)) {
      user = db.users.find((u) => u.role === role && u.active) ?? user
    }
    if (!user || password !== DEMO_PASSWORD) throw new FriendlyError(MESSAGES.signInFailed)
    if (!user.active) throw new FriendlyError(MESSAGES.accountInactive)
    return user
  },

  async requestPasswordReset(email: string): Promise<void> {
    await wait(600)
    if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(email.trim()))
      throw new FriendlyError('Please enter your MSU at Naawan email address (it ends with @msunaawan.edu.ph).')
  },

  submitRequest: (user: User, input: { typeId: string; title: string; description: string; files: engine.NewFile[] }) =>
    mutate((d, at) => engine.submitRequest(d, user, input, at)),

  /** REQ-REC-8: College Secretary creates a record for a document received in person. */
  encodeWalkInRequest: (
    actor: User,
    input: { requesterId: string; typeId: string; title: string; description: string; files: engine.NewFile[] },
  ) =>
    mutate((d, at) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can encode walk-in documents.')
      const requester = d.users.find((u) => u.id === input.requesterId)
      if (!requester) throw new FriendlyError('Please select a valid requester account.')
      return engine.submitRequest(
        d,
        requester,
        {
          typeId: input.typeId,
          title: input.title,
          description: input.description,
          files: input.files,
          encodedBySecretary: true,
          encodedByName: actor.name,
        },
        at,
      )
    }),

  resubmit: (user: User, docId: string, input: { title: string; description: string; files: engine.NewFile[]; note: string }) =>
    mutate((d, at) => engine.resubmit(d, user, docId, input, at)),

  checkRequirements: (user: User, docId: string, input: { decision?: 'complete' | 'return'; missing: string[]; reasons: string }) =>
    mutate((d, at) => engine.checkRequirements(d, user, docId, input, at)),

  recordReview: (user: User, docId: string, input: { kind: engine.ReviewKind; remarks: string }) =>
    mutate((d, at) => engine.recordReview(d, user, docId, input, at)),

  sendToExternal: (user: User, docId: string, input: { office: ExternalOfficeId; handedBy: string; remarks: string }) =>
    mutate((d, at) => engine.sendToExternal(d, user, docId, input, at)),

  recordExternalReturn: (user: User, docId: string, input: { remarks: string }) =>
    mutate((d, at) => engine.recordExternalReturn(d, user, docId, input, at)),

  markReady: (user: User, docId: string) => mutate((d, at) => engine.markReady(d, user, docId, at)),

  recordRelease: (user: User, docId: string, input: { receivedBy: string; signedFile?: engine.NewFile }) =>
    mutate((d, at) => engine.recordRelease(d, user, docId, input, at)),

  postNotice: (user: User, input: { kind: 'notice' | 'minutes'; title: string; summary: string; fileName: string }) =>
    mutate((d, at) => engine.postNotice(d, user, input, at)),

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
  saveUserAccount: (
    actor: User,
    input: {
      id?: string
      name: string
      email: string
      role: Role
      origin?: Origin
      department: string
      position: string
    },
  ) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary (System Admin) can manage accounts.')
      const cleanName = input.name.trim()
      const cleanEmail = input.email.trim().toLowerCase()
      if (!cleanName) throw new FriendlyError('Please enter the user’s full name.')
      if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(cleanEmail))
        throw new FriendlyError('Please enter a valid MSU at Naawan university email address (@msunaawan.edu.ph).')
      const dup = d.users.find((u) => u.email.toLowerCase() === cleanEmail && u.id !== input.id)
      if (dup) throw new FriendlyError('Another account is already using that university email address.')

      const isReq = input.role === 'student' || input.role === 'faculty'
      const origin: Origin | undefined = isReq ? (input.origin ?? 'CESS') : undefined

      if (input.id) {
        const existing = d.users.find((u) => u.id === input.id)
        if (!existing) throw new FriendlyError('Account not found.')
        existing.name = cleanName
        existing.email = cleanEmail
        existing.role = input.role
        existing.origin = origin
        existing.department = input.department.trim() || existing.department
        existing.position = input.position.trim() || existing.position
        return existing
      } else {
        const created: User = {
          id: engine.nextId(d, 'u-'),
          name: cleanName,
          email: cleanEmail,
          role: input.role,
          origin,
          department: input.department.trim() || 'College of Education and Social Sciences',
          position: input.position.trim() || (input.role === 'student' ? 'Student' : 'Faculty'),
          active: true,
          notificationPreference: 'both',
        }
        d.users.push(created)
        return created
      }
    }),

  setUserActive: (actor: User, userId: string, active: boolean) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can manage accounts.')
      if (actor.id === userId) throw new FriendlyError('You can’t deactivate your own account.')
      const u = d.users.find((x) => x.id === userId)
      if (u) u.active = active
    }),

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
      if (docType.requirements.length === 0)
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
    }),

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

  /** REQ-INFO-3: Add, edit, or remove faculty, subjects, and syllabus files. */
  saveFacultyEntry: (actor: User, entry: FacultyEntry) =>
    mutate((d) => {
      if (actor.role !== 'secretary')
        throw new FriendlyError('Only the College Secretary can add or edit faculty and syllabus records.')
      if (!entry.name.trim() || !entry.department.trim())
        throw new FriendlyError('Please enter the faculty member’s name and department.')
      const cleaned: FacultyEntry = {
        id: entry.id || engine.nextId(d, 'fac-'),
        name: entry.name.trim(),
        department: entry.department.trim(),
        subjects: entry.subjects
          .filter((s) => s.code.trim() || s.title.trim())
          .map((s) => ({
            code: s.code.trim(),
            title: s.title.trim(),
            syllabusFile: s.syllabusFile?.trim() || undefined,
          })),
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

  updateReminderDays: (actor: User, days: number) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can change reminder settings.')
      if (!(days >= 1 && days <= 14)) throw new FriendlyError('Please choose a number of days between 1 and 14.')
      d.settings.reminderEveryDays = days
    }),

  resetDemo() {
    commit(createSeed())
  },
}
