import { createCustomDocumentTypes } from './customDocumentTypes'
import type { Database } from './types'

export const DB_VERSION = 17

export function createDatabase(): Database {
  return {
    version: DB_VERSION,
    users: [],
    documentTypes: createCustomDocumentTypes(),
    externalOffices: [
      { id: 'hrmo', label: 'Human Resource Management Office (HRMO)', shortLabel: 'HRMO' },
      { id: 'registrar', label: "Registrar's Office", shortLabel: 'Registrar' },
      { id: 'budget_accounting', label: 'Budget and Accounting Office', shortLabel: 'Budget and Accounting' },
    ],
    documents: [], notifications: [], notices: [], faculty: [], whitelist: [], pendingRegistrations: [],
    settings: { reminderEveryDays: 3 },
    counter: 0,
  }
}

// Identifiers are used only to remove records from older browser databases.
const demoUsers = new Set(['u-student-1', 'u-student-2', 'u-faculty-1', 'u-faculty-2', 'u-faculty-3', 'u-secretary', 'u-chair', 'u-ids', 'u-dean', 'u-ovcaa', 'u-vcaf', 'u-chancellor'])
const demoAttachments = new Set([
  'Thesis_Form_Santos.pdf', 'SOCSCI110_Syllabus.pdf', 'INC_Form_EDUC205.pdf', 'Request_Letter_LitNight.pdf',
  'LOA_Form_Reyes.pdf', 'Thesis_Defense_Request.pdf', 'Travel_Order_Lim.pdf', 'EDUC205_Syllabus.pdf',
  'CSC_Form6_Lim.pdf', 'Travel_Order_DelaCruz.pdf', 'FSR_DelaCruz.pdf', 'FTL_Lim.pdf',
  'Letter_Promotion_Aquino.pdf', 'IPCR_Aquino_JanJun2026.pdf',
  'IPCR_DelaCruz.pdf', 'INC_SOCSCI220.pdf',
])
const demoNotices = new Map([
  ['Minutes_Sept2026_FacultyMeeting.pdf', 'Minutes of the September 2026 Faculty Meeting'],
  ['Notice_FacultyMeeting_Oct23.pdf', 'Faculty Meeting — October 23, 2026'],
])
const demoSyllabi = ['EDUC101_Syllabus_2026.pdf', 'EDUC205_Syllabus_2026.pdf', 'SOCSCI110_Syllabus_2026.pdf', 'SOCSCI220_Syllabus_2026.pdf', 'EDUC310_Syllabus_2026.pdf', 'ENG102_Syllabus_2026.pdf', 'ENG215_Syllabus_2026.pdf', 'SCI10_Syllabus_2026.pdf', 'MATH10_Syllabus_2026.pdf']
const demoTos = ['EDUC101_Midterm_TOS_2026.xlsx', 'EDUC205_Final_TOS_2026.xlsx', 'SOCSCI110_Midterm_TOS_2026.xlsx', 'SCI10_Midterm_TOS_2026.xlsx']
const demoFolderOwners = ['u-sec-1', 'u-dean-1', 'u-chair-1', 'u-principal-1']
const demoTypeFingerprints: Record<string, number> = {
  'travel-order': 3920009358, leave: 321287430, syllabus: 1221978524, ftl: 3895529703, fsr: 292353694,
  ipcr: 400931974, endorsement: 4034931642, inc: 442931135, loa: 2169325221, thesis: 1395273245, activity: 516644466,
}

function fingerprint(value: unknown): number {
  let hash = 2166136261
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

export function removeLegacyDemoData(db: Database): Database {
  const demoDocumentIds = new Set(db.documents.filter((doc) =>
    demoUsers.has(doc.requesterId) && doc.attachments.some((file) => file.revision === 0 && demoAttachments.has(file.name)),
  ).map((doc) => doc.id))
  const demoFolderIds = new Set(db.folders?.filter((folder) =>
    /^fld-[1-4]$/.test(folder.id) && demoFolderOwners.includes(folder.createdBy),
  ).map((folder) => folder.id))

  db.users = db.users.filter((user) => !demoUsers.has(user.id))
  db.documents = db.documents.filter((doc) => !demoDocumentIds.has(doc.id)).map((doc) =>
    doc.folderId && demoFolderIds.has(doc.folderId) ? { ...doc, folderId: undefined } : doc,
  )
  const usedTypes = new Set(db.documents.map((doc) => doc.typeId))
  db.documentTypes = db.documentTypes.filter((type) => usedTypes.has(type.id) || demoTypeFingerprints[type.id] !== fingerprint(type))
  db.notifications = db.notifications.filter((notice) =>
    !demoUsers.has(notice.recipientId) && (!notice.docId || !demoDocumentIds.has(notice.docId)),
  ).map((notice) => ({ ...notice, channels: ['in_system'] }))
  db.notices = db.notices.filter((notice) => demoNotices.get(notice.fileName) !== notice.title)
  db.faculty = db.faculty.filter((entry) => !/^fac-[1-5]$/.test(entry.id) || (!!entry.userId && !demoUsers.has(entry.userId)))
  db.syllabi = db.syllabi?.filter((item) => !/^syl-[1-9]$/.test(item.id) || !demoSyllabi.includes(item.fileName) || !!item.fileUrl)
  db.tos = db.tos?.filter((item) => !/^tos-[1-4]$/.test(item.id) || !demoTos.includes(item.fileName) || !!item.fileUrl)
  db.folders = db.folders?.filter((folder) => !demoFolderIds.has(folder.id))
  db.whitelist = db.whitelist.filter((item) => !/^wl-([1-9]|10)$/.test(item.id))
  db.pendingRegistrations = db.pendingRegistrations.filter((item) => !/^pr-[12]$/.test(item.id))
  if (db.syllabusTemplate?.updatedAt === '2026-03-01T08:00:00Z') delete db.syllabusTemplate
  if (db.tosTemplate?.updatedAt === '2026-03-01T08:00:00Z') delete db.tosTemplate
  db.version = DB_VERSION
  return db
}
