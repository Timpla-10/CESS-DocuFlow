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
  PendingRegistration,
  Role,
  SyllabusTemplate,
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
        }
        if (!parsed.users.some((u) => u.role === 'vcaf')) {
          const fresh = createSeed()
          const vcafUser = fresh.users.find((u) => u.role === 'vcaf')
          if (vcafUser) parsed.users.push(vcafUser)
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

  resubmit: async (user: User, docId: string, input: { title: string; description: string; files: engine.NewFile[]; note: string }) => {
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
        channels: ['email', 'in_system'],
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
