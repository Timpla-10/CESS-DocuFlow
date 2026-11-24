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
import { respondToConsultation, submitConsultation } from './consultations'
import { createCustomDocumentTypes, isCustomDocumentType } from './customDocumentTypes'
import * as engine from './engine'
import { DB_VERSION, DEMO_PASSWORD, createSeed } from './seed'
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
  PendingRegistration,
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
      if (parsed.version === DB_VERSION || parsed.version === 14 || parsed.version === 13 || parsed.version === 12 || parsed.version === 11) {
        parsed.version = DB_VERSION
        for (const u of parsed.users) {
          if (u.role === 'ids_principal' && !u.origin) {
            u.origin = 'IDS'
          }
          if (!u.notificationPreference) {
            u.notificationPreference = 'both'
          }
        }
        if (!parsed.users.some((u) => u.role === 'vcaf')) {
          const fresh = createSeed()
          const vcafUser = fresh.users.find((u) => u.role === 'vcaf')
          if (vcafUser) parsed.users.push(vcafUser)
        }
        for (const type of createCustomDocumentTypes()) {
          if (!parsed.documentTypes.some((item) => item.id === type.id)) parsed.documentTypes.push(type)
        }
        return parsed
      }
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Runs an engine action on a copy of the data, then saves it. */
async function mutate<T>(fn: (draft: Database, at: string) => T, requirePersistence = false): Promise<T> {
  await wait(350 + Math.random() * 350)
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

// Send any reminders that came due while the app was closed (REQ-NOT-3).
{
  const draft = structuredClone(db)
  const before = draft.notifications.length
  engine.runReminders(draft, Date.now())
  if (draft.notifications.length !== before) commit(draft)
}

export const api = {
  async signIn(email: string, password: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase()
    if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(cleanEmail)) {
      throw new FriendlyError('Only official university Gmail accounts (@msunaawan.edu.ph) are accepted.')
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.user) {
          const liveUser: User = {
            id: data.user.id || data.user.user_id,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role,
            origin: data.user.origin,
            department: data.user.department,
            position: data.user.position,
            active: data.user.active ?? true,
          }
          const existingIdx = db.users.findIndex((u) => u.email.toLowerCase() === cleanEmail)
          if (existingIdx >= 0) {
            db.users[existingIdx] = { ...db.users[existingIdx], ...liveUser }
          } else {
            db.users.push(liveUser)
          }
          // PB-10 & PB-11: Sync live document types and requirement checklists from backend
          try {
            const dtRes = await fetch('/api/document-types', {
              headers: { 'x-user-email': liveUser.email },
            })
            if (dtRes.ok) {
              const dtData = await dtRes.json()
              if (Array.isArray(dtData.documentTypes) && dtData.documentTypes.length > 0) {
                for (const lt of dtData.documentTypes) {
                  const existingIdx = db.documentTypes.findIndex(
                    (t) => !isCustomDocumentType(t.id) && (t.name.toLowerCase() === lt.name.toLowerCase() || t.id === String(lt.id))
                  )
                  const mappedReqs = (lt.requirements || []).map((r: any) => ({
                    id: String(r.id || r.form_id),
                    label: r.label || r.form_name,
                    required: r.required !== undefined ? r.required : r.is_required,
                    source: r.source || r.source_office,
                    why: `Where to get it: ${r.source || r.source_office}`,
                    templateUrl: r.template_url || r.templateUrl,
                  }))
                  const mappedType: DocumentType = {
                    id: String(lt.id),
                    name: lt.name,
                    audience: lt.audience,
                    summary: lt.summary,
                    processingDays: [lt.standard_processing_days || 3, (lt.standard_processing_days || 3) + 2],
                    cessRoute: ['chairperson', 'dean'],
                    idsRoute: ['chairperson', 'ids_principal', 'dean'],
                    higherApproval: lt.audience === 'faculty' ? ['ovcaa', 'chancellor'] : [],
                    requirements: mappedReqs,
                  }
                  if (existingIdx >= 0) {
                    db.documentTypes[existingIdx] = { ...db.documentTypes[existingIdx], ...mappedType }
                  } else {
                    db.documentTypes.push(mappedType)
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Backend sync for document types skipped:', e)
          }

          commit({ ...db })
          return liveUser
        }
      } else if (res.status === 400 || res.status === 401 || res.status === 403) {
        const errJson = await res.json().catch(() => null)
        if (errJson?.error) {
          throw new FriendlyError(errJson.error)
        }
      }
    } catch (err) {
      if (err instanceof FriendlyError) throw err
      // Fallback to prototype mock if backend is offline
    }

    await wait(300)
    const user = db.users.find((u) => u.email.toLowerCase() === cleanEmail)
    if (!user || password !== DEMO_PASSWORD) {
      throw new FriendlyError(MESSAGES.signInFailed)
    }
    if (!user.active) throw new FriendlyError(MESSAGES.accountInactive)
    return user
  },

  async signInWithUniversityGoogle(email: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase()
    if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(cleanEmail)) {
      throw new FriendlyError('Only official university Gmail accounts (@msunaawan.edu.ph) are accepted.')
    }

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.user) {
          const liveUser: User = {
            id: data.user.id || data.user.user_id,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role,
            origin: data.user.origin,
            department: data.user.department,
            position: data.user.position,
            active: data.user.active ?? true,
          }
          const existingIdx = db.users.findIndex((u) => u.email.toLowerCase() === cleanEmail)
          if (existingIdx >= 0) {
            db.users[existingIdx] = { ...db.users[existingIdx], ...liveUser }
          } else {
            db.users.push(liveUser)
          }
          // PB-10 & PB-11: Sync live document types and requirement checklists from backend
          try {
            const dtRes = await fetch('/api/document-types', {
              headers: { 'x-user-email': liveUser.email },
            })
            if (dtRes.ok) {
              const dtData = await dtRes.json()
              if (Array.isArray(dtData.documentTypes) && dtData.documentTypes.length > 0) {
                for (const lt of dtData.documentTypes) {
                  const existingIdx = db.documentTypes.findIndex(
                    (t) => t.name.toLowerCase() === lt.name.toLowerCase() || t.id === String(lt.id)
                  )
                  const mappedReqs = (lt.requirements || []).map((r: any) => ({
                    id: String(r.id || r.form_id),
                    label: r.label || r.form_name,
                    required: r.required !== undefined ? r.required : r.is_required,
                    source: r.source || r.source_office,
                    why: `Where to get it: ${r.source || r.source_office}`,
                    templateUrl: r.template_url || r.templateUrl,
                  }))
                  const mappedType: DocumentType = {
                    id: String(lt.id),
                    name: lt.name,
                    audience: lt.audience,
                    summary: lt.summary,
                    processingDays: [lt.standard_processing_days || 3, (lt.standard_processing_days || 3) + 2],
                    cessRoute: ['chairperson', 'dean'],
                    idsRoute: ['chairperson', 'ids_principal', 'dean'],
                    higherApproval: lt.audience === 'faculty' ? ['ovcaa', 'chancellor'] : [],
                    requirements: mappedReqs,
                  }
                  if (existingIdx >= 0) {
                    db.documentTypes[existingIdx] = { ...db.documentTypes[existingIdx], ...mappedType }
                  } else {
                    db.documentTypes.push(mappedType)
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Backend sync for document types skipped:', e)
          }

          commit({ ...db })
          return liveUser
        }
      } else if (res.status === 400 || res.status === 401 || res.status === 403) {
        const errJson = await res.json().catch(() => null)
        if (errJson?.error) {
          throw new FriendlyError(errJson.error)
        }
      }
    } catch (err) {
      if (err instanceof FriendlyError) throw err
      // Fallback to prototype mock if backend is offline
    }

    await wait(300)
    const user = db.users.find((u) => u.email.toLowerCase() === cleanEmail)
    if (!user) {
      throw new FriendlyError('No active university account was found for this Gmail address. Please register or contact the College Secretary.')
    }
    if (!user.active) throw new FriendlyError(MESSAGES.accountInactive)
    return user
  },

  async requestPasswordReset(email: string): Promise<void> {
    await wait(600)
    if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(email.trim()))
      throw new FriendlyError('Please enter your official university Gmail address (ending with @msunaawan.edu.ph).')
  },

  submitConsultation: (user: User, input: Parameters<typeof submitConsultation>[2]) =>
    mutate((d, at) => submitConsultation(d, user, input, at), true),

  respondToConsultation: (user: User, requestId: string, input: Parameters<typeof respondToConsultation>[3]) =>
    mutate((d, at) => respondToConsultation(d, user, requestId, input, at), true),

  submitRequest: (user: User, input: { typeId: string; title: string; description: string; customTypeName?: string; files: engine.NewFile[] }) =>
    mutate((d, at) => engine.submitRequest(d, user, input, at), isCustomDocumentType(input.typeId)),

  /** REQ-REC-8: College Secretary creates a record for a document received in person. */
  encodeWalkInRequest: (
    actor: User,
    { requesterId, ...input }: { requesterId: string; typeId: string; title: string; description: string; customTypeName?: string; files: engine.NewFile[] },
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
      await fetch(`/api/documents/${docId}/resubmit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user.email,
        },
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          notes: input.note,
          files: input.files,
        }),
      })
    } catch {
      // Fallback gracefully to client store
    }
    return mutate((d, at) => engine.resubmit(d, user, docId, input, at))
  },

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
      notificationPreference?: NotificationPreference
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
        if (input.notificationPreference) {
          existing.notificationPreference = input.notificationPreference
        }
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
          notificationPreference: input.notificationPreference ?? 'both',
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

  /** Masterlist / Whitelist Import (REQ-AUTH-3, Pre-loaded Semester Masterlist) */
  importWhitelist: (
    actor: User,
    entries: Omit<WhitelistEntry, 'id' | 'status' | 'term' | 'importedAt' | 'importedBy'>[],
    term: string,
  ) =>
    mutate((d, at) => {
      if (actor.role !== 'secretary') {
        throw new FriendlyError('Only the College Secretary can import masterlists.')
      }
      if (!term.trim()) {
        throw new FriendlyError('Please specify the academic term for this masterlist.')
      }
      if (!entries.length) {
        throw new FriendlyError('No valid rows found in the imported file.')
      }

      let added = 0
      let updated = 0

      for (const entry of entries) {
        const cleanEmail = entry.email.trim().toLowerCase()
        if (!cleanEmail || !cleanEmail.endsWith('@msunaawan.edu.ph')) continue

        const existingUser = d.users.find((u) => u.email.toLowerCase() === cleanEmail)
        const isAlreadyActive = !!existingUser

        const existingWl = d.whitelist.find((w) => w.email.toLowerCase() === cleanEmail)
        if (existingWl) {
          existingWl.idNumber = entry.idNumber || existingWl.idNumber
          existingWl.name = entry.name || existingWl.name
          existingWl.role = entry.role || existingWl.role
          existingWl.department = entry.department || existingWl.department
          existingWl.origin = entry.origin ?? existingWl.origin
          existingWl.term = term.trim()
          existingWl.status = isAlreadyActive ? 'activated' : existingWl.status
          existingWl.importedAt = at
          existingWl.importedBy = actor.name
          updated++
        } else {
          d.whitelist.push({
            id: engine.nextId(d, 'wl-'),
            idNumber: entry.idNumber.trim(),
            name: entry.name.trim(),
            email: cleanEmail,
            role: entry.role,
            department: entry.department.trim(),
            origin: entry.origin ?? 'CESS',
            term: term.trim(),
            status: isAlreadyActive ? 'activated' : 'pre_registered',
            importedAt: at,
            importedBy: actor.name,
          })
          added++
        }
      }

      return { added, updated, total: entries.length }
    }),

  deleteWhitelistEntry: (actor: User, entryId: string) =>
    mutate((d) => {
      if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can manage the whitelist.')
      const idx = d.whitelist.findIndex((w) => w.id === entryId)
      if (idx !== -1) {
        d.whitelist.splice(idx, 1)
      }
    }),

  approvePendingRegistration: (
    actor: User,
    registrationId: string,
    overrides?: { role?: Role; department?: string; origin?: Origin },
  ) =>
    mutate((d, at) => {
      if (actor.role !== 'secretary') {
        throw new FriendlyError('Only the College Secretary can approve pending registrations.')
      }
      const reg = d.pendingRegistrations.find((r) => r.id === registrationId)
      if (!reg) throw new FriendlyError('Pending registration record not found.')
      if (reg.status !== 'pending') throw new FriendlyError('This registration request has already been processed.')

      const role = overrides?.role ?? reg.requestedRole
      const department = overrides?.department ?? reg.department
      const origin = overrides?.origin ?? reg.origin ?? 'CESS'

      // Check if user account already exists
      let existing = d.users.find((u) => u.email.toLowerCase() === reg.email.toLowerCase())
      if (existing) {
        existing.active = true
        existing.role = role
        existing.department = department
        existing.origin = role === 'student' || role === 'faculty' ? origin : undefined
      } else {
        const newUser: User = {
          id: engine.nextId(d, 'u-'),
          name: reg.name,
          email: reg.email.toLowerCase(),
          role,
          department,
          origin: role === 'student' || role === 'faculty' ? origin : undefined,
          position: role === 'student' ? 'Student' : 'Faculty',
          active: true,
          notificationPreference: 'both',
        }
        d.users.push(newUser)
        existing = newUser
      }

      reg.status = 'approved'

      // Mark or insert whitelist record
      const wl = d.whitelist.find((w) => w.email.toLowerCase() === reg.email.toLowerCase())
      if (wl) {
        wl.status = 'activated'
        wl.role = role as any
        wl.department = department
        wl.origin = origin
      } else {
        d.whitelist.push({
          id: engine.nextId(d, 'wl-'),
          idNumber: reg.idNumber ?? 'UNLISTED-APP',
          name: reg.name,
          email: reg.email.toLowerCase(),
          role: role as any,
          department,
          origin,
          term: 'Current Semester',
          status: 'activated',
          importedAt: at,
          importedBy: actor.name,
        })
      }

      // Add notification log
      const pref = existing.notificationPreference ?? 'both'
      const channels: ('email' | 'in_system')[] =
        pref === 'email_only' ? ['email'] : pref === 'in_system_only' ? ['in_system'] : ['email', 'in_system']

      d.notifications.unshift({
        id: engine.nextId(d, 'n'),
        kind: 'update',
        recipientId: existing.id,
        recipientLabel: existing.name,
        recipientEmail: existing.email,
        subject: 'CESS DocuFlow Account Verified & Approved',
        body: `Welcome to CESS DocuFlow! Your university registration has been officially verified and approved by the College Secretary (${actor.name}). You can now sign in with your institutional email.`,
        at,
        result: 'sent',
        readBy: [],
        channels,
      })

      return existing
    }),

  rejectPendingRegistration: (actor: User, registrationId: string, reason: string) =>
    mutate((d, at) => {
      if (actor.role !== 'secretary') {
        throw new FriendlyError('Only the College Secretary can reject registrations.')
      }
      const reg = d.pendingRegistrations.find((r) => r.id === registrationId)
      if (!reg) throw new FriendlyError('Pending registration record not found.')
      reg.status = 'rejected'
      reg.rejectionReason = reason.trim() || 'Institutional verification could not be completed.'

      d.notifications.unshift({
        id: engine.nextId(d, 'n'),
        kind: 'update',
        recipientId: reg.id,
        recipientLabel: reg.name,
        recipientEmail: reg.email,
        subject: 'CESS DocuFlow Registration Status',
        body: `Your registration request for CESS DocuFlow was not approved. Reason: ${reg.rejectionReason}. Please contact the College Secretary for assistance.`,
        at,
        result: 'sent',
        readBy: [],
        channels: ['email'],
      })
    }),

  registerUser: (input: {
    name: string
    email: string
    idNumber?: string
    requestedRole: Role
    department: string
    origin?: Origin
  }) =>
    mutate((d, at) => {
      const cleanName = input.name.trim()
      const cleanEmail = input.email.trim().toLowerCase()
      if (!cleanName) throw new FriendlyError('Please enter your full name.')
      if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(cleanEmail)) {
        throw new FriendlyError('Please enter your valid MSU at Naawan email address (@msunaawan.edu.ph).')
      }

      const existingUser = d.users.find((u) => u.email.toLowerCase() === cleanEmail)
      if (existingUser) {
        throw new FriendlyError('An account with this institutional email already exists. Please proceed to Sign In.')
      }

      // Check Whitelist match
      const wlMatch = d.whitelist.find((w) => w.email.toLowerCase() === cleanEmail)

      if (wlMatch) {
        // Instant Activation via Masterlist Whitelist
        const role = wlMatch.role
        const department = wlMatch.department || input.department
        const origin = wlMatch.origin ?? input.origin ?? 'CESS'
        const newUser: User = {
          id: engine.nextId(d, 'u-'),
          name: wlMatch.name || cleanName,
          email: cleanEmail,
          role,
          department,
          origin: role === 'student' || role === 'faculty' ? origin : undefined,
          position: role === 'student' ? 'Student' : 'Faculty',
          active: true,
          notificationPreference: 'both',
        }
        d.users.push(newUser)
        wlMatch.status = 'activated'

        d.notifications.unshift({
          id: engine.nextId(d, 'n'),
          kind: 'update',
          recipientId: newUser.id,
          recipientLabel: newUser.name,
          recipientEmail: newUser.email,
          subject: 'Welcome to CESS DocuFlow (Masterlist Verified)',
          body: `Your student/faculty record was verified against the official semester masterlist. Your account is active. Welcome!`,
          at,
          result: 'sent',
          readBy: [],
          channels: ['email', 'in_system'],
        })

        return { status: 'activated' as const, user: newUser }
      }

      // Unlisted User: Queue for College Secretary approval
      const existingPending = d.pendingRegistrations.find(
        (p) => p.email.toLowerCase() === cleanEmail && p.status === 'pending',
      )
      if (existingPending) {
        throw new FriendlyError(
          'Your registration is already pending verification with the College Secretary. Please await approval.',
        )
      }

      const pending: PendingRegistration = {
        id: engine.nextId(d, 'pr-'),
        name: cleanName,
        email: cleanEmail,
        idNumber: input.idNumber?.trim(),
        requestedRole: input.requestedRole,
        department: input.department.trim(),
        origin: input.origin ?? 'CESS',
        submittedAt: at,
        status: 'pending',
      }
      d.pendingRegistrations.push(pending)

      return { status: 'pending' as const, pending }
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
        updatedAt: new Date().toISOString(),
        uploadedBy: actor.name,
        fileSize: template.fileSize || 'Official Template',
      }
    }),

  /** Faculty self-service: Upload or update syllabus for own subject. */
  uploadFacultySyllabus: (actor: User, facultyId: string, subjectCode: string, fileName: string) =>
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
          fileSizeKb: 450,
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
          fileSizeKb: existing.fileSizeKb || 450,
          uploadedAt: existing.uploadedAt,
          uploadedBy: existing.facultyName,
          changeNote: existing.changeNote || 'Initial syllabus release',
        })

        d.syllabi[existingIdx] = {
          ...existing,
          subjectTitle: title,
          fileName,
          fileSizeKb: payload.fileSizeKb || existing.fileSizeKb || 450,
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
          fileSizeKb: payload.fileSizeKb || 450,
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
  updateTosTemplate: (actor: User, fileName: string, fileSize?: string) =>
    mutate((d) => {
      if (actor.role !== 'secretary') {
        throw new FriendlyError('Only the College Secretary is authorized to update the institutional TOS template.')
      }
      d.tosTemplate = {
        fileName,
        updatedAt: new Date().toISOString(),
        uploadedBy: `${actor.name} (College Secretary)`,
        fileSize: fileSize || '94 KB',
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
      const totalItems = payload.totalItems || 50

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
          fileSizeKb: payload.fileSizeKb || existing.fileSizeKb || 115,
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
          cognitiveDistribution: payload.cognitiveDistribution || {
            remembering: 15,
            understanding: 15,
            applying: 10,
            analyzing: 5,
            evaluating: 3,
            creating: 2,
          },
          fileName,
          fileSizeKb: payload.fileSizeKb || 115,
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

  resetDemo() {
    commit(createSeed())
  },
}
