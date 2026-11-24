import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  GraduationCap,
  History,
  Info,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select, Textarea } from '../../components/form'
import { SyllabusPreviewModal } from '../../components/SyllabusPreviewModal'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  StatCard,
  TextTooltip,
  Tooltip,
  cn,
} from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { FacultyEntry, Subject, SyllabusTemplate, SyllabusVersion } from '../../data/types'
import { fetchSupabaseSyllabi } from '../../lib/supabase'
import { formatDate } from '../../lib/time'

const DEFAULT_SYLLABUS_TEMPLATE: SyllabusTemplate = {
  fileName: 'CESS_Official_Course_Syllabus_Template_2026.docx',
  updatedAt: '2026-03-01T08:00:00Z',
  uploadedBy: 'Ms. Carmela Ortiz (College Secretary)',
  fileSize: '142 KB',
}

const ACADEMIC_YEARS = ['2026-2027', '2025-2026']
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer Term']

const DEPARTMENTS = [
  'All Departments',
  'Department of Secondary and Elementary Education',
  'Department of Social Sciences and Humanities',
  'Integrated Developmental School',
]

export function SyllabusManagementPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()

  // Primary active tab
  const isFacultyUser = user.role === 'faculty'
  const isSecretary = user.role === 'secretary'
  const isChairperson = user.role === 'chairperson'

  // Synchronize with Supabase PostgreSQL if live connected
  useEffect(() => {
    fetchSupabaseSyllabi(user).catch(() => null)
  }, [user])

  const [activeTab, setActiveTab] = useState<'all' | 'myCourses' | 'template'>(
    isFacultyUser ? 'myCourses' : 'all',
  )

  // Filters state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDept, setSelectedDept] = useState(
    isChairperson ? user.department || 'All Departments' : 'All Departments',
  )
  const [selectedAy, setSelectedAy] = useState('2026-2027')
  const [selectedSem, setSelectedSem] = useState('1st Semester')
  const [statusFilter, setStatusFilter] = useState<'all' | 'uploaded' | 'pending'>('all')

  // Preview & Modal states
  const [previewItem, setPreviewItem] = useState<{
    faculty: FacultyEntry
    subject: Subject
  } | null>(null)
  const [isPreviewTemplateOpen, setIsPreviewTemplateOpen] = useState(false)

  // Upload/Edit Dialog state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [uploadSubjectCode, setUploadSubjectCode] = useState('')
  const [uploadSubjectTitle, setUploadSubjectTitle] = useState('')
  const [uploadFacultyId, setUploadFacultyId] = useState(
    user.role === 'faculty' ? (db.faculty.find((f) => f.userId === user.id)?.id || '') : '',
  )
  const [uploadAy, setUploadAy] = useState('2026-2027')
  const [uploadSem, setUploadSem] = useState('1st Semester')
  const [uploadDept, setUploadDept] = useState(user.department || DEPARTMENTS[1])
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadFileSizeKb, setUploadFileSizeKb] = useState(450)
  const [uploadChangeNote, setUploadChangeNote] = useState('')
  const [uploadTemplateCertified, setUploadTemplateCertified] = useState(true)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<{
    code?: string
    title?: string
    file?: string
    note?: string
    faculty?: string
  }>({})

  // Version History Modal state
  const [versionHistoryItem, setVersionHistoryItem] = useState<{
    courseCode: string
    courseTitle: string
    instructor: string
    currentVersion: number
    currentFileName?: string
    currentUploadedAt?: string
    currentChangeNote?: string
    history: SyllabusVersion[]
  } | null>(null)

  // Template upload state
  const [isTemplateUploadOpen, setIsTemplateUploadOpen] = useState(false)
  const [newTemplateFileName, setNewTemplateFileName] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)

  const syllabusTemplate: SyllabusTemplate = db.syllabusTemplate || DEFAULT_SYLLABUS_TEMPLATE

  // Compile full course catalog and syllabus status
  // Syllabi records come from db.syllabi or are derived from db.faculty.subjects
  const allCoursesWithSyllabi = useMemo(() => {
    const list: Array<{
      key: string
      subjectCode: string
      subjectTitle: string
      facultyId: string
      facultyName: string
      facultyUserId?: string
      department: string
      academicYear: string
      semester: string
      syllabusFile?: string
      syllabusId?: string
      uploadedAt?: string
      fileSizeKb?: number
      description?: string
      isMyCourse: boolean
      version: number
      versionHistory: SyllabusVersion[]
      changeNote?: string
      templateCompliant: boolean
    }> = []

    db.faculty.forEach((fac) => {
      fac.subjects.forEach((sub) => {
        const matchingSyllabus = (db.syllabi || []).find(
          (s) =>
            s.subjectCode.trim().toUpperCase() === sub.code.trim().toUpperCase() &&
            (s.facultyId === fac.id || s.facultyUserId === fac.userId),
        )

        const isMine =
          (fac.userId && fac.userId === user.id) ||
          fac.name.trim().toLowerCase() === user.name.trim().toLowerCase()

        list.push({
          key: `${fac.id}-${sub.code}`,
          subjectCode: sub.code,
          subjectTitle: sub.title,
          facultyId: fac.id,
          facultyName: fac.name,
          facultyUserId: fac.userId,
          department: fac.department,
          academicYear: matchingSyllabus?.academicYear || '2026-2027',
          semester: matchingSyllabus?.semester || '1st Semester',
          syllabusFile: matchingSyllabus?.fileName || sub.syllabusFile,
          syllabusId: matchingSyllabus?.id,
          uploadedAt: matchingSyllabus?.uploadedAt,
          fileSizeKb: matchingSyllabus?.fileSizeKb,
          description: matchingSyllabus?.description,
          isMyCourse: isMine,
          version: matchingSyllabus?.version || 1,
          versionHistory: matchingSyllabus?.versionHistory || [],
          changeNote: matchingSyllabus?.changeNote,
          templateCompliant: matchingSyllabus?.templateCompliant ?? true,
        })
      })
    })

    return list
  }, [db.faculty, db.syllabi, user.id, user.name])

  // Detect existing syllabus for currently selected subject code & term
  const detectedExisting = useMemo(() => {
    if (!uploadSubjectCode.trim()) return null
    return (db.syllabi || []).find(
      (s) =>
        s.subjectCode.trim().toUpperCase() === uploadSubjectCode.trim().toUpperCase() &&
        s.academicYear === uploadAy &&
        s.semester === uploadSem,
    )
  }, [db.syllabi, uploadSubjectCode, uploadAy, uploadSem])

  // Filtered catalog
  const filteredCourses = useMemo(() => {
    return allCoursesWithSyllabi.filter((c) => {
      // Tab filter
      if (activeTab === 'myCourses' && !c.isMyCourse) return false

      // Department filter
      if (selectedDept !== 'All Departments' && c.department !== selectedDept) return false

      // Term filter
      if (selectedAy && c.academicYear !== selectedAy) return false
      if (selectedSem && c.semester !== selectedSem) return false

      // Status filter
      if (statusFilter === 'uploaded' && !c.syllabusFile) return false
      if (statusFilter === 'pending' && !!c.syllabusFile) return false

      // Text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchCode = c.subjectCode.toLowerCase().includes(q)
        const matchTitle = c.subjectTitle.toLowerCase().includes(q)
        const matchFac = c.facultyName.toLowerCase().includes(q)
        const matchDept = c.department.toLowerCase().includes(q)
        if (!matchCode && !matchTitle && !matchFac && !matchDept) return false
      }

      return true
    })
  }, [allCoursesWithSyllabi, activeTab, selectedDept, selectedAy, selectedSem, statusFilter, searchQuery])

  // Statistics
  const totalCourses = allCoursesWithSyllabi.length
  const uploadedCount = allCoursesWithSyllabi.filter((c) => !!c.syllabusFile).length
  const pendingCount = totalCourses - uploadedCount
  const complianceRate = totalCourses > 0 ? Math.round((uploadedCount / totalCourses) * 100) : 0

  const myCoursesList = allCoursesWithSyllabi.filter((c) => c.isMyCourse)

  // Handlers
  const handleOpenUpload = (preset?: {
    code: string
    title: string
    dept?: string
    facultyId?: string
  }) => {
    setUploadSubjectCode(preset?.code || '')
    setUploadSubjectTitle(preset?.title || '')
    setUploadDept(preset?.dept || user.department || DEPARTMENTS[1])
    setUploadFacultyId(
      preset?.facultyId ||
        (user.role === 'faculty'
          ? db.faculty.find((f) => f.userId === user.id)?.id || ''
          : db.faculty[0]?.id || ''),
    )
    setUploadAy(selectedAy)
    setUploadSem(selectedSem)
    setUploadDescription('')
    setUploadFileName('')
    setUploadChangeNote('')
    setUploadTemplateCertified(true)
    setUploadErrors({})
    setIsUploadDialogOpen(true)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFileName(file.name)
    setUploadFileSizeKb(Math.round(file.size / 1024) || 450)
    setUploadErrors((prev) => ({ ...prev, file: undefined }))
  }

  const handleSaveSyllabus = async (e: FormEvent) => {
    e.preventDefault()
    setUploadErrors({})

    const errs: { code?: string; title?: string; file?: string; note?: string; faculty?: string } = {}
    if (!uploadSubjectCode.trim()) errs.code = 'Course code is required (e.g. EDUC 101).'
    if (!uploadSubjectTitle.trim()) errs.title = 'Course title is required.'
    if (!uploadFileName.trim()) errs.file = 'Please select a syllabus file (.pdf, .docx).'
    if (!uploadFacultyId && isSecretary) {
      errs.faculty = 'Please associate an instructor of record for this syllabus.'
    }
    if (detectedExisting && !uploadChangeNote.trim()) {
      errs.note = 'Required: Please provide a revision summary explaining the updates in this replacement version.'
    }

    if (Object.keys(errs).length > 0) {
      setUploadErrors(errs)
      return
    }

    setUploadBusy(true)
    try {
      const targetFac = db.faculty.find((f) => f.id === uploadFacultyId)
      await api.uploadSyllabusRecord(user, {
        subjectCode: uploadSubjectCode,
        subjectTitle: uploadSubjectTitle,
        academicYear: uploadAy,
        semester: uploadSem,
        fileName: uploadFileName,
        fileSizeKb: uploadFileSizeKb,
        description: uploadDescription,
        department: uploadDept,
        facultyId: uploadFacultyId || undefined,
        facultyName: targetFac?.name || undefined,
        changeNote: uploadChangeNote.trim() || undefined,
        templateCompliant: uploadTemplateCertified,
      })

      toast.success(
        detectedExisting ? 'Syllabus Replaced (Version Upgraded)' : 'Syllabus Uploaded',
        `Successfully saved ${uploadSubjectCode}: ${uploadSubjectTitle} as Version ${(detectedExisting?.version || 0) + 1}.0.`,
      )
      setIsUploadDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      toast.error('Upload Failed', msg)
    } finally {
      setUploadBusy(false)
    }
  }

  const handleDeleteSyllabus = async (item: {
    syllabusId?: string
    facultyId: string
    subjectCode: string
  }) => {
    if (
      !window.confirm(
        `Are you sure you want to remove the syllabus file for ${item.subjectCode}?`,
      )
    )
      return

    try {
      if (item.syllabusId) {
        await api.deleteSyllabusRecord(user, item.syllabusId)
      } else {
        await api.removeFacultySyllabus(user, item.facultyId, item.subjectCode)
      }
      toast.info('Syllabus Removed', `Removed syllabus for ${item.subjectCode}.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to remove syllabus.'
      toast.error('Removal Failed', msg)
    }
  }

  const handleDownload = (item: { subjectCode: string; subjectTitle: string; syllabusFile?: string; facultyName: string }) => {
    const fileName = item.syllabusFile || `${item.subjectCode.replace(/\s+/g, '_')}_Syllabus.pdf`
    downloadGeneratedPdf(
      fileName,
      `OFFICIAL COURSE SYLLABUS: ${item.subjectCode} — ${item.subjectTitle}`,
      [
        'MINDANAO STATE UNIVERSITY AT NAAWAN',
        'COLLEGE OF EDUCATION AND SOCIAL SCIENCES',
        'OFFICIAL COURSE SYLLABUS & TABLE OF SPECIFICATIONS (TOS)',
        '',
        `Course Code: ${item.subjectCode}`,
        `Course Title: ${item.subjectTitle}`,
        `Instructor: ${item.facultyName}`,
        `Term: ${selectedAy} — ${selectedSem}`,
        `File Name: ${fileName}`,
        '',
        'COURSE OVERVIEW & LEARNING PLAN:',
        '1. Course Outcomes (COs) aligned with Institutional Graduate Attributes (IGAs).',
        '2. Weekly syllabus matrix of topics, teaching-learning activities (TLAs), and assessment tasks (ATs).',
        '3. Official Table of Specifications (TOS) indicating Bloom levels and cognitive domains.',
        '4. Course policies on attendance, academic integrity, and grade computation.',
        '',
        'This electronic course syllabus is maintained and certified under CESS DocuFlow.',
      ],
    )
    toast.info('Downloading Syllabus', `Retrieved ${fileName}.`)
  }

  const handleDownloadTemplate = () => {
    downloadGeneratedPdf(syllabusTemplate.fileName, 'OFFICIAL CESS COURSE SYLLABUS TEMPLATE', [
      'MINDANAO STATE UNIVERSITY AT NAAWAN',
      'COLLEGE OF EDUCATION AND SOCIAL SCIENCES',
      'OFFICIAL COURSE SYLLABUS & TABLE OF SPECIFICATIONS (TOS) TEMPLATE',
      '',
      `Template File: ${syllabusTemplate.fileName}`,
      `Managed by: ${syllabusTemplate.uploadedBy}`,
      `Last Revision: ${new Date(syllabusTemplate.updatedAt).toLocaleDateString()}`,
      '',
      'INSTRUCTIONS FOR FACULTY MEMBERS:',
      '1. Prepare your course syllabus using this approved standard template in alignment with CHED CMO and MSU Naawan OBE standards.',
      '2. Specify Course Learning Outcomes (CLOs) and Table of Specifications (TOS) percentages.',
      '3. Submit or upload your completed syllabus in the Course Syllabi repository.',
    ])
    toast.info('Template Downloaded', `Downloaded ${syllabusTemplate.fileName}.`)
  }

  const handleTemplateUploadSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!newTemplateFileName.trim()) return
    setTemplateBusy(true)
    try {
      await api.updateSyllabusTemplate(user, {
        fileName: newTemplateFileName.trim(),
        updatedAt: new Date().toISOString(),
        uploadedBy: `${user.name} (College Secretary)`,
      })
      toast.success(
        'Template Updated',
        `Uploaded ${newTemplateFileName} as the official college syllabus template.`,
      )
      setIsTemplateUploadOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update template.'
      toast.error('Update Failed', msg)
    } finally {
      setTemplateBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outcome-Based Education (OBE) Curriculum Repository"
        title="Course Syllabus Management"
        description={
          <span>
            Manage, view, and retrieve official course syllabi and Tables of Specifications (
            <TextTooltip description="Table of Specifications: a test blueprint mapping examination items to course learning competencies and cognitive levels.">
              TOS
            </TextTooltip>
            ) separately from administrative document requests.
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content="Download CESS Official Course Syllabus Template (.docx / .pdf)">
              <Button variant="secondary" icon={Download} onClick={handleDownloadTemplate}>
                Download Official Template
              </Button>
            </Tooltip>
            {isSecretary && (
              <Tooltip content="Upload and publish a revised standard institutional template">
                <Button
                  variant="secondary"
                  icon={Upload}
                  onClick={() => {
                    setNewTemplateFileName('')
                    setIsTemplateUploadOpen(true)
                  }}
                >
                  Update Template
                </Button>
              </Tooltip>
            )}
            {isFacultyUser && (
              <Tooltip content="Upload and publish a syllabus for one of your assigned courses">
                <Button icon={FilePlus2} onClick={() => handleOpenUpload()}>
                  Upload Course Syllabus
                </Button>
              </Tooltip>
            )}
          </div>
        }
      />

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-4">
        <StatCard
          label="Total Courses"
          value={totalCourses}
          hint={`Offered in ${selectedAy}`}
          icon={BookOpen}
          tone="brand"
        />
        <StatCard
          label="Syllabi Uploaded"
          value={uploadedCount}
          hint={
            <span>
              Compliant with{' '}
              <TextTooltip description="Outcome-Based Education: curriculum designed around measurable learning competencies required by CHED.">
                OBE standards
              </TextTooltip>
            </span>
          }
          icon={FileCheck2}
          tone="success"
        />
        <StatCard
          label="Pending Submission"
          value={pendingCount}
          hint="Awaiting instructor upload"
          icon={Clock}
          tone={pendingCount > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Submission Rate"
          value={`${complianceRate}%`}
          hint="College syllabus compliance"
          icon={GraduationCap}
          tone={complianceRate >= 80 ? 'success' : 'warning'}
        />
      </div>

      {/* Information Banner */}
      <Callout tone="brand" icon={Info} title="Dedicated Course Syllabus Repository">
        Course syllabi are organized in this dedicated curriculum section separately from regular administrative document requests (such as leaves, thesis defenses, or travel orders). Faculty members can maintain their own course syllabi, while department chairs, the college dean, and administrators can view and retrieve official course outlines and Tables of Specifications (
        <TextTooltip description="Table of Specifications: a test blueprint mapping examination items to cognitive domain levels.">
          TOS
        </TextTooltip>
        ).
      </Callout>

      {/* Main Container */}
      <Card>
        {/* Navigation Tabs */}
        <div className="border-b border-ink-100 p-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<'all' | 'myCourses' | 'template'>
              label="Syllabus Repository Navigation"
              value={activeTab}
              onChange={(tab) => setActiveTab(tab)}
              options={[
                ...(isFacultyUser
                  ? [
                      {
                        value: 'myCourses' as const,
                        label: 'My Course Syllabi',
                        count: myCoursesList.length,
                      },
                    ]
                  : []),
                {
                  value: 'all' as const,
                  label: isFacultyUser ? 'All College Courses' : 'Course Syllabi Catalog',
                  count: totalCourses,
                },
                {
                  value: 'template' as const,
                  label: 'Official Standard Template',
                },
              ]}
            />

            {/* Quick helper tag */}
            <span className="text-xs text-ink-500">
              AY {selectedAy} · {selectedSem}
            </span>
          </div>
        </div>

        {/* Filters Toolbar (Shown for catalog and my courses tabs) */}
        {activeTab !== 'template' && (
          <div className="border-b border-ink-100 bg-ink-50/50 p-4 sm:px-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {/* Search input */}
              <div className="lg:col-span-2">
                <label className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-600">
                  Search Course or Instructor
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-400" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by code (e.g. EDUC 101), title, or teacher…"
                    className="pl-9"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-ink-400 hover:text-ink-600"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Department filter */}
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-600">
                  Department
                </label>
                <Select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full text-xs"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept === 'All Departments'
                        ? 'All Departments'
                        : dept.replace('Department of ', '')}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Academic Year */}
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-600">
                  Academic Year
                </label>
                <Select
                  value={selectedAy}
                  onChange={(e) => setSelectedAy(e.target.value)}
                  className="w-full text-xs"
                >
                  {ACADEMIC_YEARS.map((ay) => (
                    <option key={ay} value={ay}>
                      AY {ay}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Semester */}
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-600">
                  Semester
                </label>
                <Select
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(e.target.value)}
                  className="w-full text-xs"
                >
                  {SEMESTERS.map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Status filter */}
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-600">
                  Syllabus Status
                </label>
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'all' | 'uploaded' | 'pending')
                  }
                  className="w-full text-xs"
                >
                  <option value="all">All Statuses ({totalCourses})</option>
                  <option value="uploaded">Uploaded ({uploadedCount})</option>
                  <option value="pending">Pending ({pendingCount})</option>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1 & 2: Course List View */}
        {activeTab !== 'template' && (
          <div className="divide-y divide-ink-100">
            {filteredCourses.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No course syllabi found"
                action={
                  isFacultyUser ? (
                    <Button icon={Plus} onClick={() => handleOpenUpload()}>
                      Upload Syllabus for this Course
                    </Button>
                  ) : undefined
                }
              >
                No course records matched your search filters. Try clearing the search or switching the department.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-50/70 text-2xs font-bold uppercase tracking-wider text-ink-500">
                    <tr>
                      <th className="px-6 py-3.5">Course Code & Title</th>
                      <th className="px-6 py-3.5">Assigned Instructor</th>
                      <th className="px-6 py-3.5">Department</th>
                      <th className="px-6 py-3.5">Term</th>
                      <th className="px-6 py-3.5">Syllabus Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 text-ink-900">
                    {filteredCourses.map((item) => {
                      const hasFile = !!item.syllabusFile
                      return (
                        <tr
                          key={item.key}
                          className={cn(
                            'transition-colors hover:bg-ink-50/50',
                            item.isMyCourse && 'bg-brand-50/30',
                          )}
                        >
                          {/* Course Code & Title */}
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-2.5">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                                <BookOpen className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold text-ink-950">
                                    {item.subjectCode}
                                  </span>
                                  {item.isMyCourse && (
                                    <Badge tone="brand" dot={false}>
                                      My Course
                                    </Badge>
                                  )}
                                </div>
                                <div className="font-semibold text-ink-900">
                                  {item.subjectTitle}
                                </div>
                                {item.description && (
                                  <p className="line-clamp-1 mt-0.5 text-2xs text-ink-500">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Instructor */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-medium text-ink-800">
                              {item.facultyName}
                            </span>
                          </td>

                          {/* Department */}
                          <td className="px-6 py-4">
                            <span className="text-xs text-ink-600">
                              {item.department.replace('Department of ', '')}
                            </span>
                          </td>

                          {/* Term */}
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-ink-600">
                            <div>{item.academicYear}</div>
                            <div className="text-2xs text-ink-400">{item.semester}</div>
                          </td>

                          {/* Status & Versioning */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {hasFile ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Tooltip content="Verified: Outcome-Based Education (OBE) course syllabus is on file">
                                    <Badge tone="success" dot={true}>
                                      Available
                                    </Badge>
                                  </Tooltip>
                                  <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-800 ring-1 ring-inset ring-brand-200">
                                    v{item.version || 1}.0
                                  </span>
                                  {item.templateCompliant && (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-semibold"
                                      title="Compliant with CESS OBE Syllabus Template"
                                    >
                                      <ShieldCheck className="size-3" /> OBE
                                    </span>
                                  )}
                                </div>
                                <div className="text-2xs text-ink-500 max-w-[180px] truncate" title={item.syllabusFile}>
                                  {item.syllabusFile}
                                </div>
                                {item.versionHistory && item.versionHistory.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVersionHistoryItem({
                                        courseCode: item.subjectCode,
                                        courseTitle: item.subjectTitle,
                                        instructor: item.facultyName,
                                        currentVersion: item.version || 1,
                                        currentFileName: item.syllabusFile,
                                        currentUploadedAt: item.uploadedAt,
                                        currentChangeNote: item.changeNote,
                                        history: item.versionHistory,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-700 hover:bg-ink-200 transition"
                                  >
                                    <History className="size-2.5 text-ink-500" />
                                    <span>{item.versionHistory.length + 1} Versions</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <Tooltip content="Action required: Course syllabus has not been uploaded yet">
                                <Badge tone="warning" dot={true}>
                                  Missing / Pending
                                </Badge>
                              </Tooltip>
                            )}
                          </td>

                          {/* Action Buttons */}
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Preview */}
                              {hasFile && (
                                <Tooltip content="Preview Syllabus on Screen">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewItem({
                                        faculty: {
                                          id: item.facultyId,
                                          userId: item.facultyUserId,
                                          name: item.facultyName,
                                          department: item.department,
                                          subjects: [
                                            {
                                              code: item.subjectCode,
                                              title: item.subjectTitle,
                                              syllabusFile: item.syllabusFile,
                                            },
                                          ],
                                        },
                                        subject: {
                                          code: item.subjectCode,
                                          title: item.subjectTitle,
                                          syllabusFile: item.syllabusFile,
                                        },
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 transition"
                                    aria-label="Preview Syllabus on Screen"
                                  >
                                    <Eye className="size-3.5 text-brand-700" />
                                    <span>Preview</span>
                                  </button>
                                </Tooltip>
                              )}

                              {/* Download */}
                              {hasFile && (
                                <Tooltip content="Retrieve and download syllabus file">
                                  <button
                                    type="button"
                                    onClick={() => handleDownload(item)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-xs ring-1 ring-ink-200 hover:bg-brand-50 transition"
                                    aria-label="Retrieve and download syllabus file"
                                  >
                                    <Download className="size-3.5" />
                                    <span>Download</span>
                                  </button>
                                </Tooltip>
                              )}

                              {/* Faculty self-service: Upload/Replace/Delete (Strict RBAC) */}
                              {(item.isMyCourse || isSecretary) && (
                                <>
                                  <Tooltip content={hasFile ? 'Replace Syllabus (Version Increment)' : 'Upload Syllabus File'}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenUpload({
                                          code: item.subjectCode,
                                          title: item.subjectTitle,
                                          dept: item.department,
                                          facultyId: item.facultyId,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-800 hover:bg-ink-200 transition"
                                      aria-label={hasFile ? 'Replace Syllabus File' : 'Upload Syllabus File'}
                                    >
                                      <UploadCloud className="size-3.5" />
                                      <span>{hasFile ? 'Replace' : 'Upload'}</span>
                                    </button>
                                  </Tooltip>

                                  {hasFile && (
                                    <Tooltip content="Remove this syllabus file">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSyllabus(item)}
                                        className="inline-flex items-center justify-center rounded-lg bg-danger-50 p-1.5 text-danger-700 ring-1 ring-danger-200 hover:bg-danger-100 transition"
                                        aria-label="Remove this syllabus file"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </Tooltip>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Institutional Syllabus & TOS Template Section */}
        {activeTab === 'template' && (
          <div className="p-6">
            <div className="max-w-3xl space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5">
                <div className="flex items-start gap-3.5">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
                    <FileText className="size-6" />
                  </div>
                  <div>
                    <Tooltip content="Standard CESS Outcome-Based Education syllabus template format" placement="top">
                      <span className="inline-block cursor-help text-2xs font-bold uppercase tracking-wider text-brand-700 transition-colors hover:text-brand-900">
                        Standard Institutional Template
                      </span>
                    </Tooltip>
                    <h3 className="text-lg font-bold text-ink-950">
                      {syllabusTemplate.fileName}
                    </h3>
                    <p className="mt-1 text-xs text-ink-600">
                      Maintained by {syllabusTemplate.uploadedBy} · Last updated{' '}
                      {formatDate(syllabusTemplate.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Tooltip content="Preview official OBE Syllabus & TOS template in-app">
                    <Button
                      variant="secondary"
                      icon={Eye}
                      onClick={() => setIsPreviewTemplateOpen(true)}
                    >
                      Preview Template
                    </Button>
                  </Tooltip>
                  <Tooltip content="Download CESS Official Course Syllabus Template (.docx / .pdf)">
                    <Button icon={Download} onClick={handleDownloadTemplate}>
                      Download Template
                    </Button>
                  </Tooltip>
                </div>
              </div>

              {/* OBE Guidelines Card */}
              <div className="space-y-3 rounded-xl border border-ink-200 bg-white p-5">
                <Tooltip content="Comprehensive guide to Outcome-Based Education course outlines and test blueprints" placement="top">
                  <h4 className="inline-block cursor-help text-sm font-bold text-ink-950 transition-colors hover:text-brand-800">
                    <TextTooltip description="Outcome-Based Education: curriculum centered on measurable student learning outcomes.">
                      OBE
                    </TextTooltip>{' '}
                    Syllabus & Table of Specifications (
                    <TextTooltip description="Table of Specifications: exam blueprint aligning assessment items to cognitive domain levels.">
                      TOS
                    </TextTooltip>
                    ) Format Guide
                  </h4>
                </Tooltip>
                <ul className="space-y-2 text-xs text-ink-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>
                      <strong>Section I: Course Information</strong> — Course title, course code, credit units, prerequisites, and semester term.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>
                      <strong>
                        Section II: Course Learning Outcomes (
                        <TextTooltip description="Course Learning Outcomes: statements defining the competencies, knowledge, and abilities students will achieve.">
                          CLOs
                        </TextTooltip>
                        )
                      </strong>{' '}
                      — Mapped to Program Educational Objectives (
                      <TextTooltip description="Program Educational Objectives: broad career accomplishments expected of graduates within 3 to 5 years.">
                        PEOs
                      </TextTooltip>
                      ) and{' '}
                      <TextTooltip description="Commission on Higher Education (Philippines).">
                        CHED
                      </TextTooltip>{' '}
                      requirements.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>
                      <strong>Section III: Learning Plan Matrix</strong> — Weekly learning activities, lecture topics, and formative assessment tools.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>
                      <strong>
                        Section IV: Table of Specifications (
                        <TextTooltip description="Table of Specifications: grid mapping test items to cognitive skill levels (e.g., Knowledge, Comprehension, Application, Analysis).">
                          TOS
                        </TextTooltip>
                        )
                      </strong>{' '}
                      — Item distribution mapped to cognitive domains (Knowledge, Comprehension, Application, Analysis).
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Upload / Replace Course Syllabus Modal */}
      <Dialog
        open={isUploadDialogOpen}
        onClose={() => setIsUploadDialogOpen(false)}
        title={detectedExisting ? 'Replace Course Syllabus (Version Increment)' : 'Upload Course Syllabus'}
        description={
          detectedExisting
            ? 'Replace the active syllabus. This operation supersedes the current version and preserves past versions in the accreditation audit log.'
            : 'Upload an official Outcome-Based Education (OBE) course syllabus and associate it with a course and faculty instructor.'
        }
        busy={uploadBusy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsUploadDialogOpen(false)}
              disabled={uploadBusy}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSyllabus} loading={uploadBusy} icon={UploadCloud}>
              {detectedExisting ? 'Confirm Replacement & Publish' : 'Save and Publish Syllabus'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveSyllabus} className="space-y-4">
          {/* Replacement Rules Alert if existing syllabus is detected */}
          {detectedExisting && (
            <div className="rounded-xl border border-warning-200 bg-warning-50/70 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-warning-950 font-bold text-xs">
                <History className="size-4 text-warning-700" />
                Existing Syllabus Detected · Version Replacement Mode
              </div>
              <p className="text-2xs text-warning-900 leading-relaxed">
                An active syllabus for <strong>{uploadSubjectCode}</strong> is currently on file for {uploadAy} ({uploadSem}) as{' '}
                <strong>Version {detectedExisting.version || 1}.0</strong> ({detectedExisting.fileName}).
              </p>
              <div className="rounded-lg bg-white/80 p-2.5 text-2xs text-ink-700 space-y-1 ring-1 ring-warning-200/60">
                <p className="font-semibold text-warning-950">Replacement Rules Enforced:</p>
                <p>• Uploading this file will supersede Version {detectedExisting.version || 1}.0 and record this upload as <strong>Version {(detectedExisting.version || 1) + 1}.0</strong>.</p>
                <p>• The superseded version will remain accessible in the course version history archive for accreditation reviews.</p>
              </div>
              <Field
                label="Revision Note / Change Summary"
                required
                error={uploadErrors.note}
                hint="Explain what was updated in this revision (e.g. updated midterm rubrics, new textbook references)"
              >
                <Input
                  type="text"
                  value={uploadChangeNote}
                  onChange={(e) => {
                    setUploadChangeNote(e.target.value)
                    if (uploadErrors.note) setUploadErrors((p) => ({ ...p, note: undefined }))
                  }}
                  placeholder="e.g. Revised mid-term rubrics and updated OBE alignment matrix"
                  required
                />
              </Field>
            </div>
          )}

          {/* Faculty / Subject Association */}
          {(isSecretary || isChairperson) && (
            <Field label="Assigned Faculty Instructor" required error={uploadErrors.faculty}>
              <Select
                value={uploadFacultyId}
                onChange={(e) => {
                  setUploadFacultyId(e.target.value)
                  const fac = db.faculty.find((f) => f.id === e.target.value)
                  if (fac) setUploadDept(fac.department)
                  if (uploadErrors.faculty) setUploadErrors((p) => ({ ...p, faculty: undefined }))
                }}
                className="w-full"
              >
                <option value="">-- Select Faculty Instructor --</option>
                {db.faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.department.replace('Department of ', '')})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Quick-select for faculty users */}
          {isFacultyUser && myCoursesList.length > 0 && (
            <div className="rounded-lg bg-ink-50 p-2.5 text-2xs text-ink-600 space-y-1.5">
              <span className="font-semibold text-ink-800 block">Quick-Fill from Your Assigned Courses:</span>
              <div className="flex flex-wrap gap-1.5">
                {myCoursesList.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setUploadSubjectCode(c.subjectCode)
                      setUploadSubjectTitle(c.subjectTitle)
                      setUploadDept(c.department)
                    }}
                    className="rounded bg-white px-2 py-0.5 font-mono text-2xs font-bold text-brand-700 ring-1 ring-ink-200 hover:bg-brand-50 transition"
                  >
                    {c.subjectCode}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Course Code" required error={uploadErrors.code}>
              <Input
                type="text"
                value={uploadSubjectCode}
                onChange={(e) => {
                  setUploadSubjectCode(e.target.value)
                  if (uploadErrors.code) setUploadErrors((p) => ({ ...p, code: undefined }))
                }}
                placeholder="e.g. EDUC 101 or SOCSCI 220"
                required
              />
            </Field>

            <Field label="Department" required>
              <Select
                value={uploadDept}
                onChange={(e) => setUploadDept(e.target.value)}
                className="w-full"
              >
                {DEPARTMENTS.filter((d) => d !== 'All Departments').map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Course Title" required error={uploadErrors.title}>
            <Input
              type="text"
              value={uploadSubjectTitle}
              onChange={(e) => {
                setUploadSubjectTitle(e.target.value)
                if (uploadErrors.title) setUploadErrors((p) => ({ ...p, title: undefined }))
              }}
              placeholder="e.g. Assessment in Learning 1"
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Academic Year" required>
              <Select
                value={uploadAy}
                onChange={(e) => setUploadAy(e.target.value)}
                className="w-full"
              >
                {ACADEMIC_YEARS.map((ay) => (
                  <option key={ay} value={ay}>
                    AY {ay}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Semester" required>
              <Select
                value={uploadSem}
                onChange={(e) => setUploadSem(e.target.value)}
                className="w-full"
              >
                {SEMESTERS.map((sem) => (
                  <option key={sem} value={sem}>
                    {sem}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Template Compliance Checklist */}
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-950 flex items-center gap-1.5">
                <FileCheck2 className="size-4 text-brand-700" />
                Template-Based Uploading Verification
              </span>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1 text-2xs font-bold text-brand-700 hover:underline"
              >
                <Download className="size-3" /> Get Official Template
              </button>
            </div>
            <p className="text-2xs text-brand-800 leading-relaxed">
              Verify that the syllabus matches the official CESS OBE Syllabus Template standards:
            </p>
            <div className="grid grid-cols-2 gap-2 text-2xs text-brand-950">
              <div className="flex items-center gap-1.5">
                <Check className="size-3 text-emerald-600 shrink-0" /> Course ILOs & PEOs
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="size-3 text-emerald-600 shrink-0" /> 18-Week Topical Schedule
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="size-3 text-emerald-600 shrink-0" /> Assessment Rubrics
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="size-3 text-emerald-600 shrink-0" /> Updated Reference List
              </div>
            </div>
            <label className="flex items-start gap-2 pt-1 text-2xs text-brand-900 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={uploadTemplateCertified}
                onChange={(e) => setUploadTemplateCertified(e.target.checked)}
                className="rounded border-brand-300 text-brand-600 focus:ring-brand-500 mt-0.5"
              />
              <span>I certify that this file adheres to the official CESS OBE Course Syllabus Template.</span>
            </label>
          </div>

          <Field label="Course Description & Learning Outcomes" optional>
            <Textarea
              rows={2}
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Brief course summary, focus areas, and target competencies..."
            />
          </Field>

          {/* File Picker */}
          <Field
            label="Syllabus & TOS Document File"
            required
            error={uploadErrors.file}
            hint="Accepted formats: PDF or DOCX (Max 20 MB)"
          >
            <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50/50 p-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-xs ring-1 ring-ink-200 hover:bg-brand-50 transition">
                <UploadCloud className="size-4" />
                <span>{uploadFileName ? 'Change File' : 'Choose File'}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.doc"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>
              <span className="text-xs text-ink-700">
                {uploadFileName ? (
                  <span className="font-semibold text-emerald-700">
                    ✓ {uploadFileName} ({uploadFileSizeKb} KB)
                  </span>
                ) : (
                  'No file chosen yet'
                )}
              </span>
            </div>
          </Field>
        </form>
      </Dialog>

      {/* Course Syllabus Version History Modal */}
      <Dialog
        open={!!versionHistoryItem}
        onClose={() => setVersionHistoryItem(null)}
        title="Course Syllabus Version History"
        description={`${versionHistoryItem?.courseCode}: ${versionHistoryItem?.courseTitle} · ${versionHistoryItem?.instructor}`}
        footer={
          <Button variant="secondary" onClick={() => setVersionHistoryItem(null)}>
            Close
          </Button>
        }
      >
        {versionHistoryItem && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand-950 flex items-center gap-1.5">
                  <History className="size-4 text-brand-700" />
                  Version Tracking & Replacement Log
                </span>
                <Badge tone="success" dot={false}>
                  Current: v{versionHistoryItem.currentVersion}.0 Active
                </Badge>
              </div>
              <p className="text-2xs text-brand-800 leading-relaxed">
                Full audit trail of syllabus uploads and replacements. Previous versions are archived to fulfill institutional curriculum compliance and accreditation requirements.
              </p>
            </div>

            {/* Active current version */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-600 text-white font-mono font-bold text-xs px-2 py-0.5">
                    v{versionHistoryItem.currentVersion}.0
                  </span>
                  <span className="font-bold text-emerald-950">Active / Current Syllabus</span>
                </div>
                {versionHistoryItem.currentFileName && (
                  <button
                    type="button"
                    onClick={() =>
                      handleDownload({
                        subjectCode: versionHistoryItem.courseCode,
                        subjectTitle: versionHistoryItem.courseTitle,
                        syllabusFile: versionHistoryItem.currentFileName,
                        facultyName: versionHistoryItem.instructor,
                      })
                    }
                    className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-800 hover:underline"
                  >
                    <Download className="size-3" /> Download
                  </button>
                )}
              </div>
              <div className="text-2xs text-emerald-900 space-y-0.5">
                <p>
                  File: <strong>{versionHistoryItem.currentFileName || 'Course_Syllabus.pdf'}</strong>
                </p>
                {versionHistoryItem.currentUploadedAt && (
                  <p>Published: {formatDate(versionHistoryItem.currentUploadedAt)}</p>
                )}
                {versionHistoryItem.currentChangeNote && (
                  <p className="italic bg-white/70 p-1.5 rounded ring-1 ring-emerald-200/50 mt-1">
                    Revision Note: {versionHistoryItem.currentChangeNote}
                  </p>
                )}
              </div>
            </div>

            {/* Historical archived versions */}
            {versionHistoryItem.history.length === 0 ? (
              <p className="text-center py-4 text-ink-500 text-2xs">
                No previous versions on file for this course.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="font-bold text-ink-900 text-2xs uppercase tracking-wider">
                  Archived Superseded Versions ({versionHistoryItem.history.length})
                </p>
                <div className="space-y-2">
                  {versionHistoryItem.history
                    .slice()
                    .reverse()
                    .map((vh) => (
                      <div
                        key={vh.version}
                        className="rounded-lg border border-ink-200 bg-white p-3 space-y-1 hover:bg-ink-50/50 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-ink-200 text-ink-800 font-mono font-bold text-2xs px-1.5 py-0.5">
                              v{vh.version}.0
                            </span>
                            <span className="font-semibold text-ink-800">{vh.fileName}</span>
                            <Badge tone="neutral" dot={false}>
                              Superseded
                            </Badge>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              downloadGeneratedPdf(
                                vh.fileName,
                                `ARCHIVED SYLLABUS v${vh.version}.0: ${versionHistoryItem.courseCode}`,
                                [
                                  'MINDANAO STATE UNIVERSITY AT NAAWAN',
                                  'COLLEGE OF EDUCATION AND SOCIAL SCIENCES',
                                  `ARCHIVED HISTORICAL COURSE SYLLABUS — VERSION ${vh.version}.0`,
                                  '',
                                  `Course Code: ${versionHistoryItem.courseCode}`,
                                  `Course Title: ${versionHistoryItem.courseTitle}`,
                                  `Instructor: ${vh.uploadedBy}`,
                                  `Archived Upload Date: ${formatDate(vh.uploadedAt)}`,
                                  `Revision Note: ${vh.changeNote || 'Standard replacement'}`,
                                  '',
                                  'ACCREDITATION ARCHIVE NOTICE:',
                                  'This electronic file represents an archived syllabus version preserved under CESS DocuFlow.',
                                ],
                              )
                            }
                            className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700 hover:underline"
                          >
                            <Download className="size-3" /> Archive Copy
                          </button>
                        </div>
                        <div className="text-2xs text-ink-500 flex flex-wrap gap-x-3">
                          <span>
                            Uploaded: {formatDate(vh.uploadedAt)} by {vh.uploadedBy}
                          </span>
                          {vh.changeNote && <span className="italic">"{vh.changeNote}"</span>}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* College Secretary Template Upload Modal */}
      {isSecretary && (
        <Dialog
          open={isTemplateUploadOpen}
          onClose={() => setIsTemplateUploadOpen(false)}
          title="Update Official Syllabus Template"
          description="Upload a new official standard course syllabus and TOS document template for all college faculty members."
          busy={templateBusy}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setIsTemplateUploadOpen(false)}
                disabled={templateBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleTemplateUploadSubmit}
                loading={templateBusy}
                icon={UploadCloud}
              >
                Update Template
              </Button>
            </>
          }
        >
          <form onSubmit={handleTemplateUploadSubmit} className="space-y-4">
            <Field
              label="New Template File Name"
              required
              hint="e.g. CESS_Official_Course_Syllabus_Template_2026_Rev2.docx"
            >
              <Input
                type="text"
                value={newTemplateFileName}
                onChange={(e) => setNewTemplateFileName(e.target.value)}
                placeholder="Enter file name or choose file below"
                required
              />
            </Field>

            <Field label="Choose Template File">
              <input
                type="file"
                accept=".docx,.pdf,.doc"
                className="text-xs text-ink-600"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setNewTemplateFileName(f.name)
                }}
              />
            </Field>
          </form>
        </Dialog>
      )}

      {/* In-App Syllabus Preview Modal */}
      {previewItem && (
        <SyllabusPreviewModal
          open={!!previewItem}
          onClose={() => setPreviewItem(null)}
          faculty={previewItem.faculty}
          subject={previewItem.subject}
        />
      )}

      {/* In-App Template Preview Modal */}
      {isPreviewTemplateOpen && (
        <SyllabusPreviewModal
          open={isPreviewTemplateOpen}
          onClose={() => setIsPreviewTemplateOpen(false)}
          isTemplate={true}
          template={syllabusTemplate}
        />
      )}
    </div>
  )
}
