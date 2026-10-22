/**
 * Workflow engine — pure business rules for CESS DocuFlow.
 *
 * Implements the documented process (SRS v1.3 §3.1–3.13, proposal Figure 2):
 *   Requester submits (automatic completeness check) → College Secretary verifies content
 *   → Department Chairperson → [IDS Principal 1st/2nd review, IDS only] → College Dean
 *   → [OVCAA → Office of the Chancellor, when the Dean marks higher approval]
 *   → College Secretary (optional external office) → Ready for Release → Released (with signed scan).
 * Any reviewing office may return a document to the requester with reasons.
 *
 * Every function mutates the given `db` draft and returns it. Callers are
 * responsible for cloning (the mock API does this before each action).
 */
import { FriendlyError, MESSAGES, OFFICE_LABEL, ROLE_OFFICE, controlNumber, externalOfficeLabel } from '../content/language'
import { daysSince, plural } from '../lib/time'
import type {
  Attachment,
  Database,
  DocRecord,
  DocumentType,
  ExternalOfficeId,
  HistoryEntry,
  NotificationKind,
  NotificationLog,
  OfficeId,
  Role,
  RouteStep,
  User,
} from './types'

export const MAX_FILE_MB = 10
export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const ACCEPTED_EXT = ['.pdf', '.jpg', '.jpeg', '.png']

export interface NewFile {
  requirementId?: string
  name: string
  sizeKb: number
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

export function nextId(db: Database, prefix: string): string {
  db.counter += 1
  return `${prefix}${db.counter}`
}

export function getType(db: Database, typeId: string): DocumentType {
  const t = db.documentTypes.find((x) => x.id === typeId)
  if (!t) throw new FriendlyError('That document type is no longer available. Please choose another one.')
  return t
}

function getDoc(db: Database, docId: string): DocRecord {
  const d = db.documents.find((x) => x.id === docId)
  if (!d) throw new FriendlyError(MESSAGES.notFound)
  return d
}

function getUser(db: Database, userId: string): User | undefined {
  return db.users.find((u) => u.id === userId)
}

function officeOf(user: User): OfficeId {
  const o = ROLE_OFFICE[user.role]
  if (!o) throw new FriendlyError('Your account isn’t set up to record decisions on documents.')
  return o
}

function addHistory(doc: DocRecord, entry: Omit<HistoryEntry, 'id' | 'revision'>, db: Database) {
  doc.history.push({ ...entry, id: nextId(db, 'h'), revision: doc.revision })
  doc.updatedAt = entry.at
}

function moveTo(doc: DocRecord, index: number, at: string) {
  doc.routeIndex = index
  doc.currentOffice = doc.route[index]?.office ?? null
  doc.officeSince = at
}

/**
 * Builds the route from the document type and origin (REQ-ROUTE-1..4).
 * Uses editable `cessRoute` / `idsRoute` on DocumentType when configured,
 * and labels repeated offices (e.g. IDS Principal 1st and 2nd review, REQ-ROUTE-3).
 */
export function buildRoute(origin: DocRecord['origin'], type?: DocumentType, requesterRole?: Role): RouteStep[] {
  const defaultReviewOffices: OfficeId[] =
    origin === 'IDS' ? ['chairperson', 'ids_principal', 'dean'] : ['chairperson', 'dean']

  const configured = origin === 'IDS' ? type?.idsRoute : type?.cessRoute
  let reviewOffices = configured && configured.length > 0 ? [...configured] : defaultReviewOffices

  // If the requester is the IDS Principal herself, she doesn't review her own document;
  // her request is reviewed by the Chairperson and College Dean
  if (requesterRole === 'ids_principal') {
    reviewOffices = reviewOffices.filter((o) => o !== 'ids_principal')
    if (reviewOffices.length === 0) reviewOffices = ['chairperson', 'dean']
  }

  // Count occurrences to label 1st / 2nd reviews when an office appears twice (REQ-ROUTE-3)
  const totals = new Map<OfficeId, number>()
  for (const o of reviewOffices) totals.set(o, (totals.get(o) ?? 0) + 1)
  const seen = new Map<OfficeId, number>()

  const steps: RouteStep[] = [{ office: 'secretary', stage: 'check' }]
  for (const o of reviewOffices) {
    const count = (seen.get(o) ?? 0) + 1
    seen.set(o, count)
    const total = totals.get(o) ?? 1
    const label =
      total > 1
        ? `${OFFICE_LABEL[o]} (${count === 1 ? '1st Review' : count === 2 ? '2nd Review' : `Review ${count}`})`
        : undefined
    steps.push({ office: o, stage: 'review', label })
  }
  steps.push({ office: 'secretary', stage: 'final' })
  return steps
}

/** The last time the requester submitted (used for Delayed — which date applies is TBD, REQ-ORD-1). */
export function lastSubmittedAt(doc: DocRecord): string {
  for (let i = doc.history.length - 1; i >= 0; i--) {
    const h = doc.history[i]
    if (h.action === 'submitted' || h.action === 'resubmitted') return h.at
  }
  return doc.submittedAt
}

function requesterLink(doc: DocRecord) {
  return `/app/documents/${doc.id}`
}

function resolveChannels(db: Database, recipientId: string): ('email' | 'in_system')[] {
  const u = getUser(db, recipientId)
  const pref = u?.notificationPreference ?? 'both'
  if (pref === 'email_only') return ['email']
  if (pref === 'in_system_only') return ['in_system']
  return ['email', 'in_system']
}

function notify(
  db: Database,
  n: {
    kind: NotificationKind
    recipientId: string
    recipientLabel: string
    recipientEmail: string
    doc?: DocRecord
    subject: string
    body: string
    at: string
    result?: 'sent' | 'failed'
  },
) {
  const channels = resolveChannels(db, n.recipientId)
  const log: NotificationLog = {
    id: nextId(db, 'n'),
    kind: n.kind,
    recipientId: n.recipientId,
    recipientLabel: n.recipientLabel,
    recipientEmail: n.recipientEmail,
    docId: n.doc?.id,
    subject: n.subject,
    body: n.body,
    at: n.at,
    result: n.result ?? 'sent',
    readBy: [],
    channels,
  }
  db.notifications.unshift(log)
  return log
}

function firstName(u: User) {
  return u.name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/, '').split(' ')[0]
}

const SIGNOFF = '\n\n— CESS DocuFlow\nCollege of Education and Social Sciences, MSU at Naawan'

function officeAccount(db: Database, office: OfficeId): User | undefined {
  return db.users.find((u) => ROLE_OFFICE[u.role] === office && u.active)
}

/* ------------------------------------------------------------------------ */
/* Requester & Walk-in Submission actions                                    */
/* ------------------------------------------------------------------------ */

export function submitRequest(
  db: Database,
  user: User,
  input: {
    typeId: string
    title: string
    description: string
    files: NewFile[]
    encodedBySecretary?: boolean
    encodedByName?: string
  },
  at: string,
): DocRecord {
  const type = getType(db, input.typeId)
  const userAudience = user.role === 'student' ? 'student' : 'faculty'
  if (type.audience !== userAudience) throw new FriendlyError('This document type isn’t available for the selected requester role.')
  validateFiles(type, input.files)
  const origin = user.origin ?? (user.role === 'ids_principal' || user.department.includes('Integrated Developmental School') ? 'IDS' : 'CESS')
  const id = nextId(db, 'd')
  const seq = db.documents.length + 1
  const year = new Date(at).getFullYear()
  const doc: DocRecord = {
    id,
    controlBase: `MSU-${origin}-COM-${String(seq).padStart(4, '0')}-${year}`,
    revision: 0,
    typeId: type.id,
    title: input.title.trim(),
    description: input.description.trim(),
    origin,
    requesterId: user.id,
    status: 'submitted',
    currentOffice: 'secretary',
    route: [{ office: 'secretary', stage: 'check' }],
    routeIndex: 0,
    submittedAt: at,
    officeSince: at,
    updatedAt: at,
    attachments: [],
    history: [],
    autoCompletenessPassed: true,
    encodedBySecretary: input.encodedBySecretary ?? false,
    archived: false,
  }
  const uploaderName = input.encodedByName ?? user.name
  doc.attachments = input.files.map((f) => toAttachment(db, f, 0, uploaderName, at))
  addHistory(
    doc,
    {
      at,
      office: input.encodedBySecretary ? OFFICE_LABEL.secretary : 'Requester',
      actorName: uploaderName,
      action: 'submitted',
      remarks: input.encodedBySecretary
        ? `Received in person from ${user.name} and encoded by the College Secretary.`
        : 'All required attachments verified present by automatic completeness check.',
    },
    db,
  )
  db.documents.push(doc)

  notify(db, {
    kind: 'submitted',
    recipientId: user.id,
    recipientLabel: user.name,
    recipientEmail: user.email,
    doc,
    subject: `We received your ${type.name} request`,
    body: `Hello ${firstName(user)},\n\nYour ${type.name} request (${controlNumber(doc)}) was received and passed the automatic completeness check. The College Secretary will verify the content of your documents, then route them for review.\n\nYou can follow its progress here: ${requesterLink(doc)}${SIGNOFF}`,
    at,
  })
  return doc
}

export function resubmit(
  db: Database,
  user: User,
  docId: string,
  input: { title: string; description: string; files: NewFile[]; note: string },
  at: string,
): DocRecord {
  const doc = getDoc(db, docId)
  if (doc.requesterId !== user.id) throw new FriendlyError(MESSAGES.notFound)
  if (doc.status !== 'returned')
    throw new FriendlyError('This request isn’t waiting for corrections, so it can’t be resubmitted right now.')
  if (input.files.length === 0 && !input.note.trim())
    throw new FriendlyError('Please attach at least one corrected file or explain what you changed.')

  // REQ-SUB-8: same Control Number, new Revision Number, earlier files and history kept.
  doc.revision += 1
  doc.title = input.title.trim()
  doc.description = input.description.trim()
  doc.attachments.push(...input.files.map((f) => toAttachment(db, f, doc.revision, user.name, at)))
  doc.status = 'submitted'
  doc.returnInfo = undefined
  doc.autoCompletenessPassed = true
  doc.contentVerification = undefined
  // REQ-ROUTE-9: goes back to the College Secretary's completeness check.
  doc.route = [{ office: 'secretary', stage: 'check' }]
  moveTo(doc, 0, at)
  addHistory(doc, { at, office: 'Requester', actorName: user.name, action: 'resubmitted', remarks: input.note.trim() || undefined }, db)
  return doc
}

function toAttachment(db: Database, f: NewFile, revision: number, by: string, at: string, isSignedCopy?: boolean): Attachment {
  return {
    id: nextId(db, 'a'),
    requirementId: f.requirementId,
    name: f.name,
    sizeKb: f.sizeKb,
    revision,
    uploadedAt: at,
    uploadedBy: by,
    isSignedCopy,
  }
}

export function validateFiles(type: DocumentType, files: NewFile[]) {
  for (const f of files) {
    if (f.sizeKb > MAX_FILE_MB * 1024) throw new FriendlyError(MESSAGES.fileTooLarge(f.name))
    const lower = f.name.toLowerCase()
    if (!ACCEPTED_EXT.some((e) => lower.endsWith(e))) throw new FriendlyError(MESSAGES.fileWrongType(f.name))
  }
  const missing = type.requirements.filter((r) => r.required && !files.some((f) => f.requirementId === r.id))
  if (missing.length)
    throw new FriendlyError(
      `Your request isn’t ready to submit yet. Please attach: ${missing.map((m) => m.label).join(', ')}.`,
    )
}

/* ------------------------------------------------------------------------ */
/* College Secretary actions                                                 */
/* ------------------------------------------------------------------------ */

/**
 * REQ-REQT-4..6 — record the content verification result;
 * complete → log and route; return → send back to requester with reasons.
 */
export function checkRequirements(
  db: Database,
  actor: User,
  docId: string,
  input: { decision?: 'complete' | 'return' | 'reject'; missing: string[]; reasons: string },
  at: string,
): DocRecord {
  if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can check requirements.')
  const doc = getDoc(db, docId)
  if (doc.status !== 'submitted') throw new FriendlyError(MESSAGES.notAllowedToAct)
  const type = getType(db, doc.typeId)

  if (input.decision === 'reject') {
    if (!input.reasons.trim())
      throw new FriendlyError('Please enter the reasons for disapproving/rejecting this submission.')
    const reasons = input.reasons.trim()
    doc.status = 'rejected'
    doc.currentOffice = null
    doc.officeSince = at
    doc.rejectionInfo = { office: OFFICE_LABEL.secretary, by: actor.name, at, reasons }
    doc.contentVerification = {
      verifiedBy: actor.name,
      at,
      result: 'returned',
      remarks: `Disapproved: ${reasons}`,
    }
    addHistory(
      doc,
      {
        at,
        office: OFFICE_LABEL.secretary,
        actorName: actor.name,
        action: 'rejected',
        remarks: reasons,
      },
      db,
    )
    notifyRejected(db, doc, OFFICE_LABEL.secretary, reasons, at)
    return doc
  }

  const isReturn = input.decision === 'return' || (input.decision !== 'complete' && (input.missing.length > 0 || !!input.reasons.trim()))

  if (isReturn) {
    if (!input.reasons.trim())
      throw new FriendlyError('Please enter the reasons for returning this submission (e.g., incorrect or incomplete information inside the documents).')
    const missingLabels = type.requirements.filter((r) => input.missing.includes(r.id)).map((r) => r.label)
    const reasons = input.reasons.trim()
    doc.status = 'returned'
    doc.currentOffice = null
    doc.officeSince = at
    doc.returnInfo = { office: OFFICE_LABEL.secretary, by: actor.name, at, reasons, missing: input.missing }
    doc.contentVerification = {
      verifiedBy: actor.name,
      at,
      result: 'returned',
      remarks: reasons,
    }
    addHistory(
      doc,
      {
        at,
        office: OFFICE_LABEL.secretary,
        actorName: actor.name,
        action: 'checked_incomplete',
        remarks: missingLabels.length ? `Flagged files: ${missingLabels.join(', ')}. ${reasons}` : reasons,
      },
      db,
    )
    notifyReturned(db, doc, OFFICE_LABEL.secretary, reasons, missingLabels, at)
    return doc
  }

  const remarks = input.reasons.trim() || 'Content verified accurate and complete.'
  doc.contentVerification = {
    verifiedBy: actor.name,
    at,
    result: 'complete',
    remarks,
  }
  addHistory(
    doc,
    {
      at,
      office: OFFICE_LABEL.secretary,
      actorName: actor.name,
      action: 'checked_complete',
      remarks: input.reasons.trim() || undefined,
    },
    db,
  )
  const requester = db.users.find((u) => u.id === doc.requesterId)
  doc.route = buildRoute(doc.origin, type, requester?.role)
  moveTo(doc, 1, at)
  doc.status = 'with_office'
  const firstReviewStep = doc.route[1]
  addHistory(
    doc,
    {
      at,
      office: OFFICE_LABEL.secretary,
      actorName: actor.name,
      action: 'routed',
      target: firstReviewStep ? (firstReviewStep.label ?? OFFICE_LABEL[firstReviewStep.office]) : OFFICE_LABEL.chairperson,
    },
    db,
  )
  return doc
}

export function sendToExternal(
  db: Database,
  actor: User,
  docId: string,
  input: { office: ExternalOfficeId; handedBy: string; remarks: string },
  at: string,
): DocRecord {
  if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can record office transfers.')
  const doc = getDoc(db, docId)
  if (!(doc.status === 'with_office' && doc.route[doc.routeIndex]?.stage === 'final'))
    throw new FriendlyError(MESSAGES.notAllowedToAct)
  doc.status = 'with_external'
  doc.externalOffice = input.office
  doc.currentOffice = null
  doc.officeSince = at
  addHistory(
    doc,
    {
      at,
      office: OFFICE_LABEL.secretary,
      actorName: actor.name,
      action: 'sent_external',
      target: externalOfficeLabel(input.office, db),
      remarks: [input.handedBy.trim() && `Handed over by ${input.handedBy.trim()}.`, input.remarks.trim()].filter(Boolean).join(' ') || undefined,
    },
    db,
  )
  return doc
}

export function recordExternalReturn(db: Database, actor: User, docId: string, input: { remarks: string }, at: string) {
  if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can record office transfers.')
  const doc = getDoc(db, docId)
  if (doc.status !== 'with_external' || !doc.externalOffice) throw new FriendlyError(MESSAGES.notAllowedToAct)
  const ext = externalOfficeLabel(doc.externalOffice, db)
  doc.status = 'with_office'
  doc.externalOffice = undefined
  doc.currentOffice = 'secretary'
  doc.officeSince = at
  addHistory(
    doc,
    { at, office: OFFICE_LABEL.secretary, actorName: actor.name, action: 'returned_external', target: ext, remarks: input.remarks.trim() || undefined },
    db,
  )
  return doc
}

export function markReady(db: Database, actor: User, docId: string, at: string) {
  if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can mark documents ready for release.')
  const doc = getDoc(db, docId)
  if (!(doc.status === 'with_office' && doc.route[doc.routeIndex]?.stage === 'final'))
    throw new FriendlyError(MESSAGES.notAllowedToAct)
  doc.status = 'ready'
  doc.officeSince = at
  addHistory(doc, { at, office: OFFICE_LABEL.secretary, actorName: actor.name, action: 'marked_ready' }, db)
  const req = getUser(db, doc.requesterId)
  const type = getType(db, doc.typeId)
  if (req) {
    notify(db, {
      kind: 'ready',
      recipientId: req.id,
      recipientLabel: req.name,
      recipientEmail: req.email,
      doc,
      subject: `Your ${type.name} is ready to collect`,
      body: `Hello ${firstName(req)},\n\nGood news — your ${type.name} (${controlNumber(doc)}) is ready. Please visit the College Secretary’s office to collect your signed document.\n\nView details: ${requesterLink(doc)}${SIGNOFF}`,
      at,
    })
  }
  return doc
}

export function recordRelease(
  db: Database,
  actor: User,
  docId: string,
  input: { receivedBy: string; signedFile?: NewFile },
  at: string,
) {
  if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can record a release.')
  const doc = getDoc(db, docId)
  if (doc.status !== 'ready') throw new FriendlyError(MESSAGES.notAllowedToAct)
  if (!input.receivedBy.trim()) throw new FriendlyError('Please enter the name of the person who received the document.')

  let signedFileName: string | undefined
  if (input.signedFile) {
    const att = toAttachment(db, input.signedFile, doc.revision, actor.name, at, true)
    doc.attachments.push(att)
    signedFileName = att.name
  }

  doc.status = 'released'
  doc.currentOffice = null
  doc.archived = true // REQ-REL-3: released documents are archived and read-only.
  doc.release = {
    receivedBy: input.receivedBy.trim(),
    at,
    recordedBy: actor.name,
    signedFileName,
  }
  addHistory(
    doc,
    {
      at,
      office: OFFICE_LABEL.secretary,
      actorName: actor.name,
      action: 'released',
      remarks: signedFileName
        ? `Received by ${input.receivedBy.trim()}. Final signed copy attached (${signedFileName}).`
        : `Received by ${input.receivedBy.trim()}.`,
    },
    db,
  )
  return doc
}

/* ------------------------------------------------------------------------ */
/* Reviewing office actions (REQ-ROUTE-5..8)                                 */
/* ------------------------------------------------------------------------ */

export type ReviewKind = 'endorse' | 'endorse_higher' | 'approve' | 'return' | 'reject'

export interface ReviewOption {
  kind: ReviewKind
  /** Office the document goes to next, if any. */
  next?: OfficeId
}

/** Which decisions the given office may record on this document right now. */
export function reviewOptions(db: Database, doc: DocRecord, office: OfficeId): ReviewOption[] {
  const step = doc.route[doc.routeIndex]
  if (doc.status !== 'with_office' || !step || step.stage !== 'review' || step.office !== office) return []
  const type = getType(db, doc.typeId)
  const nextStep = doc.route[doc.routeIndex + 1]
  const opts: ReviewOption[] = []
  if (office === 'dean' && type.higherApproval.length > 0) {
    opts.push({ kind: 'endorse_higher', next: type.higherApproval[0] })
    opts.push({ kind: 'approve' })
  } else if (nextStep && nextStep.stage === 'review') {
    opts.push({ kind: 'endorse', next: nextStep.office })
  } else {
    opts.push({ kind: 'approve' })
  }
  opts.push({ kind: 'return' })
  opts.push({ kind: 'reject' })
  return opts
}

export function recordReview(
  db: Database,
  actor: User,
  docId: string,
  input: { kind: ReviewKind; remarks: string },
  at: string,
): DocRecord {
  const office = officeOf(actor)
  const doc = getDoc(db, docId)
  const allowed = reviewOptions(db, doc, office)
  // REQ-ROUTE-7: only the office currently holding the document may act.
  if (!allowed.some((o) => o.kind === input.kind)) throw new FriendlyError(MESSAGES.notAllowedToAct)
  const currentStep = doc.route[doc.routeIndex]
  const officeName = currentStep?.label ?? OFFICE_LABEL[office]
  const remarks = input.remarks.trim() || undefined

  if (input.kind === 'return') {
    if (!remarks) throw new FriendlyError('Please explain what needs to be corrected. The requester will see your comments.')
    doc.status = 'returned'
    doc.currentOffice = null
    doc.officeSince = at
    doc.returnInfo = { office: officeName, by: actor.name, at, reasons: remarks, missing: [] }
    addHistory(doc, { at, office: officeName, actorName: actor.name, action: 'returned', remarks }, db)
    notifyReturned(db, doc, officeName, remarks, [], at)
    return doc
  }

  if (input.kind === 'reject') {
    if (!remarks)
      throw new FriendlyError('Please state the reasons for disapproving/rejecting this document. The requester will review your comments.')
    doc.status = 'rejected'
    doc.currentOffice = null
    doc.officeSince = at
    doc.rejectionInfo = { office: officeName, by: actor.name, at, reasons: remarks }
    addHistory(doc, { at, office: officeName, actorName: actor.name, action: 'rejected', remarks }, db)
    notifyRejected(db, doc, officeName, remarks, at)
    return doc
  }

  if (input.kind === 'endorse_higher') {
    // REQ-ROUTE-5: Dean marks higher approval → continue to OVCAA / Office of the Chancellor.
    const type = getType(db, doc.typeId)
    const extra: RouteStep[] = type.higherApproval.map((o) => ({ office: o, stage: 'review' as const }))
    doc.route.splice(doc.routeIndex + 1, 0, ...extra)
  }

  const next = doc.route[doc.routeIndex + 1]
  const isApproval = input.kind === 'approve'
  addHistory(
    doc,
    {
      at,
      office: officeName,
      actorName: actor.name,
      action: isApproval ? 'approved' : 'endorsed',
      target: !isApproval && next ? (next.label ?? OFFICE_LABEL[next.office]) : undefined,
      remarks,
    },
    db,
  )
  if (isApproval) {
    // Approval ends the review chain: drop unvisited review steps and move to
    // the College Secretary's final processing step (release / external office).
    const finalStep = doc.route.find((s) => s.stage === 'final') ?? { office: 'secretary' as const, stage: 'final' as const }
    doc.route = [...doc.route.slice(0, doc.routeIndex + 1), finalStep]
    moveTo(doc, doc.route.length - 1, at)
  } else {
    moveTo(doc, doc.routeIndex + 1, at)
  }
  doc.status = 'with_office'
  return doc
}

function notifyRejected(db: Database, doc: DocRecord, officeName: string, reasons: string, at: string) {
  const req = getUser(db, doc.requesterId)
  if (!req) return
  const type = getType(db, doc.typeId)
  notify(db, {
    kind: 'rejected',
    recipientId: req.id,
    recipientLabel: req.name,
    recipientEmail: req.email,
    doc,
    subject: `Update: your ${type.name} was disapproved / rejected`,
    body: `Hello ${firstName(req)},\n\nYour ${type.name} (${controlNumber(doc)}) was disapproved / rejected by the ${officeName}.\n\nReason: ${reasons}\n\nSince this document was rejected, no further resubmission is permitted for this document. If you have questions, please contact the ${officeName} or the College Secretary.\n\nView details: ${requesterLink(doc)}${SIGNOFF}`,
    at,
  })
}

function notifyReturned(db: Database, doc: DocRecord, officeName: string, reasons: string, missing: string[], at: string) {
  const req = getUser(db, doc.requesterId)
  if (!req) return
  const type = getType(db, doc.typeId)
  const missingLine = missing.length ? `\n\nFlagged items: ${missing.join(', ')}` : ''
  notify(db, {
    kind: 'returned',
    recipientId: req.id,
    recipientLabel: req.name,
    recipientEmail: req.email,
    doc,
    subject: `Action needed: your ${type.name} was returned for correction`,
    body: `Hello ${firstName(req)},\n\nYour ${type.name} (${controlNumber(doc)}) was returned by the ${officeName}.\n\nReason: ${reasons}${missingLine}\n\nPlease open your request, make the changes, and submit it again: ${requesterLink(doc)}${SIGNOFF}`,
    at,
  })
}

/* ------------------------------------------------------------------------ */
/* Reminders (REQ-NOT-3) and delay (REQ-WFM-8)                               */
/* ------------------------------------------------------------------------ */

/**
 * Sends a reminder to the holding office and an update to the requester for
 * every document that has waited `reminderEveryDays` since it arrived or since
 * the last reminder. Safe to call repeatedly.
 */
export function runReminders(db: Database, now: number) {
  const every = db.settings.reminderEveryDays
  for (const doc of db.documents) {
    if (doc.status !== 'with_office' && doc.status !== 'submitted') continue
    const office = doc.currentOffice
    if (!office) continue
    const waited = daysSince(doc.officeSince, now)
    if (waited < every) continue
    const last = db.notifications.find((n) => n.docId === doc.id && n.kind === 'reminder')
    const lastAt = last && new Date(last.at).getTime() > new Date(doc.officeSince).getTime() ? last.at : doc.officeSince
    if (daysSince(lastAt, now) < every) continue
    const at = new Date(now).toISOString()
    const type = getType(db, doc.typeId)
    const acct = officeAccount(db, office)
    const officeName = OFFICE_LABEL[office]
    notify(db, {
      kind: 'reminder',
      recipientId: office,
      recipientLabel: officeName,
      recipientEmail: acct?.email ?? '',
      doc,
      subject: `Reminder: a ${type.name} has been waiting ${plural(waited, 'day')}`,
      body: `Hello,\n\nThis is a friendly reminder that ${controlNumber(doc)} (${type.name}: “${doc.title}”) has been waiting for action from the ${officeName} for ${plural(waited, 'day')}.\n\nReview it here: ${requesterLink(doc)}${SIGNOFF}`,
      at,
    })
    const req = getUser(db, doc.requesterId)
    if (req) {
      notify(db, {
        kind: 'update',
        recipientId: req.id,
        recipientLabel: req.name,
        recipientEmail: req.email,
        doc,
        subject: `Update on your ${type.name}`,
        body: `Hello ${firstName(req)},\n\nYour ${type.name} (${controlNumber(doc)}) is still with the ${officeName}. It has been there for ${plural(waited, 'day')}. We’ve sent them a reminder.\n\nTrack it here: ${requesterLink(doc)}${SIGNOFF}`,
        at,
      })
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Notices & Minutes (REQ-NOT-6) and admin settings                          */
/* ------------------------------------------------------------------------ */

export function postNotice(
  db: Database,
  actor: User,
  input: { kind: 'notice' | 'minutes'; title: string; summary: string; fileName: string },
  at: string,
) {
  if (actor.role !== 'secretary' && actor.role !== 'dean')
    throw new FriendlyError('Only the College Secretary and the College Dean can share notices and minutes.')
  if (!input.title.trim()) throw new FriendlyError('Please give the notice a title.')
  const office = OFFICE_LABEL[officeOf(actor)]
  const notice = {
    id: nextId(db, 'nt'),
    kind: input.kind,
    title: input.title.trim(),
    summary: input.summary.trim(),
    fileName: input.fileName,
    postedBy: actor.name,
    postedByOffice: office,
    postedAt: at,
    readBy: [],
  }
  db.notices.unshift(notice)
  const label = input.kind === 'notice' ? 'notice' : 'minutes of meeting'
  for (const f of db.users.filter((u) => u.role === 'faculty' && u.active)) {
    notify(db, {
      kind: 'notice',
      recipientId: f.id,
      recipientLabel: f.name,
      recipientEmail: f.email,
      subject: `New ${label} from the ${office}: ${notice.title}`,
      body: `Hello ${firstName(f)},\n\nThe ${office} shared a new ${label}: “${notice.title}”.\n\nOpen it here: /app/notices${SIGNOFF}`,
      at,
    })
  }
  return notice
}

export function retryNotification(db: Database, actor: User, id: string) {
  if (actor.role !== 'secretary') throw new FriendlyError('Only the College Secretary can resend emails.')
  const n = db.notifications.find((x) => x.id === id)
  if (!n) throw new FriendlyError('We couldn’t find that email in the log.')
  n.result = 'sent'
  n.at = new Date().toISOString()
}
