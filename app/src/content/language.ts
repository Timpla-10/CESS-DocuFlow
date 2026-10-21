/**
 * CESS DocuFlow — Interface Language
 * ---------------------------------------------------------------------------
 * Every user-facing name for offices, roles, statuses, and history steps is
 * defined here so wording stays consistent and human across the whole app.
 *
 * Writing rules (see LANGUAGE_GUIDE.md):
 *  - Speak like a helpful college staff member, not like software.
 *  - Keep official terms users must recognise (Endorse, OVCAA, College
 *    Secretary) and explain them in plain words where helpful.
 *  - Never invent a status, stage, or promise that the record cannot support.
 */
import type { Database, DocRecord, ExternalOfficeId, HistoryEntry, NotificationPreference, OfficeId, Role, Status } from '../data/types'
import { formatDate } from '../lib/time'

export const OFFICE_LABEL: Record<OfficeId, string> = {
  secretary: 'College Secretary',
  chairperson: 'Department Chairperson',
  ids_principal: 'IDS Principal',
  dean: 'College Dean',
  ovcaa: 'OVCAA',
  chancellor: 'Office of the Chancellor',
}

/** Short plain-language explanations shown where an office name may be unfamiliar. */
export const OFFICE_HELP: Record<OfficeId, string> = {
  secretary: 'Receives, records, and releases all CESS documents.',
  chairperson: 'Head of your department; reviews and endorses documents.',
  ids_principal: 'Head of the Integrated Developmental School; reviews IDS documents.',
  dean: 'Head of the College of Education and Social Sciences.',
  ovcaa: 'Office of the Vice Chancellor for Academic Affairs — handles university-level academic approvals.',
  chancellor: 'The highest approving office of MSU at Naawan.',
}

export const EXTERNAL_LABEL: Record<string, string> = {
  hrmo: 'Human Resource Management Office (HRMO)',
  registrar: "Registrar's Office",
  budget_accounting: 'Budget and Accounting Office',
}

export const EXTERNAL_SHORT: Record<string, string> = {
  hrmo: 'HRMO',
  registrar: 'Registrar',
  budget_accounting: 'Budget and Accounting',
}

export function externalOfficeLabel(id: ExternalOfficeId, db?: Pick<Database, 'externalOffices'>): string {
  const found = db?.externalOffices?.find((o) => o.id === id)
  return found?.label ?? EXTERNAL_LABEL[id] ?? id
}

export function externalOfficeShort(id: ExternalOfficeId, db?: Pick<Database, 'externalOffices'>): string {
  const found = db?.externalOffices?.find((o) => o.id === id)
  return found?.shortLabel ?? EXTERNAL_SHORT[id] ?? id
}

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  faculty: 'Faculty',
  secretary: 'College Secretary',
  chairperson: 'Department Chairperson',
  ids_principal: 'IDS Principal',
  dean: 'College Dean',
  ovcaa: 'OVCAA',
  chancellor: 'Office of the Chancellor',
}

export const NOTIFICATION_PREF_LABEL: Record<NotificationPreference, string> = {
  both: 'External Email and In-System Notifications (Recommended)',
  email_only: 'External University Email Only',
  in_system_only: 'In-System Notifications Only',
}

export const ROLE_OFFICE: Partial<Record<Role, OfficeId>> = {
  secretary: 'secretary',
  chairperson: 'chairperson',
  ids_principal: 'ids_principal',
  dean: 'dean',
  ovcaa: 'ovcaa',
  chancellor: 'chancellor',
}

export function isRequester(role: Role): boolean {
  return role === 'student' || role === 'faculty'
}

export function isReviewer(role: Role): boolean {
  return ['chairperson', 'ids_principal', 'dean', 'ovcaa', 'chancellor'].includes(role)
}

export function controlNumber(doc: Pick<DocRecord, 'controlBase' | 'revision'>): string {
  return `${doc.controlBase}-REV${String(doc.revision).padStart(2, '0')}`
}

export function revisionLabel(rev: number): string {
  return `Revision ${String(rev).padStart(2, '0')}`
}

/* ---------------------------------------------------------------------------
 * Status language
 * ------------------------------------------------------------------------- */

export type Tone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'ids' | 'dsee' | 'dssh'

export interface StatusView {
  label: string
  tone: Tone
}

/**
 * Short badge text for a document's current status.
 * `audience` adapts wording: requesters see where their document is in
 * everyday words; staff see the office that must act.
 */
export function statusView(doc: DocRecord, audience: 'requester' | 'staff', db?: Pick<Database, 'externalOffices'>): StatusView {
  const step = doc.route[doc.routeIndex]
  switch (doc.status) {
    case 'submitted':
      return {
        label: audience === 'requester' ? 'Waiting for Requirements Check' : 'Needs Requirements Check',
        tone: audience === 'requester' ? 'brand' : 'warning',
      }
    case 'returned':
      return { label: 'Returned for Correction', tone: 'danger' }
    case 'rejected':
      return { label: 'Disapproved / Rejected', tone: 'danger' }
    case 'with_office':
      if (step?.stage === 'final') {
        return {
          label: audience === 'requester' ? 'Approved — Preparing for Release' : 'Approved — Ready to Process',
          tone: audience === 'requester' ? 'brand' : 'warning',
        }
      }
      return { label: `With ${step?.label ?? (doc.currentOffice ? OFFICE_LABEL[doc.currentOffice] : 'an office')}`, tone: 'brand' }
    case 'with_external':
      return { label: `At ${doc.externalOffice ? externalOfficeShort(doc.externalOffice, db) : 'an external office'}`, tone: 'brand' }
    case 'ready':
      return { label: audience === 'requester' ? 'Ready for Pickup' : 'Ready for Release', tone: 'success' }
    case 'released':
      return { label: 'Released', tone: 'neutral' }
  }
}

/** Filter-menu labels for the fixed status list (REQ-TRK-1). */
export const STATUS_FILTER_LABEL: Record<Status, string> = {
  submitted: 'Waiting for requirements check',
  returned: 'Returned for correction',
  rejected: 'Disapproved / Rejected',
  with_office: 'Under review',
  with_external: 'At an external office',
  ready: 'Ready for release',
  released: 'Released',
}

/** Where the document is right now, in plain words. */
export function locationLabel(doc: DocRecord, db?: Pick<Database, 'externalOffices'>): string {
  if (doc.status === 'returned') return 'With you (the requester)'
  if (doc.status === 'rejected') return `Disapproved by ${doc.rejectionInfo?.office ?? 'Office'}`
  if (doc.status === 'with_external' && doc.externalOffice) return externalOfficeLabel(doc.externalOffice, db)
  if (doc.status === 'released') return 'Released to requester'
  const step = doc.route[doc.routeIndex]
  if (step?.label) return step.label
  if (doc.currentOffice) return OFFICE_LABEL[doc.currentOffice]
  return '—'
}

export function locationLabelForStaff(doc: DocRecord, db?: Pick<Database, 'externalOffices'>): string {
  if (doc.status === 'returned') return 'Requester (for correction)'
  if (doc.status === 'rejected') return `Disapproved by ${doc.rejectionInfo?.office ?? 'Office'}`
  return locationLabel(doc, db)
}

/**
 * Sentence explaining the requester's document status — written as if a
 * staff member were explaining it at the counter.
 */
export function requesterMessage(doc: DocRecord, delayed: boolean, db?: Pick<Database, 'externalOffices'>): { title: string; body: string } {
  const step = doc.route[doc.routeIndex]
  const office = step?.label ?? (doc.currentOffice ? OFFICE_LABEL[doc.currentOffice] : '')
  switch (doc.status) {
    case 'submitted':
      return {
        title: 'Request received',
        body: 'Required attachments are complete. The College Secretary will verify document contents before routing for review.',
      }
    case 'returned':
      return {
        title: 'Returned for correction',
        body: 'Please check the feedback below, update your document, and submit again.',
      }
    case 'rejected':
      return {
        title: 'Document Disapproved / Rejected',
        body: doc.rejectionInfo
          ? `Disapproved by the ${doc.rejectionInfo.office}. Reason: “${doc.rejectionInfo.reasons}”. Resubmission is not permitted for this document.`
          : 'This document has been disapproved / rejected. Resubmission is not permitted for this document.',
      }
    case 'with_office':
      if (step?.stage === 'final') {
        return {
          title: 'Reviews complete',
          body: 'The College Secretary is preparing your document for release. You will be notified once ready for pickup.',
        }
      }
      if (delayed) {
        return {
          title: 'Review delayed',
          body: `Awaiting action from ${office}. Follow-up reminders have been sent.`,
        }
      }
      return {
        title: `Under review at ${office}`,
        body: `Your document is currently being reviewed by ${office}.`,
      }
    case 'with_external': {
      const ext = doc.externalOffice ? externalOfficeLabel(doc.externalOffice, db) : 'an external office'
      return {
        title: `Forwarded to ${ext}`,
        body: 'Sent for external processing. Updates will post once received back.',
      }
    }
    case 'ready':
      return {
        title: 'Ready for pickup',
        body: 'Please visit the College Secretary’s office to claim your signed document.',
      }
    case 'released':
      return {
        title: 'Document released',
        body: doc.release
          ? `Claimed by ${doc.release.receivedBy} on ${formatDate(doc.release.at)}.`
          : 'Archived and released.',
      }
  }
}

/* ---------------------------------------------------------------------------
 * Processing history language
 * ------------------------------------------------------------------------- */

export function historyTitle(e: HistoryEntry): string {
  switch (e.action) {
    case 'submitted':
      return 'Request submitted (automatic completeness check passed)'
    case 'resubmitted':
      return `Corrected document resubmitted (${revisionLabel(e.revision)})`
    case 'checked_complete':
      return 'Content verified complete by the College Secretary'
    case 'checked_incomplete':
      return 'Returned by the College Secretary for content correction'
    case 'routed':
      return `Recorded and sent to the ${e.target ?? 'next office'}`
    case 'endorsed':
      return e.target ? `Endorsed by the ${e.office} and sent to the ${e.target}` : `Endorsed by the ${e.office}`
    case 'approved':
      return `Approved by the ${e.office}`
    case 'returned':
      return `Returned for correction by the ${e.office}`
    case 'rejected':
      return `Disapproved / Rejected by the ${e.office}`
    case 'sent_external':
      return `Sent to the ${e.target ?? 'external office'}`
    case 'returned_external':
      return `Came back from the ${e.target ?? 'external office'}`
    case 'marked_ready':
      return 'Ready for release — requester notified'
    case 'released':
      return 'Released to the requester'
  }
}

export function historyTone(e: HistoryEntry): Tone {
  switch (e.action) {
    case 'returned':
    case 'checked_incomplete':
    case 'rejected':
      return 'danger'
    case 'approved':
    case 'marked_ready':
    case 'released':
      return 'success'
    case 'endorsed':
    case 'checked_complete':
    case 'routed':
      return 'brand'
    default:
      return 'neutral'
  }
}

/* ---------------------------------------------------------------------------
 * Plain-language error messages — never show raw technical errors.
 * ------------------------------------------------------------------------- */

export const MESSAGES = {
  signInFailed: 'We couldn’t sign you in. Check your email and password, then try again.',
  accountInactive: 'This account has been deactivated. Please contact the College Secretary if you think this is a mistake.',
  loadFailed: 'We couldn’t load your documents. Please check your connection and try again.',
  saveFailed: 'We couldn’t save your changes. Please try again in a moment.',
  notFound: 'We couldn’t find that document. It may have been moved, or the link may be incorrect.',
  notAllowedToAct: 'This document is no longer waiting for your action. Someone may have already recorded a decision — refresh to see the latest status.',
  requiredField: 'Please complete this field.',
  fileTooLarge: (name: string) => `“${name}” is larger than 10 MB. Please attach a smaller file or a compressed scan.`,
  fileWrongType: (name: string) => `“${name}” isn’t a supported file type. Please attach a PDF, JPG, or PNG file.`,
} as const

export function friendlyError(err: unknown): string {
  if (err instanceof FriendlyError) return err.message
  return 'Something went wrong on our side. Please try again in a moment.'
}

/** An error whose message is already safe and helpful to show to users. */
export class FriendlyError extends Error {}

/* ---------------------------------------------------------------------------
 * Client-side PDF Generator for Templates, Syllabi & Audit Downloads
 * (REQ-REQT-9, REQ-REC-6, REQ-INFO-4)
 * ------------------------------------------------------------------------- */

function escapePdfText(s: string): string {
  return s
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

export function downloadGeneratedPdf(fileName: string, heading: string, lines: string[]) {
  const safeHeading = escapePdfText(heading)
  const contentOps: string[] = [
    'BT',
    '/F1 14 Tf',
    '54 740 Td',
    '(MINDANAO STATE UNIVERSITY AT NAAWAN) Tj',
    '0 -18 Td',
    '/F1 11 Tf',
    '(College of Education and Social Sciences - CESS DocuFlow) Tj',
    '0 -28 Td',
    '/F1 13 Tf',
    `(${safeHeading}) Tj`,
    '0 -22 Td',
    '/F1 10 Tf',
  ]
  for (const line of lines) {
    contentOps.push(`(${escapePdfText(line)}) Tj`)
    contentOps.push('0 -15 Td')
  }
  contentOps.push('ET')
  const stream = contentOps.join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += obj
  }
  const xrefPos = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`

  const blob = new Blob([pdf], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.pdf') || fileName.endsWith('.png') || fileName.endsWith('.jpg') ? fileName : `${fileName}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}
