/**
 * Sample data for the prototype.
 *
 * - People are fictional. Office titles follow the SRS.
 * - Document types and requirements are drawn from the SRS, the client
 *   interviews, and the sample MSUN forms. Standard processing times are
 *   SAMPLE values and must be confirmed against the CESS Manual of Operations.
 * - Document histories are produced by running the real workflow engine with
 *   backdated timestamps, so every record follows the documented process.
 */
import { ago } from '../lib/time'
import {
  checkRequirements,
  markReady,
  postNotice,
  recordExternalReturn,
  recordRelease,
  recordReview,
  runReminders,
  sendToExternal,
  submitRequest,
  type NewFile,
  type ReviewKind,
} from './engine'
import type { Database, DocumentType, ExternalOfficeItem, User } from './types'

export const DB_VERSION = 9
export const DEMO_PASSWORD = 'cess2026'

const users: User[] = [
  { id: 'u-student-1', name: 'Maria Santos', email: 'maria.santos@msunaawan.edu.ph', role: 'student', origin: 'CESS', department: 'BSEd English, 3rd Year (DSEE)', position: 'Student', active: true, notificationPreference: 'both' },
  { id: 'u-student-2', name: 'Paolo Reyes', email: 'paolo.reyes@msunaawan.edu.ph', role: 'student', origin: 'CESS', department: 'BA Social Sciences, 4th Year (DSSH)', position: 'Student', active: true, notificationPreference: 'both' },
  { id: 'u-faculty-1', name: 'Prof. Ana Lim', email: 'ana.lim@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', department: 'Department of Secondary and Elementary Education (DSEE)', position: 'Assistant Professor', active: true, notificationPreference: 'both' },
  { id: 'u-faculty-2', name: 'Prof. Ben Aquino', email: 'ben.aquino@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', department: 'Department of Social Sciences and Humanities (DSSH)', position: 'Instructor', active: true, notificationPreference: 'both' },
  { id: 'u-faculty-3', name: 'Mr. Jose Dela Cruz', email: 'jose.delacruz@msunaawan.edu.ph', role: 'faculty', origin: 'IDS', department: 'Integrated Developmental School (IDS)', position: 'Teacher III', active: true, notificationPreference: 'both' },
  { id: 'u-secretary', name: 'Ms. Carmela Ortiz', email: 'cess.secretary@msunaawan.edu.ph', role: 'secretary', department: 'College of Education and Social Sciences', position: 'College Secretary', active: true, notificationPreference: 'both' },
  { id: 'u-chair', name: 'Dr. Liza Fernandez', email: 'cess.chair@msunaawan.edu.ph', role: 'chairperson', department: 'Department of Secondary and Elementary Education (DSEE)', position: 'Department Chairperson', active: true, notificationPreference: 'both' },
  { id: 'u-ids', name: 'Dr. Teresa Gomez', email: 'ids.principal@msunaawan.edu.ph', role: 'ids_principal', department: 'Integrated Developmental School (IDS)', position: 'IDS Principal', active: true, notificationPreference: 'both' },
  { id: 'u-dean', name: 'Dr. Ramon Villanueva', email: 'cess.dean@msunaawan.edu.ph', role: 'dean', department: 'College of Education and Social Sciences', position: 'College Dean', active: true, notificationPreference: 'both' },
  { id: 'u-ovcaa', name: 'Dr. Victor Salazar', email: 'ovcaa@msunaawan.edu.ph', role: 'ovcaa', department: 'Office of the Vice Chancellor for Academic Affairs', position: 'Vice Chancellor for Academic Affairs', active: true, notificationPreference: 'both' },
  { id: 'u-chancellor', name: 'Dr. Antonio Cabrera', email: 'chancellor@msunaawan.edu.ph', role: 'chancellor', department: 'Office of the Chancellor', position: 'Chancellor', active: true, notificationPreference: 'both' },
]

const externalOffices: ExternalOfficeItem[] = [
  { id: 'hrmo', label: 'Human Resource Management Office (HRMO)', shortLabel: 'HRMO' },
  { id: 'registrar', label: "Registrar's Office", shortLabel: 'Registrar' },
  { id: 'budget_accounting', label: 'Budget and Accounting Office', shortLabel: 'Budget and Accounting' },
]

const documentTypes: DocumentType[] = [
  // ---------------- Faculty ----------------
  {
    id: 'travel-order',
    name: 'Travel Order',
    audience: 'faculty',
    summary: 'Permission to travel for official business, such as a seminar, training, or meeting outside the campus.',
    templateName: 'MSUN_Travel_Order_Form_Template.pdf',
    processingDays: [4, 6],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: ['ovcaa', 'chancellor'],
    requirements: [
      { id: 'to-form', label: 'Travel Order form', required: true, source: 'Download the template above or get a copy from HRMO', why: 'This is the official request the approving offices sign.' },
      { id: 'to-invite', label: 'Invitation letter or memorandum', required: true, source: 'Organizing agency or university memo', why: 'Shows the purpose, date, and venue of your travel.' },
      { id: 'to-dad', label: 'Detailed Activity Design (DAD)', required: false, source: 'College Secretary’s Office template', why: 'Helpful if the activity needs funding.' },
    ],
  },
  {
    id: 'leave',
    name: 'Application for Leave',
    audience: 'faculty',
    summary: 'Request for vacation, sick, or other leave using CSC Form No. 6.',
    templateName: 'CSC_Form_6_Application_for_Leave_Template.pdf',
    processingDays: [3, 5],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: ['ovcaa', 'chancellor'],
    requirements: [
      { id: 'lv-form', label: 'Application for Leave (CSC Form No. 6)', required: true, source: 'Download the template above (HRMO / CSC Form No. 6)', why: 'The official leave form that HRMO and the Chancellor act on.' },
      { id: 'lv-support', label: 'Supporting document (e.g., medical certificate)', required: false, source: 'Attending physician or issuing office', why: 'Attach if your type of leave needs proof.' },
    ],
  },
  {
    id: 'syllabus',
    name: 'Syllabus and Table of Specifications (TOS)',
    audience: 'faculty',
    summary: 'Submission of your course syllabus and TOS for review by the Chairperson and the Dean.',
    templateName: 'CESS_Course_Syllabus_and_TOS_Template.pdf',
    processingDays: [3, 5],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: [],
    requirements: [
      { id: 'sy-syllabus', label: 'Course syllabus', required: true, source: 'Download the CESS Syllabus template above', why: 'The Chairperson checks it against the program’s requirements.' },
      { id: 'sy-tos', label: 'Table of Specifications (TOS)', required: true, source: 'Download the CESS TOS template above', why: 'Shows how your exams cover the course outcomes.' },
    ],
  },
  {
    id: 'ftl',
    name: 'Faculty Teaching Load (FTL)',
    audience: 'faculty',
    summary: 'Your assigned teaching load for the semester, for endorsement and approval.',
    templateName: 'MSUN_Faculty_Teaching_Load_FTL_Template.pdf',
    processingDays: [5, 7],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: ['ovcaa', 'chancellor'],
    requirements: [
      { id: 'ftl-form', label: 'Faculty Teaching Load form', required: true, source: 'Download the FTL template above (College Secretary)' },
      { id: 'ftl-sched', label: 'Class schedule', required: true, source: 'Department Chairperson / Registrar’s Office', why: 'Confirms the subjects, sections, and time slots in your load.' },
    ],
  },
  {
    id: 'fsr',
    name: 'Faculty Service Record (FSR)',
    audience: 'faculty',
    summary: 'Request to have your service record reviewed and forwarded to HRMO.',
    templateName: 'MSUN_Faculty_Service_Record_FSR_Template.pdf',
    processingDays: [3, 5],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: [],
    requirements: [{ id: 'fsr-form', label: 'Faculty Service Record form', required: true, source: 'Download the FSR template above or from HRMO' }],
  },
  {
    id: 'ipcr',
    name: 'Individual Performance Commitment and Review (IPCR)',
    audience: 'faculty',
    summary: 'Your performance targets and accomplishments for the rating period.',
    templateName: 'MSUN_IPCR_Form_Template.pdf',
    processingDays: [3, 5],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: [],
    requirements: [
      { id: 'ipcr-form', label: 'IPCR form', required: true, source: 'Download the IPCR template above (HRMO)' },
      { id: 'ipcr-proof', label: 'Proof of accomplishments', required: false, source: 'Faculty portfolio / certificates', why: 'Helps reviewers verify your reported outputs.' },
    ],
  },
  {
    id: 'endorsement',
    name: 'Endorsement Letter (promotion, hiring, or training)',
    audience: 'faculty',
    summary: 'A letter from the College endorsing you for promotion, hiring, or a training program.',
    templateName: 'CESS_Endorsement_Request_Template.pdf',
    processingDays: [5, 7],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: ['ovcaa', 'chancellor'],
    requirements: [
      { id: 'en-letter', label: 'Letter of request', required: true, source: 'Download the request letter template above', why: 'Explains what you are being endorsed for.' },
      { id: 'en-pds', label: 'Personal Data Sheet (CSC Form 212)', required: true, source: 'Download from the CSC website or get a copy from HRMO' },
      { id: 'en-cert', label: 'Certificates or credentials', required: false, source: 'Applicant personal records' },
    ],
  },
  // ---------------- Students ----------------
  {
    id: 'inc',
    name: 'Completion of Incomplete Grade (INC Form)',
    audience: 'student',
    summary: 'Request to complete a subject where you received an INC grade.',
    templateName: 'MSUN_INC_Completion_Form_Template.pdf',
    processingDays: [3, 5],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: [],
    requirements: [
      { id: 'inc-form', label: 'INC Completion form', required: true, source: "Download template above or get from the Registrar's Office", why: 'The official form your instructor and the Dean sign.' },
      { id: 'inc-proof', label: 'Proof of completed requirements', required: true, source: 'Subject Instructor certification', why: 'Shows that you have finished the missing work.' },
      { id: 'inc-receipt', label: 'Official receipt (if a fee applies)', required: false, source: 'Cashier’s Office' },
    ],
  },
  {
    id: 'loa',
    name: 'Leave of Absence (Student)',
    audience: 'student',
    summary: 'Request to stop attending classes for a semester while keeping your student status.',
    templateName: 'MSUN_Student_Leave_of_Absence_LOA_Template.pdf',
    processingDays: [3, 5],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: [],
    requirements: [
      { id: 'loa-form', label: 'Leave of Absence form', required: true, source: "Download template above or get from the Registrar's Office" },
      { id: 'loa-letter', label: 'Letter explaining your reason', required: true, source: 'Student / Parent signed letter', why: 'Helps the reviewers understand your situation.' },
    ],
  },
  {
    id: 'thesis',
    name: 'Thesis Form',
    audience: 'student',
    summary: 'Thesis title approval, adviser assignment, or defense request.',
    templateName: 'CESS_Undergraduate_Thesis_Form_Template.pdf',
    processingDays: [3, 5],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: [],
    requirements: [
      { id: 'th-form', label: 'Thesis form', required: true, source: 'Download the CESS Thesis template above (College Secretary)' },
      { id: 'th-manuscript', label: 'Proposal or manuscript', required: true, source: 'Student researcher / Thesis Adviser', why: 'The Chairperson reviews it before endorsing your request.' },
    ],
  },
  {
    id: 'activity',
    name: 'Permit to Hold a Student Activity',
    audience: 'student',
    summary: 'Approval for a student organization activity, event, or seminar.',
    templateName: 'CESS_Student_Activity_Permit_and_DAD_Template.pdf',
    processingDays: [5, 7],
    cessRoute: ['chairperson', 'dean'],
    idsRoute: ['chairperson', 'ids_principal', 'dean'],
    higherApproval: ['ovcaa'],
    requirements: [
      { id: 'ac-letter', label: 'Letter of request', required: true, source: 'Student Organization Adviser / President', why: 'States the activity, date, venue, and participants.' },
      { id: 'ac-dad', label: 'Detailed Activity Design (DAD)', required: true, source: 'Download the DAD template above (College Secretary)' },
      { id: 'ac-consent', label: 'Parents’ consent forms', required: false, source: 'Office of Student Affairs / College Secretary', why: 'Needed for off-campus activities.' },
    ],
  },
]

const f = (requirementId: string, name: string, sizeKb = 420): NewFile => ({ requirementId, name, sizeKb })

export function createSeed(): Database {
  const db: Database = {
    version: DB_VERSION,
    users: structuredClone(users),
    documentTypes: structuredClone(documentTypes),
    externalOffices: structuredClone(externalOffices),
    documents: [],
    notifications: [],
    notices: [],
    faculty: [
      { id: 'fac-1', name: 'Prof. Ana Lim', department: 'Department of Secondary and Elementary Education (DSEE)', subjects: [
        { code: 'EDUC 101', title: 'The Child and Adolescent Learner', syllabusFile: 'EDUC101_Syllabus_2026.pdf' },
        { code: 'EDUC 205', title: 'Assessment in Learning 1', syllabusFile: 'EDUC205_Syllabus_2026.pdf' },
      ] },
      { id: 'fac-2', name: 'Prof. Ben Aquino', department: 'Department of Social Sciences and Humanities (DSSH)', subjects: [
        { code: 'SOCSCI 110', title: 'Philippine History', syllabusFile: 'SOCSCI110_Syllabus_2026.pdf' },
        { code: 'SOCSCI 220', title: 'Research Methods in the Social Sciences', syllabusFile: 'SOCSCI220_Syllabus_2026.pdf' },
      ] },
      { id: 'fac-3', name: 'Dr. Liza Fernandez', department: 'Department of Secondary and Elementary Education (DSEE)', subjects: [
        { code: 'EDUC 310', title: 'Curriculum Development', syllabusFile: 'EDUC310_Syllabus_2026.pdf' },
      ] },
      { id: 'fac-4', name: 'Prof. Rhea Mendez', department: 'Department of Secondary and Elementary Education (DSEE)', subjects: [
        { code: 'ENG 102', title: 'Purposive Communication', syllabusFile: 'ENG102_Syllabus_2026.pdf' },
        { code: 'ENG 215', title: 'Teaching Literature', syllabusFile: 'ENG215_Syllabus_2026.pdf' },
      ] },
    ],
    settings: { reminderEveryDays: 3 },
    counter: 100,
  }

  const U = (id: string) => db.users.find((u) => u.id === id)!
  const sec = U('u-secretary')
  const byOffice: Record<string, User> = {
    chairperson: U('u-chair'),
    ids_principal: U('u-ids'),
    dean: U('u-dean'),
    ovcaa: U('u-ovcaa'),
    chancellor: U('u-chancellor'),
  }
  const review = (docId: string, office: string, kind: ReviewKind, at: string, remarks = '') =>
    recordReview(db, byOffice[office], docId, { kind, remarks }, at)

  // 1. Student — released & archived with scanned signed copy attached (REQ-REL-4).
  {
    const d = submitRequest(db, U('u-student-1'), { typeId: 'thesis', title: 'Thesis title approval — Code-switching in Grade 7 English classes', description: 'Requesting approval of my thesis title and assignment of Dr. Fernandez as adviser.', files: [f('th-form', 'Thesis_Form_Santos.pdf'), f('th-manuscript', 'Proposal_Santos_v2.pdf', 2380)] }, ago(24, 5))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: 'Thesis form and proposal verified complete.' }, ago(24, 2))
    review(d.id, 'chairperson', 'endorse', ago(22, 6), 'Title is clear and feasible. Recommend approval.')
    review(d.id, 'dean', 'approve', ago(20, 4))
    markReady(db, sec, d.id, ago(19, 7))
    recordRelease(db, sec, d.id, { receivedBy: 'Maria Santos', signedFile: { name: 'Thesis_Form_Santos_Signed_Final.pdf', sizeKb: 540 } }, ago(18, 3))
  }
  // 2. Faculty — released.
  {
    const d = submitRequest(db, U('u-faculty-2'), { typeId: 'syllabus', title: 'SOCSCI 110 Syllabus and TOS — 1st Semester', description: 'Updated syllabus with revised course outcomes.', files: [f('sy-syllabus', 'SOCSCI110_Syllabus.pdf', 860), f('sy-tos', 'SOCSCI110_TOS.pdf', 310)] }, ago(30))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(29, 20))
    review(d.id, 'chairperson', 'endorse', ago(28, 3))
    review(d.id, 'dean', 'approve', ago(27, 6))
    markReady(db, sec, d.id, ago(27, 2))
    recordRelease(db, sec, d.id, { receivedBy: 'Ben Aquino', signedFile: { name: 'SOCSCI110_Syllabus_Approved_Signed.pdf', sizeKb: 910 } }, ago(26))
  }
  // 3. Student — returned by the College Secretary for content issue (REQ-REQT-4, REQ-REQT-5).
  {
    const d = submitRequest(db, U('u-student-1'), { typeId: 'inc', title: 'INC completion — EDUC 205 Assessment in Learning 1', description: 'I have completed my final project and would like to complete my INC grade.', files: [f('inc-form', 'INC_Form_EDUC205.pdf', 380), f('inc-proof', 'Final_Project_Screenshot.png', 640)] }, ago(2, 6))
    checkRequirements(db, sec, d.id, { decision: 'return', missing: ['inc-proof'], reasons: 'The proof you attached is a screenshot of the file name only. Please attach your instructor’s signed certification that you completed the final project.' }, ago(1, 3))
  }
  // 4. Student — with the College Dean (higher approval possible).
  {
    const d = submitRequest(db, U('u-student-1'), { typeId: 'activity', title: 'English Club Literary Night 2026', description: 'An evening of poetry reading and spoken word at the CESS Function Hall on November 20, 2026.', files: [f('ac-letter', 'Request_Letter_LitNight.pdf'), f('ac-dad', 'DAD_LitNight.pdf', 720)] }, ago(4, 2))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(3, 22))
    review(d.id, 'chairperson', 'endorse', ago(2, 1), 'Supporting this activity. Please coordinate the venue schedule with the College Secretary.')
  }
  // 5. Student — just submitted (walk-in encoded by Secretary, REQ-REC-8), waiting for content verification.
  submitRequest(db, U('u-student-2'), { typeId: 'loa', title: 'Leave of Absence — 2nd Semester 2026–2027', description: 'Requesting a leave of absence for health reasons.', files: [f('loa-form', 'LOA_Form_Reyes.pdf'), f('loa-letter', 'Letter_Reyes.pdf')], encodedBySecretary: true, encodedByName: sec.name }, ago(0, 3))
  // 6. Student — with Chairperson, delayed.
  {
    const d = submitRequest(db, U('u-student-2'), { typeId: 'thesis', title: 'Request for thesis outline defense', description: 'Requesting schedule for outline defense with the panel.', files: [f('th-form', 'Thesis_Defense_Request.pdf'), f('th-manuscript', 'Outline_Reyes.pdf', 1850)] }, ago(9, 4))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(9, 1))
  }
  // 7. Faculty CESS — Travel Order with OVCAA (Dean endorsed for higher approval).
  {
    const d = submitRequest(db, U('u-faculty-1'), { typeId: 'travel-order', title: 'Travel to Cagayan de Oro — Regional Assessment Summit', description: 'Attending the Regional Summit on Classroom Assessment, November 5–7, 2026.', files: [f('to-form', 'Travel_Order_Lim.pdf'), f('to-invite', 'Invitation_Summit.pdf', 520)] }, ago(5, 5))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(5, 2))
    review(d.id, 'chairperson', 'endorse', ago(4, 1))
    review(d.id, 'dean', 'endorse_higher', ago(1, 5), 'Recommended. Activity is aligned with faculty development goals.')
  }
  // 8. Faculty CESS — Syllabus ready for pickup.
  {
    const d = submitRequest(db, U('u-faculty-1'), { typeId: 'syllabus', title: 'EDUC 205 Syllabus and TOS — 1st Semester', description: 'Syllabus with updated assessment tasks.', files: [f('sy-syllabus', 'EDUC205_Syllabus.pdf', 940), f('sy-tos', 'EDUC205_TOS.pdf', 300)] }, ago(6))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(5, 20))
    review(d.id, 'chairperson', 'endorse', ago(4, 3))
    review(d.id, 'dean', 'approve', ago(1, 8))
    markReady(db, sec, d.id, ago(0, 20))
  }
  // 9. Faculty CESS — leave just submitted.
  submitRequest(db, U('u-faculty-1'), { typeId: 'leave', title: 'Vacation leave — December 22–29, 2026', description: 'Five working days of vacation leave.', files: [f('lv-form', 'CSC_Form6_Lim.pdf')] }, ago(1, 2))
  // 10. Faculty IDS — Travel Order with the IDS Principal (waiting several days).
  {
    const d = submitRequest(db, U('u-faculty-3'), { typeId: 'travel-order', title: 'Travel to Iligan City — DepEd Science Teachers Training', description: 'Training on inquiry-based science teaching, November 12–14, 2026.', files: [f('to-form', 'Travel_Order_DelaCruz.pdf'), f('to-invite', 'DepEd_Memo_ScienceTraining.pdf', 610)] }, ago(8, 3))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(8))
    review(d.id, 'chairperson', 'endorse', ago(6, 2))
  }
  // 11. Faculty IDS — FSR approved, now at HRMO.
  {
    const d = submitRequest(db, U('u-faculty-3'), { typeId: 'fsr', title: 'Faculty Service Record update — 2026', description: 'Updating my service record for step increment.', files: [f('fsr-form', 'FSR_DelaCruz.pdf')] }, ago(16))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(15, 20))
    review(d.id, 'chairperson', 'endorse', ago(14, 3))
    review(d.id, 'ids_principal', 'endorse', ago(12, 6))
    review(d.id, 'dean', 'approve', ago(10, 2))
    sendToExternal(db, sec, d.id, { office: 'hrmo', handedBy: 'Carmela Ortiz', remarks: 'For updating of service record.' }, ago(9, 6))
  }
  // 12. Faculty CESS — FTL with the Office of the Chancellor.
  {
    const d = submitRequest(db, U('u-faculty-1'), { typeId: 'ftl', title: 'Faculty Teaching Load — 1st Semester 2026–2027', description: '24 units across four subjects.', files: [f('ftl-form', 'FTL_Lim.pdf'), f('ftl-sched', 'Class_Schedule_Lim.pdf')] }, ago(10, 4))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(10, 1))
    review(d.id, 'chairperson', 'endorse', ago(9, 2))
    review(d.id, 'dean', 'endorse_higher', ago(7, 5))
    review(d.id, 'ovcaa', 'endorse', ago(3, 2), 'Load is within the allowed units.')
  }
  // 13. Faculty CESS — Endorsement returned by the Dean.
  {
    const d = submitRequest(db, U('u-faculty-2'), { typeId: 'endorsement', title: 'Endorsement for promotion to Assistant Professor I', description: 'Requesting the College’s endorsement for my application for promotion.', files: [f('en-letter', 'Letter_Promotion_Aquino.pdf'), f('en-pds', 'PDS_Aquino.pdf', 1100)] }, ago(7, 2))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(7))
    review(d.id, 'chairperson', 'endorse', ago(5, 4))
    review(d.id, 'dean', 'return', ago(0, 6), 'Please attach your updated certificates of trainings attended in the last three years, and sign page 4 of your Personal Data Sheet.')
  }
  // 14. Faculty CESS — IPCR approved, waiting for the Secretary to release.
  {
    const d = submitRequest(db, U('u-faculty-2'), { typeId: 'ipcr', title: 'IPCR — January to June 2026', description: 'Performance commitment and review for the first rating period.', files: [f('ipcr-form', 'IPCR_Aquino_JanJun2026.pdf')] }, ago(6, 4))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(6, 1))
    review(d.id, 'chairperson', 'endorse', ago(4, 6))
    review(d.id, 'dean', 'approve', ago(0, 9))
  }
  // 15. Faculty IDS — IPCR with the Chairperson.
  {
    const d = submitRequest(db, U('u-faculty-3'), { typeId: 'ipcr', title: 'IPCR — January to June 2026', description: 'IDS rating period one.', files: [f('ipcr-form', 'IPCR_DelaCruz.pdf')] }, ago(2, 7))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(2, 3))
  }
  // 16. Student — INC came back from external office earlier & released.
  {
    const d = submitRequest(db, U('u-student-2'), { typeId: 'inc', title: 'INC completion — SOCSCI 220 Research Methods', description: 'Completed the research paper requirement.', files: [f('inc-form', 'INC_SOCSCI220.pdf'), f('inc-proof', 'Instructor_Certification.pdf')] }, ago(21))
    checkRequirements(db, sec, d.id, { decision: 'complete', missing: [], reasons: '' }, ago(20, 20))
    review(d.id, 'chairperson', 'endorse', ago(19))
    review(d.id, 'dean', 'approve', ago(17, 4))
    sendToExternal(db, sec, d.id, { office: 'registrar', handedBy: 'Carmela Ortiz', remarks: 'For grade encoding.' }, ago(17))
    recordExternalReturn(db, sec, d.id, { remarks: 'Grade encoded by the Registrar.' }, ago(14, 3))
    markReady(db, sec, d.id, ago(14, 2))
    recordRelease(db, sec, d.id, { receivedBy: 'Paolo Reyes', signedFile: { name: 'INC_SOCSCI220_Signed_Release.pdf', sizeKb: 410 } }, ago(13))
  }

  postNotice(db, U('u-dean'), { kind: 'notice', title: 'Faculty Meeting — October 23, 2026', summary: 'All CESS faculty are requested to attend the general faculty meeting at 2:00 PM in the CESS Conference Room. Agenda: midterm grade submission and accreditation preparations.', fileName: 'Notice_FacultyMeeting_Oct23.pdf' }, ago(2, 4))
  postNotice(db, U('u-secretary'), { kind: 'minutes', title: 'Minutes of the September 2026 Faculty Meeting', summary: 'Approved minutes of the September 25, 2026 general faculty meeting.', fileName: 'Minutes_Sept2026_FacultyMeeting.pdf' }, ago(9))

  runReminders(db, Date.now())

  // One failed email so the College Secretary can see the "Send Again" option (REQ-NOT-4).
  const failed = db.notifications.find((n) => n.kind === 'returned' && n.recipientId === 'u-faculty-2')
  if (failed) failed.result = 'failed'

  // Mark older notifications as already read.
  for (const n of db.notifications) {
    if (Date.now() - new Date(n.at).getTime() > 3 * 86_400_000) n.readBy.push(n.recipientId)
  }
  return db
}
