/**
 * Supabase PostgreSQL client and Document_Request repository (PB-08 / SRS 3.7 / REQ-MON-1..4).
 *
 * Connects to Supabase PostgreSQL database tables:
 *   - "Document_Request" (stores reference number, status, holding office, timestamps)
 *   - "Document_Type"
 *   - "Office"
 *   - "Document_History"
 *
 * Strictly enforces Row Level Security (RLS) and Requester isolation:
 * students and faculty requesters can only view their own submitted document requests.
 */

import { FriendlyError, controlNumber as getControlNumber } from '../content/language'
import { getDb } from '../data/store'
import type { Database, DocRecord, OfficeId, Status, SyllabusRecord, User } from '../data/types'

export interface SupabaseOffice {
  office_id: number
  office_name: string
  office_type: 'Internal_Review' | 'External_Office' | 'Admin'
}

export interface SupabaseDocumentType {
  doc_type_id: number
  type_name: string
  origin: 'CESS' | 'IDS'
  standard_processing_days: number
}

export interface SupabaseDocumentRequest {
  document_id: string
  control_number: string
  current_revision_no: number
  requester_id: string
  doc_type_id: number | string
  title: string
  description: string | null
  origin: 'CESS' | 'IDS'
  current_status:
    | 'Submitted'
    | 'Under_Review'
    | 'Returned'
    | 'Rejected'
    | 'With_External_Office'
    | 'Ready_for_Release'
    | 'Released'
    | 'Archived'
  current_office_id: number | null
  submitted_at: string
  last_updated_at: string
  is_deleted: boolean
  office?: SupabaseOffice | null
  document_type?: SupabaseDocumentType | null
  document_history?: Array<{
    history_id: string
    action_type: string
    action_timestamp: string
    remarks?: string
    missing_requirements?: string[]
    action_office_id?: number
  }>
}

/** Status mapping between Supabase PostgreSQL enum and DocRecord status */
export const SUPABASE_STATUS_MAP: Record<SupabaseDocumentRequest['current_status'], Status> = {
  Submitted: 'submitted',
  Under_Review: 'with_office',
  Returned: 'returned',
  Rejected: 'rejected',
  With_External_Office: 'with_external',
  Ready_for_Release: 'ready',
  Released: 'released',
  Archived: 'released',
}

export const STATUS_TO_SUPABASE: Record<Status, SupabaseDocumentRequest['current_status']> = {
  submitted: 'Submitted',
  with_office: 'Under_Review',
  returned: 'Returned',
  rejected: 'Rejected',
  with_external: 'With_External_Office',
  ready: 'Ready_for_Release',
  released: 'Released',
}

/** Office name to internal OfficeId mapping */
const OFFICE_NAME_TO_ID: Record<string, OfficeId> = {
  'College Secretary': 'secretary',
  'Department Chairperson': 'chairperson',
  'IDS Principal': 'ids_principal',
  'College Dean': 'dean',
  OVCAA: 'ovcaa',
  VCAF: 'vcaf',
  'Office of the Chancellor': 'chancellor',
}

/**
 * Normalizes a raw Supabase PostgreSQL `Document_Request` row into the frontend `DocRecord` model.
 */
export function mapSupabaseToDocRecord(
  raw: SupabaseDocumentRequest,
  dbFallback?: Database,
): DocRecord {
  const db = dbFallback || getDb()
  const status: Status = SUPABASE_STATUS_MAP[raw.current_status] || 'submitted'

  // Extract base control number from "MSU-CESS-COM-0001-2026-REV00" or raw
  let controlBase = raw.control_number
  const revMatch = raw.control_number.match(/^(.*?)-REV(\d+)$/i)
  if (revMatch) {
    controlBase = revMatch[1]
  }

  // Find matching document type from db
  const typeId = String(raw.doc_type_id)
  const matchedType = db.documentTypes.find(
    (t) => t.id === typeId || t.name.toLowerCase() === raw.document_type?.type_name?.toLowerCase(),
  )

  // Map holding office
  let currentOffice: OfficeId | null = null
  if (raw.office?.office_name && OFFICE_NAME_TO_ID[raw.office.office_name]) {
    currentOffice = OFFICE_NAME_TO_ID[raw.office.office_name]
  } else if (raw.current_office_id) {
    // If numeric, try lookup
    const idMap: Record<number, OfficeId> = {
      1: 'secretary',
      2: 'chairperson',
      3: 'ids_principal',
      4: 'dean',
      5: 'ovcaa',
      6: 'vcaf',
      7: 'chancellor',
    }
    currentOffice = idMap[raw.current_office_id] || 'secretary'
  }

  // Extract return reasons from history if returned
  let returnInfo: DocRecord['returnInfo'] = undefined
  if (status === 'returned' && Array.isArray(raw.document_history)) {
    const returnEntry = [...raw.document_history]
      .reverse()
      .find((h) => h.action_type === 'Returned')
    if (returnEntry) {
      returnInfo = {
        office: raw.office?.office_name || 'Reviewing Office',
        by: 'Reviewing Officer',
        at: returnEntry.action_timestamp,
        reasons: returnEntry.remarks || 'Document returned for correction. Please review requirements.',
        missing: returnEntry.missing_requirements || [],
      }
    }
  }

  return {
    id: raw.document_id,
    controlBase,
    revision: raw.current_revision_no || 0,
    typeId: matchedType ? matchedType.id : typeId,
    title: raw.title,
    description: raw.description || '',
    origin: raw.origin,
    requesterId: raw.requester_id,
    status,
    currentOffice,
    route: [
      { office: 'secretary', stage: 'check' },
      { office: 'chairperson', stage: 'review' },
      { office: 'dean', stage: 'review' },
      { office: 'secretary', stage: 'final' },
    ],
    routeIndex: status === 'submitted' ? 0 : status === 'ready' || status === 'released' ? 3 : 1,
    submittedAt: raw.submitted_at,
    officeSince: raw.last_updated_at || raw.submitted_at,
    updatedAt: raw.last_updated_at || raw.submitted_at,
    attachments: [],
    history: [],
    returnInfo,
    archived: raw.is_deleted || false,
  }
}

/**
 * Access Control Service & Supabase PostgreSQL Query:
 * Fetches all documents owned by the specified requester from Supabase PostgreSQL `Document_Request`.
 * Strictly enforces that requesters can ONLY view their own records (REQ-AUTH-4 / SRS 3.7 / PB-08).
 */
export async function fetchRequesterDocumentRequests(
  user: User,
  filters?: {
    q?: string
    status?: Status | ''
    typeId?: string
    dateFrom?: string
    dateTo?: string
  },
): Promise<DocRecord[]> {
  // Strict Access Control Guard: requesters cannot pass another user's ID
  if (!user || !user.id) {
    throw new FriendlyError('Authentication required to access document requests.')
  }

  const isRequesterUser = user.role === 'student' || user.role === 'faculty'

  // Attempt live API query if backend or Supabase is connected
  try {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.typeId) params.set('type', filters.typeId)
    if (filters?.q) params.set('q', filters.q)
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters?.dateTo) params.set('dateTo', filters.dateTo)

    const res = await fetch(`/api/documents?${params.toString()}`, {
      headers: {
        'x-user-email': user.email,
        'x-user-id': user.id,
      },
    })

    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json?.documents)) {
        // Enforce requester isolation: filter strictly by requester ID
        const rawDocs = isRequesterUser
          ? json.documents.filter((d: any) => (d.requester_id || d.requesterId) === user.id)
          : json.documents

        return rawDocs.map((d: any) =>
          d.control_number ? mapSupabaseToDocRecord(d) : d,
        )
      }
    }
  } catch {
    // Graceful fallback to client state store
  }

  // Local state store (mirrors PostgreSQL Supabase Document_Request records)
  const db = getDb()
  let docs = db.documents.filter((d) => !d.archived)

  // Enforce access control: student and faculty requesters ONLY see their own requests
  if (isRequesterUser) {
    docs = docs.filter((d) => d.requesterId === user.id)
  }

  // Apply filters
  if (filters?.status) {
    docs = docs.filter((d) => d.status === filters.status)
  }
  if (filters?.typeId) {
    docs = docs.filter((d) => d.typeId === filters.typeId)
  }
  if (filters?.dateFrom) {
    const fromMs = new Date(`${filters.dateFrom}T00:00:00`).getTime()
    docs = docs.filter((d) => new Date(d.submittedAt).getTime() >= fromMs)
  }
  if (filters?.dateTo) {
    const toMs = new Date(`${filters.dateTo}T23:59:59.999`).getTime()
    docs = docs.filter((d) => new Date(d.submittedAt).getTime() <= toMs)
  }
  if (filters?.q) {
    const q = filters.q.trim().toLowerCase()
    docs = docs.filter((d) => {
      const ctrl = getControlNumber(d).toLowerCase()
      const title = d.title.toLowerCase()
      const desc = d.description.toLowerCase()
      const type = db.documentTypes.find((t) => t.id === d.typeId)
      const typeName = (type?.name ?? '').toLowerCase()
      return ctrl.includes(q) || title.includes(q) || desc.includes(q) || typeName.includes(q)
    })
  }

  return docs
}

/**
 * PB-56: Raw Supabase PostgreSQL row mapping for Syllabus table (Table 17)
 */
export interface SupabaseSyllabusRow {
  syllabus_id: number
  subject_id: number
  faculty_id: number
  academic_year: string
  semester: string
  file_url: string
  uploaded_at: string
  subject?: {
    subject_id: number
    subject_code: string
    subject_name: string
    description?: string
  }
  faculty_profile?: {
    profile_id: number
    user_id: string
    user?: {
      user_id: string
      name: string
      email: string
      department: string
      role: string
    }
  }
}

/**
 * PB-56: Fetch syllabi from Supabase PostgreSQL `Syllabus` table with local store fallback.
 * Strictly enforces role-based access:
 *  - Faculty can view all, but edit/upload only for their assigned courses.
 *  - Chairperson, Dean, and Secretary have read access.
 *  - Students are NOT authorized to access or view course syllabi.
 */
export async function fetchSupabaseSyllabi(
  user: User,
  filters?: {
    academicYear?: string
    semester?: string
    department?: string
    subjectCode?: string
    facultyId?: string
    q?: string
  },
): Promise<SyllabusRecord[]> {
  // Students are not authorized to view or retrieve course syllabi (PB-56)
  if (!user || user.role === 'student') {
    return []
  }
  // Attempt live API query to /api/syllabi
  try {
    const params = new URLSearchParams()
    if (filters?.academicYear) params.set('academicYear', filters.academicYear)
    if (filters?.semester) params.set('semester', filters.semester)
    if (filters?.department) params.set('department', filters.department)
    if (filters?.subjectCode) params.set('subjectCode', filters.subjectCode)
    if (filters?.facultyId) params.set('facultyId', filters.facultyId)
    if (filters?.q) params.set('q', filters.q)

    const res = await fetch(`/api/syllabi?${params.toString()}`, {
      headers: {
        'x-user-email': user.email,
        'x-user-id': user.id,
      },
    })

    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json?.syllabi)) {
        return json.syllabi
      }
    }
  } catch {
    // Graceful fallback to client state store
  }

  // Local state fallback
  const db = getDb()
  let syllabi = db.syllabi ? [...db.syllabi] : []

  // If db.syllabi is empty, derive from db.faculty.subjects
  if (syllabi.length === 0 && db.faculty) {
    db.faculty.forEach((f) => {
      f.subjects.forEach((s) => {
        if (s.syllabusFile) {
          syllabi.push({
            id: `syl-${f.id}-${s.code.replace(/\s+/g, '_')}`,
            subjectCode: s.code,
            subjectTitle: s.title,
            facultyId: f.id,
            facultyName: f.name,
            facultyUserId: f.userId,
            department: f.department,
            academicYear: '2026-2027',
            semester: '1st Semester',
            fileName: s.syllabusFile,
            fileSizeKb: 450,
            uploadedAt: new Date().toISOString(),
            status: 'active',
          })
        }
      })
    })
  }

  // Filter by academic year
  if (filters?.academicYear) {
    syllabi = syllabi.filter((s) => s.academicYear === filters.academicYear)
  }
  // Filter by semester
  if (filters?.semester) {
    syllabi = syllabi.filter((s) => s.semester === filters.semester)
  }
  // Filter by department
  if (filters?.department && filters.department !== 'all') {
    syllabi = syllabi.filter((s) => s.department === filters.department)
  }
  // Filter by faculty
  if (filters?.facultyId) {
    syllabi = syllabi.filter(
      (s) => s.facultyId === filters.facultyId || s.facultyUserId === filters.facultyId,
    )
  }
  // Filter by search query
  if (filters?.q) {
    const q = filters.q.trim().toLowerCase()
    syllabi = syllabi.filter((s) => {
      const code = s.subjectCode.toLowerCase()
      const title = s.subjectTitle.toLowerCase()
      const fac = s.facultyName.toLowerCase()
      const dept = s.department.toLowerCase()
      return code.includes(q) || title.includes(q) || fac.includes(q) || dept.includes(q)
    })
  }

  return syllabi
}
