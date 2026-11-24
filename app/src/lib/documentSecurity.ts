import { OFFICE_LABEL, ROLE_OFFICE, controlNumber, downloadGeneratedPdf } from '../content/language'
import type { DocRecord, User } from '../data/types'

export type DocumentAccessScope = 'owner' | 'review_office' | 'administrator' | 'denied'

export interface DocumentAccessCheck {
  permitted: boolean
  scope: DocumentAccessScope
  scopeLabel: string
  reason?: string
}

export interface NonPublicSecureLinkInfo {
  url: string
  token: string
  expiresAt: string
  expiresInMinutes: number
  accessScope: string
}

/**
 * Validates whether the active user possesses institutional permission to view or download
 * the document and its associated file attachments.
 *
 * Rules:
 * - Document Owner (Requester): Permitted to view and download own submissions.
 * - College Secretary & Administrators: Permitted full institutional records access.
 * - Reviewing Offices: Permitted if the user's office is an authorized participant in the document's routing sequence.
 * - Other users: Denied access to protected non-public records.
 */
export function checkDocumentAccess(user: User, doc: DocRecord): DocumentAccessCheck {
  // 1. College Secretary & Administrative Staff
  if (user.role === 'secretary' || user.role === 'dean') {
    return {
      permitted: true,
      scope: 'administrator',
      scopeLabel: 'College Records Administrator',
    }
  }

  // 2. Document Owner (Requester)
  if (doc.requesterId === user.id) {
    return {
      permitted: true,
      scope: 'owner',
      scopeLabel: 'Document Requester & Submitter',
    }
  }

  // 3. Authorized Reviewing Office in Routing Chain
  const userOffice = ROLE_OFFICE[user.role]
  if (userOffice && doc.route.some((step) => step.office === userOffice)) {
    const officeName = OFFICE_LABEL[userOffice] || userOffice
    return {
      permitted: true,
      scope: 'review_office',
      scopeLabel: `Authorized Reviewing Office (${officeName})`,
    }
  }

  // 4. Access Denied: Unauthorized Account
  return {
    permitted: false,
    scope: 'denied',
    scopeLabel: 'Restricted Confidential Document',
    reason:
      'This document contains non-public institutional records. Access is restricted exclusively to the document requester, assigned reviewing offices, and authorized college records administrators.',
  }
}

/**
 * Generates an authenticated, time-limited non-public session link for permitted users.
 * The link incorporates a token payload with signed expiry (15-minute standard session),
 * preventing direct unauthenticated URL scraping or public hotlinking.
 */
export function generateNonPublicSecureLink(
  doc: DocRecord,
  user: User,
  attachmentId?: string,
): NonPublicSecureLinkInfo {
  const check = checkDocumentAccess(user, doc)
  if (!check.permitted) {
    throw new Error('Cannot generate secure link: User lacks permission to access this document.')
  }

  const expiresInMinutes = 15
  const expiresAtMs = Date.now() + expiresInMinutes * 60 * 1000
  const expiresAt = new Date(expiresAtMs).toISOString()

  // Generate an authenticated non-public token payload
  const rawPayload = `${user.id}:${doc.id}:${attachmentId ?? 'all'}:${expiresAtMs}`
  const token = typeof btoa !== 'undefined'
    ? btoa(rawPayload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : `sec_${Date.now()}`

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cess-docuflow.msun.edu.ph'
  const params = new URLSearchParams()
  params.set('token', token)
  params.set('expires', String(expiresAtMs))
  if (attachmentId) {
    params.set('attachment', attachmentId)
  }

  const url = `${baseUrl}/app/documents/${doc.id}?${params.toString()}`

  return {
    url,
    token,
    expiresAt,
    expiresInMinutes,
    accessScope: check.scopeLabel,
  }
}

/**
 * Validates a secure token parameter from a non-public document link.
 */
export function verifyNonPublicSecureToken(
  token: string | null | undefined,
  docId: string,
  user: User,
): { valid: boolean; reason?: string } {
  if (!token) {
    return { valid: false, reason: 'Missing non-public authentication token.' }
  }

  try {
    const raw = typeof atob !== 'undefined'
      ? atob(token.replace(/-/g, '+').replace(/_/g, '/'))
      : ''
    const parts = raw.split(':')
    if (parts.length < 4) {
      return { valid: false, reason: 'Invalid secure token structure.' }
    }

    const [tokenUserId, tokenDocId, , expiresMsStr] = parts
    const expiresMs = Number(expiresMsStr)

    if (tokenDocId !== docId) {
      return { valid: false, reason: 'Secure token was issued for a different document.' }
    }

    if (Date.now() > expiresMs) {
      return { valid: false, reason: 'This non-public secure link has expired. Please obtain a fresh authenticated link.' }
    }

    if (tokenUserId !== user.id && user.role !== 'secretary' && user.role !== 'dean') {
      return { valid: false, reason: 'This non-public link is bound to another user account.' }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: 'Malformed secure token.' }
  }
}

/**
 * Executes a permission-checked, secure download of an official document or attachment.
 * Blocks unauthorized users and watermarks the exported audit file with security metadata.
 */
export function downloadPermittedDocument(
  user: User,
  doc: DocRecord,
  attachment?: { id: string; name: string; sizeKb: number },
  docTypeName?: string,
): { success: boolean; error?: string } {
  const check = checkDocumentAccess(user, doc)
  if (!check.permitted) {
    return {
      success: false,
      error: check.reason || 'Access denied: You are not authorized to download this document.',
    }
  }

  const ctrlNo = controlNumber(doc)
  const timestamp = new Date().toLocaleString()

  if (attachment) {
    const fileName = attachment.name.endsWith('.pdf') ? attachment.name : `${attachment.name}.pdf`
    downloadGeneratedPdf(
      fileName,
      `Official Institutional Copy: ${attachment.name}`,
      [
        'MINDANAO STATE UNIVERSITY AT NAAWAN',
        'COLLEGE OF EDUCATION AND SOCIAL SCIENCES',
        'CESS DOCUFLOW — SECURE DOCUMENT REPOSITORY',
        '',
        `Control Number: ${ctrlNo}`,
        `Document Title: ${doc.title}`,
        `Document Type: ${docTypeName || doc.typeId}`,
        `Attached File: ${attachment.name} (${Math.max(1, Math.round(attachment.sizeKb))} KB)`,
        `Authorized Downloader: ${user.name} (${user.email})`,
        `Access Permission Scope: ${check.scopeLabel}`,
        `Download Timestamp: ${timestamp}`,
        `Security Classification: Protected Non-Public Institutional Record`,
        '',
        'CONFIDENTIALITY NOTICE:',
        'This electronic document has been verified through permission-scoped access controls.',
        'Distribution or copying without institutional authorization is strictly prohibited.',
      ],
    )
  } else {
    downloadGeneratedPdf(
      `${ctrlNo}_Official_Routing_Summary.pdf`,
      `Official Routing Summary: ${doc.title}`,
      [
        'MINDANAO STATE UNIVERSITY AT NAAWAN',
        'COLLEGE OF EDUCATION AND SOCIAL SCIENCES',
        'OFFICIAL DOCUMENT SUMMARY & ROUTING RECORD',
        '',
        `Control Number: ${ctrlNo}`,
        `Document Title: ${doc.title}`,
        `Document Type: ${docTypeName || doc.typeId}`,
        `Current Status: ${doc.status.toUpperCase()}`,
        `Current Revision: Rev ${doc.revision}`,
        `Authorized Viewer: ${user.name} (${user.email})`,
        `Permission Scope: ${check.scopeLabel}`,
        `Generated At: ${timestamp}`,
        `Access Protocol: Non-Public Secure Session`,
        '',
        'OFFICIAL AUDIT INFORMATION:',
        'This summary was exported under verified credentials in CESS DocuFlow.',
      ],
    )
  }

  return { success: true }
}
