/**
 * Read-only queries. These enforce what each role may see (REQ-AUTH-4):
 * requesters see their own documents, reviewing offices see documents routed
 * to their office, and the College Secretary sees everything.
 */
import { ROLE_OFFICE } from '../content/language'
import { daysSince, workingDaysSince } from '../lib/time'
import { lastSubmittedAt } from './engine'
import type { Database, DocRecord, DocumentType, User } from './types'

export function canView(user: User, doc: DocRecord): boolean {
  if (user.role === 'secretary') return true
  if (doc.requesterId === user.id) return true
  const office = ROLE_OFFICE[user.role]
  return !!office && doc.route.some((s) => s.office === office)
}

export function visibleDocuments(db: Database, user: User): DocRecord[] {
  return db.documents.filter((d) => canView(user, d))
}

export function typeOf(db: Database, doc: DocRecord): DocumentType | undefined {
  return db.documentTypes.find((t) => t.id === doc.typeId)
}

export function userById(db: Database, id: string): User | undefined {
  return db.users.find((u) => u.id === id)
}

export function isActive(doc: DocRecord): boolean {
  return doc.status === 'submitted' || doc.status === 'with_office' || doc.status === 'with_external'
}

/** REQ-WFM-8 — past the upper limit of the standard processing time. */
export function isDelayed(db: Database, doc: DocRecord, now = Date.now()): boolean {
  if (!isActive(doc)) return false
  const t = typeOf(db, doc)
  if (!t) return false
  return workingDaysSince(lastSubmittedAt(doc), now) > t.processingDays[1]
}

export function daysWaiting(doc: DocRecord, now = Date.now()): number {
  return daysSince(doc.officeSince, now)
}

/** Oldest submitted first (REQ-ORD-1). */
export function byOldest(a: DocRecord, b: DocRecord) {
  return new Date(lastSubmittedAt(a)).getTime() - new Date(lastSubmittedAt(b)).getTime()
}

export function byNewest(a: DocRecord, b: DocRecord) {
  return -byOldest(a, b)
}

/** Documents waiting for this reviewing office's decision. */
export function reviewInbox(db: Database, user: User): DocRecord[] {
  const office = ROLE_OFFICE[user.role]
  return db.documents
    .filter(
      (d) =>
        d.status === 'with_office' &&
        d.currentOffice === office &&
        d.route[d.routeIndex]?.stage === 'review' &&
        d.requesterId !== user.id,
    )
    .sort(byOldest)
}

/** Documents this office has already recorded a decision on. */
export function reviewedBy(db: Database, user: User): DocRecord[] {
  const office = ROLE_OFFICE[user.role]
  if (!office) return []
  return db.documents
    .filter((d) => d.history.some((h) => h.actorName === user.name && ['endorsed', 'approved', 'returned', 'rejected'].includes(h.action)))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function secretaryQueues(db: Database) {
  const docs = db.documents
  return {
    toCheck: docs.filter((d) => d.status === 'submitted').sort(byOldest),
    inReview: docs.filter((d) => d.status === 'with_office').sort(byOldest),
    toProcess: docs.filter((d) => d.status === 'with_office' && d.route[d.routeIndex]?.stage === 'final').sort(byOldest),
    external: docs.filter((d) => d.status === 'with_external').sort(byOldest),
    ready: docs.filter((d) => d.status === 'ready').sort(byOldest),
    returned: docs.filter((d) => d.status === 'returned').sort(byOldest),
    rejected: docs.filter((d) => d.status === 'rejected').sort(byOldest),
    ids: docs.filter((d) => d.origin === 'IDS' && !d.archived).sort(byOldest),
  }
}

/** In-system notifications for this user, respecting REQ-NOT-7 hybrid toggle. */
export function myNotifications(db: Database, user: User) {
  if (user.notificationPreference === 'email_only') return []
  const office = ROLE_OFFICE[user.role]
  return db.notifications.filter((n) => {
    const isForUser = n.recipientId === user.id || (office && n.recipientId === office)
    if (!isForUser) return false
    if (n.channels && !n.channels.includes('in_system')) return false
    return true
  })
}

export function unreadCount(db: Database, user: User) {
  return myNotifications(db, user).filter((n) => !n.readBy.includes(user.id) && !n.readBy.includes(n.recipientId)).length
}
