import {
  Archive,
  BookOpen,
  ClipboardCheck,
  FilePlus2,
  Files,
  FolderOpen,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  Megaphone,
  PackageCheck,
  Settings,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { reviewInbox, secretaryQueues, visibleDocuments } from '../data/selectors'
import type { Database, Role, User } from '../data/types'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Number shown beside the item (things waiting for this user). */
  count?: (db: Database, user: User) => number
  countTone?: 'brand' | 'warning' | 'danger'
}

export interface NavSection {
  heading?: string
  items: NavItem[]
}

const directory: NavItem = { to: '/app/faculty-directory', label: 'Faculty and Subjects', icon: BookOpen }
const notices: NavItem = {
  to: '/app/notices',
  label: 'Notices and Minutes',
  icon: Megaphone,
}

export function navFor(role: Role): NavSection[] {
  switch (role) {
    case 'student':
      return [
        {
          items: [
            {
              to: '/app/my-documents',
              label: 'Document Repository',
              icon: FolderOpen,
              count: (db, u) => visibleDocuments(db, u).filter((d) => d.status === 'returned').length,
              countTone: 'danger',
            },
          ],
        },
        {
          heading: 'College information',
          items: [directory],
        },
      ]
    case 'faculty':
      return [
        {
          items: [
            {
              to: '/app/my-documents',
              label: 'Document Repository',
              icon: FolderOpen,
              count: (db, u) => visibleDocuments(db, u).filter((d) => d.status === 'returned').length,
              countTone: 'danger',
            },
            { to: '/app/requests/new', label: 'Request a Document', icon: FilePlus2 },
          ],
        },
        {
          heading: 'College information',
          items: [{ ...notices, count: (db, u) => db.notices.filter((n) => !n.readBy.includes(u.id)).length }, directory],
        },
      ]
    case 'secretary':
      return [
        { items: [{ to: '/app/overview', label: 'Overview', icon: LayoutDashboard }] },
        {
          heading: 'Your tasks',
          items: [
            { to: '/app/requirements-check', label: 'Check Requirements', icon: ClipboardCheck, count: (db) => secretaryQueues(db).toCheck.length, countTone: 'warning' },
            { to: '/app/release', label: 'Approved and Ready to Release', icon: PackageCheck, count: (db) => { const q = secretaryQueues(db); return q.toProcess.length + q.ready.length }, countTone: 'brand' },
          ],
        },
        {
          heading: 'Records',
          items: [
            { to: '/app/documents', label: 'All Documents', icon: Files },
            { to: '/app/archive', label: 'Archive', icon: Archive },
            { to: '/app/email-log', label: 'Email Log', icon: Mail, count: (db) => db.notifications.filter((n) => n.result === 'failed').length, countTone: 'danger' },
          ],
        },
        {
          heading: 'College information',
          items: [notices, directory, { to: '/app/settings', label: 'System Settings', icon: Settings }],
        },
      ]
    case 'dean':
    case 'chairperson':
    case 'ids_principal':
    case 'ovcaa':
    case 'chancellor':
      return [
        {
          items: [
            { to: '/app/for-review', label: 'For Your Review', icon: Inbox, count: (db, u) => reviewInbox(db, u).length, countTone: 'warning' },
            { to: '/app/reviewed', label: 'Reviewed by You', icon: History },
          ],
        },
        { heading: 'College information', items: role === 'dean' ? [notices, directory] : [directory] },
      ]
  }
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  if (role === 'student' || role === 'faculty') return '/app/my-documents'
  if (role === 'secretary') return '/app/overview'
  return '/app/for-review'
}
