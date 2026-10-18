/**
 * Domain types for CESS DocuFlow.
 * Field names follow the SRS v1.3 (see REQ-REC-1, REQ-TRK-1, REQ-ROUTE-*, REQ-EXT-*, REQ-NOT-7).
 */

export type Role =
  | 'student'
  | 'faculty'
  | 'secretary'
  | 'chairperson'
  | 'ids_principal'
  | 'dean'
  | 'ovcaa'
  | 'chancellor'

/** Offices that have accounts and can hold a document (REQ-AUTH-2). */
export type OfficeId = 'secretary' | 'chairperson' | 'ids_principal' | 'dean' | 'ovcaa' | 'chancellor'

/** Offices without accounts; the College Secretary records hand-offs for them (REQ-EXT-1). */
export type ExternalOfficeId = string

export interface ExternalOfficeItem {
  id: ExternalOfficeId
  label: string
  shortLabel: string
}

export type Origin = 'CESS' | 'IDS'

/** Hybrid notification preference toggleable by each user in settings (REQ-NOT-7). */
export type NotificationPreference = 'both' | 'email_only' | 'in_system_only'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Requesters only: where their documents originate (REQ-SUB-6). */
  origin?: Origin
  department: string
  position: string
  active: boolean
  /** User's chosen notification delivery mode (REQ-NOT-7). Defaults to 'both'. */
  notificationPreference?: NotificationPreference
}

export interface Requirement {
  id: string
  label: string
  required: boolean
  /** Where the requester can obtain the form (REQ-REQT-7). */
  source?: string
  /** Plain-language reason the file is needed. */
  why?: string
}

export interface DocumentType {
  id: string
  name: string
  audience: 'student' | 'faculty'
  summary: string
  requirements: Requirement[]
  /** Downloadable blank form template file name (REQ-REQT-9, REQ-REQT-10). */
  templateName?: string
  /** Standard processing time in working days [min, max] (REQ-WFM-7). */
  processingDays: [number, number]
  /** Ordered reviewing offices for CESS origin (REQ-ROUTE-1, REQ-ROUTE-2). */
  cessRoute?: OfficeId[]
  /** Ordered reviewing offices for IDS origin (REQ-ROUTE-1, REQ-ROUTE-3). */
  idsRoute?: OfficeId[]
  /** Offices after the College Dean when higher approval is needed (REQ-ROUTE-5). */
  higherApproval: OfficeId[]
}

/** Fixed status list (REQ-TRK-1). "Delayed" is a computed flag, not a status. */
export type Status = 'submitted' | 'returned' | 'with_office' | 'with_external' | 'ready' | 'released'

/** One stop in a document's route (REQ-ROUTE-1). */
export interface RouteStep {
  office: OfficeId
  /** check = completeness check, review = endorse/approve, final = release processing. */
  stage: 'check' | 'review' | 'final'
  /** Optional custom label, e.g. for IDS Principal 1st vs 2nd review (REQ-ROUTE-3). */
  label?: string
}

export interface Attachment {
  id: string
  requirementId?: string
  name: string
  sizeKb: number
  revision: number
  uploadedAt: string
  uploadedBy: string
  /** True if attached by the College Secretary as the final signed copy (REQ-REL-4). */
  isSignedCopy?: boolean
}

export type HistoryAction =
  | 'submitted'
  | 'resubmitted'
  | 'checked_complete'
  | 'checked_incomplete'
  | 'routed'
  | 'endorsed'
  | 'approved'
  | 'returned'
  | 'sent_external'
  | 'returned_external'
  | 'marked_ready'
  | 'released'

/** Processing history entry — never deleted (REQ-REC-4). */
export interface HistoryEntry {
  id: string
  at: string
  office: string
  actorName: string
  action: HistoryAction
  /** Destination office label, e.g. for "routed" or "sent_external". */
  target?: string
  remarks?: string
  revision: number
}

export interface ReturnInfo {
  office: string
  by: string
  at: string
  reasons: string
  /** Requirement ids flagged for content or completeness issues. */
  missing: string[]
}

/** Content verification result recorded by the College Secretary (REQ-REQT-4). */
export interface ContentVerification {
  verifiedBy: string
  at: string
  result: 'complete' | 'returned'
  remarks?: string
}

export interface DocRecord {
  id: string
  /** e.g. MSU-CESS-COM-0012-2026 (revision shown separately as REV01). */
  controlBase: string
  revision: number
  typeId: string
  title: string
  description: string
  origin: Origin
  requesterId: string
  status: Status
  currentOffice: OfficeId | null
  externalOffice?: ExternalOfficeId
  route: RouteStep[]
  routeIndex: number
  submittedAt: string
  /** When the document arrived at its current location (for "days waiting"). */
  officeSince: string
  updatedAt: string
  attachments: Attachment[]
  history: HistoryEntry[]
  returnInfo?: ReturnInfo
  /** Automatic completeness check result before reaching the Secretary (REQ-REQT-3, REQ-REQT-4). */
  autoCompletenessPassed?: boolean
  /** Content verification recorded by the College Secretary (REQ-REQT-4). */
  contentVerification?: ContentVerification
  /** True when the record was encoded by the College Secretary for a walk-in submission (REQ-REC-8). */
  encodedBySecretary?: boolean
  release?: {
    receivedBy: string
    at: string
    recordedBy: string
    signedFileName?: string
  }
  archived: boolean
}

export type NotificationKind = 'returned' | 'ready' | 'reminder' | 'update' | 'notice' | 'submitted'

/** Hybrid notification log entry (REQ-NOT-4, REQ-NOT-7). */
export interface NotificationLog {
  id: string
  kind: NotificationKind
  /** User id of the recipient, or an office id for office reminders. */
  recipientId: string
  recipientLabel: string
  recipientEmail: string
  docId?: string
  subject: string
  body: string
  at: string
  result: 'sent' | 'failed'
  readBy: string[]
  /** Delivery channels used according to the recipient's settings (REQ-NOT-7). */
  channels?: ('email' | 'in_system')[]
}

export interface Notice {
  id: string
  kind: 'notice' | 'minutes'
  title: string
  summary: string
  fileName: string
  postedBy: string
  postedByOffice: string
  postedAt: string
  readBy: string[]
}

export interface Subject {
  code: string
  title: string
  syllabusFile?: string
}

export interface SyllabusTemplate {
  fileName: string
  updatedAt: string
  uploadedBy: string
  fileSize?: string
}

export interface FacultyEntry {
  id: string
  userId?: string
  name: string
  department: string
  subjects: Subject[]
}

export interface Settings {
  reminderEveryDays: number
}

export interface Database {
  version: number
  users: User[]
  documentTypes: DocumentType[]
  externalOffices: ExternalOfficeItem[]
  documents: DocRecord[]
  notifications: NotificationLog[]
  notices: Notice[]
  faculty: FacultyEntry[]
  syllabusTemplate?: SyllabusTemplate
  settings: Settings
  counter: number
}
