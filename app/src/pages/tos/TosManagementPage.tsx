import {
  BookOpen,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  GraduationCap,
  Info,
  Plus,
  Search,
  Trash2,
  Upload,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select, Textarea } from '../../components/form'
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
  Tooltip,
  cn,
} from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { TosCognitiveLevels, TosRecord, TosTemplate } from '../../data/types'
import { fetchSupabaseTos } from '../../lib/supabase'
import { formatDate } from '../../lib/time'

const DEFAULT_TOS_TEMPLATE: TosTemplate = {
  fileName: 'CESS_Standard_Table_of_Specifications_Template_2026.xlsx',
  updatedAt: '2026-03-01T08:00:00Z',
  uploadedBy: 'Ms. Carmela Ortiz (College Secretary)',
  fileSize: '94 KB',
}

const ACADEMIC_YEARS = ['2026-2027', '2025-2026']
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer Term']
const EXAM_TERMS = ['All Terms', 'Midterm', 'Final']

const DEPARTMENTS = [
  'All Departments',
  'Department of Secondary and Elementary Education',
  'Department of Social Sciences and Humanities',
  'Integrated Developmental School',
]

/**
 * PB-57: Separate Table of Specifications (TOS) Management.
 * Establishes a dedicated category or section for TOS documents distinct from syllabi
 * and other academic files so authorized faculty can upload them and authorized users
 * can view and retrieve them according to assigned permissions.
 *
 * Strict RBAC: Students are NOT authorized to view or access TOS blueprints.
 */
export function TosManagementPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()

  const isFacultyUser = user.role === 'faculty'
  const isSecretary = user.role === 'secretary'
  const isChairperson = user.role === 'chairperson'

  // Synchronize with Supabase if live connected
  useEffect(() => {
    fetchSupabaseTos(user).catch(() => null)
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
  const [selectedTerm, setSelectedTerm] = useState('All Terms')
  const [statusFilter, setStatusFilter] = useState<'all' | 'uploaded' | 'pending'>('all')

  // Preview & Modal states
  const [previewItem, setPreviewItem] = useState<TosRecord | null>(null)
  const [isPreviewTemplateOpen, setIsPreviewTemplateOpen] = useState(false)

  // Upload/Edit Dialog state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [uploadSubjectCode, setUploadSubjectCode] = useState('')
  const [uploadSubjectTitle, setUploadSubjectTitle] = useState('')
  const [uploadAy, setUploadAy] = useState('2026-2027')
  const [uploadSem, setUploadSem] = useState('1st Semester')
  const [uploadTerm, setUploadTerm] = useState<'Midterm' | 'Final'>('Midterm')
  const [uploadTotalItems, setUploadTotalItems] = useState(50)
  const [uploadCognitive, setUploadCognitive] = useState<TosCognitiveLevels>({
    remembering: 15,
    understanding: 15,
    applying: 10,
    analyzing: 5,
    evaluating: 3,
    creating: 2,
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Delete Confirmation Dialog state
  const [deleteTarget, setDeleteTarget] = useState<TosRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Secretary Template Upload state
  const [isTemplateUploadOpen, setIsTemplateUploadOpen] = useState(false)
  const [newTemplateFile, setNewTemplateFile] = useState<File | null>(null)
  const [newTemplateFileName, setNewTemplateFileName] = useState('')
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false)

  // Institutional template
  const tosTemplate = db.tosTemplate || DEFAULT_TOS_TEMPLATE

  // Find logged-in faculty record
  const currentFaculty = useMemo(() => {
    return db.faculty.find(
      (f) =>
        (f.userId && f.userId === user.id) ||
        f.name.trim().toLowerCase() === user.name.trim().toLowerCase(),
    )
  }, [db.faculty, user.id, user.name])

  // Aggregate all courses across faculty rosters
  const allCourses = useMemo(() => {
    const list: {
      code: string
      title: string
      facultyId: string
      facultyName: string
      facultyUserId?: string
      department: string
    }[] = []

    const seen = new Set<string>()

    db.faculty.forEach((fac) => {
      fac.subjects.forEach((sub) => {
        const key = `${sub.code.trim().toUpperCase()}-${fac.id}`
        if (!seen.has(key)) {
          seen.add(key)
          list.push({
            code: sub.code.trim().toUpperCase(),
            title: sub.title,
            facultyId: fac.id,
            facultyName: fac.name,
            facultyUserId: fac.userId,
            department: fac.department,
          })
        }
      })
    })

    return list
  }, [db.faculty])

  // All TOS records from db.tos
  const allTosRecords = useMemo(() => {
    return db.tos || []
  }, [db.tos])

  // Filtered TOS records
  const filteredRecords = useMemo(() => {
    return allCourses
      .map((c) => {
        const matchingMidterm = allTosRecords.find(
          (t) =>
            t.subjectCode.toUpperCase() === c.code &&
            t.academicYear === selectedAy &&
            t.semester === selectedSem &&
            t.term === 'Midterm',
        )
        const matchingFinal = allTosRecords.find(
          (t) =>
            t.subjectCode.toUpperCase() === c.code &&
            t.academicYear === selectedAy &&
            t.semester === selectedSem &&
            t.term === 'Final',
        )

        return {
          course: c,
          midterm: matchingMidterm || null,
          final: matchingFinal || null,
          hasAny: Boolean(matchingMidterm || matchingFinal),
          hasBoth: Boolean(matchingMidterm && matchingFinal),
        }
      })
      .filter((item) => {
        // Tab filter: 'myCourses' shows only courses assigned to the current faculty
        if (activeTab === 'myCourses') {
          const isMyCourse =
            (currentFaculty && item.course.facultyId === currentFaculty.id) ||
            item.course.facultyUserId === user.id ||
            item.course.facultyName.toLowerCase() === user.name.toLowerCase()
          if (!isMyCourse) return false
        }

        // Department filter
        if (selectedDept !== 'All Departments') {
          if (item.course.department !== selectedDept) return false
        }

        // Exam Term filter
        if (selectedTerm === 'Midterm') {
          if (statusFilter === 'uploaded' && !item.midterm) return false
        } else if (selectedTerm === 'Final') {
          if (statusFilter === 'uploaded' && !item.final) return false
        }

        // Status filter
        if (statusFilter === 'uploaded' && !item.hasAny) return false
        if (statusFilter === 'pending' && item.hasBoth) return false

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase()
          const codeMatch = item.course.code.toLowerCase().includes(q)
          const titleMatch = item.course.title.toLowerCase().includes(q)
          const facMatch = item.course.facultyName.toLowerCase().includes(q)
          if (!codeMatch && !titleMatch && !facMatch) return false
        }

        return true
      })
  }, [
    allCourses,
    allTosRecords,
    selectedAy,
    selectedSem,
    selectedDept,
    selectedTerm,
    statusFilter,
    searchQuery,
    activeTab,
    currentFaculty,
    user.id,
    user.name,
  ])

  // Statistics
  const totalCourses = allCourses.length
  const totalMidtermFiled = allTosRecords.filter((t) => t.term === 'Midterm' && t.academicYear === selectedAy).length
  const totalFinalFiled = allTosRecords.filter((t) => t.term === 'Final' && t.academicYear === selectedAy).length
  const totalExpected = totalCourses * 2 // Midterm + Final
  const complianceRate = totalExpected > 0 ? Math.round(((totalMidtermFiled + totalFinalFiled) / totalExpected) * 100) : 0

  // Handle Download template
  const handleDownloadTemplate = () => {
    downloadGeneratedPdf(
      tosTemplate.fileName,
      'CESS Table of Specifications (TOS) Official Template',
      [
        'Mindanao State University at Naawan',
        'College of Education and Social Sciences',
        '',
        'Examination Blueprint Guidelines:',
        '1. Remembering (Knowledge) - 20-30%',
        '2. Understanding (Comprehension) - 20-30%',
        '3. Applying (Application) - 20-25%',
        '4. Analyzing (Analysis) - 10-15%',
        '5. Evaluating (Evaluation) - 5-10%',
        '6. Creating (Synthesis) - 5-10%',
        '',
        'Aligned with CHED Outcome-Based Education (OBE) Standards.',
      ],
    )
    toast.success('Template Downloaded', `Downloaded ${tosTemplate.fileName}`)
  }

  // Handle Download single TOS
  const handleDownloadTos = (record: TosRecord) => {
    const cog = record.cognitiveDistribution || {}
    downloadGeneratedPdf(
      record.fileName,
      `TABLE OF SPECIFICATIONS (TOS) — ${record.examType.toUpperCase()}`,
      [
        `Course: ${record.subjectCode} - ${record.subjectTitle}`,
        `Instructor: ${record.facultyName}`,
        `Department: ${record.department}`,
        `Academic Year: ${record.academicYear} | Semester: ${record.semester}`,
        `Total Test Items: ${record.totalItems}`,
        '',
        'Cognitive Levels Distribution:',
        `- Remembering: ${cog.remembering || 0} items`,
        `- Understanding: ${cog.understanding || 0} items`,
        `- Applying: ${cog.applying || 0} items`,
        `- Analyzing: ${cog.analyzing || 0} items`,
        `- Evaluating: ${cog.evaluating || 0} items`,
        `- Creating: ${cog.creating || 0} items`,
        '',
        'Official Accreditation & Assessment Document',
      ],
    )
    toast.success('TOS Downloaded', `Downloaded ${record.fileName}`)
  }

  // Handle Open Upload Dialog
  const handleOpenUpload = (code = '', title = '', term: 'Midterm' | 'Final' = 'Midterm') => {
    setUploadSubjectCode(code)
    setUploadSubjectTitle(title)
    setUploadAy(selectedAy)
    setUploadSem(selectedSem)
    setUploadTerm(term)
    setUploadTotalItems(50)
    setUploadCognitive({
      remembering: 15,
      understanding: 15,
      applying: 10,
      analyzing: 5,
      evaluating: 3,
      creating: 2,
    })
    setUploadFile(null)
    setUploadFileName(code ? `${code.replace(/\s+/g, '')}_${term}_TOS_${selectedAy}.xlsx` : '')
    setUploadDescription('')
    setIsUploadDialogOpen(true)
  }

  // Handle Submit Upload
  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!uploadSubjectCode.trim()) {
      toast.error('Missing Code', 'Please enter or select a course code.')
      return
    }
    if (!uploadSubjectTitle.trim()) {
      toast.error('Missing Title', 'Please enter a course title.')
      return
    }
    if (!uploadFileName.trim()) {
      toast.error('Missing File', 'Please attach or name a TOS file.')
      return
    }

    setIsUploading(true)
    try {
      await api.uploadTosRecord(user, {
        subjectCode: uploadSubjectCode,
        subjectTitle: uploadSubjectTitle,
        academicYear: uploadAy,
        semester: uploadSem,
        term: uploadTerm,
        examType: `${uploadTerm} Examination`,
        totalItems: Number(uploadTotalItems) || 50,
        cognitiveDistribution: uploadCognitive,
        fileName: uploadFileName,
        fileSizeKb: uploadFile ? Math.round(uploadFile.size / 1024) : 115,
        description: uploadDescription.trim() || `${uploadTerm} Table of Specifications test blueprint.`,
        department: selectedDept !== 'All Departments' ? selectedDept : undefined,
      })

      toast.success(
        'TOS Uploaded Successfully',
        `Published ${uploadTerm} TOS for ${uploadSubjectCode.toUpperCase()}`,
      )
      setIsUploadDialogOpen(false)
    } catch (err: unknown) {
      toast.error('Upload Failed', err instanceof Error ? err.message : 'Unable to upload TOS.')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle Delete TOS
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.deleteTosRecord(user, deleteTarget.id)
      toast.success('TOS Removed', `Removed ${deleteTarget.subjectCode} ${deleteTarget.term} TOS.`)
      setDeleteTarget(null)
    } catch (err: unknown) {
      toast.error('Delete Failed', err instanceof Error ? err.message : 'Unable to delete TOS.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle Secretary Template Update
  const handleTemplateUploadSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!newTemplateFileName.trim()) {
      toast.error('Missing Template', 'Please upload or specify a template file.')
      return
    }
    setIsUpdatingTemplate(true)
    try {
      const sizeStr = newTemplateFile
        ? `${Math.round(newTemplateFile.size / 1024)} KB`
        : '98 KB'
      await api.updateTosTemplate(user, newTemplateFileName, sizeStr)
      toast.success('Template Updated', `Published standard TOS template: ${newTemplateFileName}`)
      setIsTemplateUploadOpen(false)
    } catch (err: unknown) {
      toast.error('Update Failed', err instanceof Error ? err.message : 'Unable to update template.')
    } finally {
      setIsUpdatingTemplate(false)
    }
  }

  // Cognitive distribution total item helper
  const cognitiveItemTotal = useMemo(() => {
    const c = uploadCognitive
    return (
      Number(c.remembering || 0) +
      Number(c.understanding || 0) +
      Number(c.applying || 0) +
      Number(c.analyzing || 0) +
      Number(c.evaluating || 0) +
      Number(c.creating || 0)
    )
  }, [uploadCognitive])

  // Strict RBAC: Students are never authorized to view or retrieve Table of Specifications
  if (user.role === 'student') {
    return <Navigate to="/app/documents" replace />
  }

  return (
    <div className="space-y-6">
      {/* Page Header with hover-reveal description */}
      <PageHeader
        eyebrow="Academic Assessment & Examination Blueprints (PB-57)"
        title="Table of Specifications (TOS) Management"
        description="Manage, upload, view, and retrieve official course Tables of Specifications (TOS) separately from course syllabi and administrative document requests."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content="Download CESS Standard TOS Template (.xlsx / .docx)">
              <Button variant="secondary" icon={Download} onClick={handleDownloadTemplate}>
                Download TOS Template
              </Button>
            </Tooltip>
            {isSecretary && (
              <Tooltip content="Upload and publish a revised standard institutional TOS template">
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
              <Tooltip content="Upload and publish an examination TOS for your assigned course">
                <Button icon={FilePlus2} onClick={() => handleOpenUpload()}>
                  Upload Course TOS
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
          label="Midterm TOS Filed"
          value={totalMidtermFiled}
          hint={`of ${totalCourses} course offerings`}
          icon={FileSpreadsheet}
          tone="ids"
        />
        <StatCard
          label="Final TOS Filed"
          value={totalFinalFiled}
          hint={`of ${totalCourses} course offerings`}
          icon={FileCheck2}
          tone="dsee"
        />
        <StatCard
          label="TOS Compliance"
          value={`${complianceRate}%`}
          hint="Assessment blueprint coverage"
          icon={GraduationCap}
          tone={complianceRate >= 80 ? 'success' : 'warning'}
        />
      </div>

      {/* Dedicated Information Banner (PB-57 Requirement) */}
      <Callout tone="brand" icon={Info} title="Dedicated Table of Specifications (TOS) Repository">
        Table of Specifications (TOS) documents are organized in this dedicated examination assessment section separately from course syllabi and regular administrative document requests. Faculty members can maintain their own course test blueprints (including cognitive level distributions across Remembering, Understanding, Applying, Analyzing, Evaluating, and Creating), while department chairs, the college dean, and administrators can view and retrieve official blueprints for accreditation and academic audits.
      </Callout>

      {/* Main Container */}
      <Card>
        {/* Navigation Tabs */}
        <div className="border-b border-ink-100 p-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<'all' | 'myCourses' | 'template'>
              label="TOS Repository Navigation"
              value={activeTab}
              onChange={(tab) => setActiveTab(tab)}
              options={[
                ...(isFacultyUser
                  ? [
                      {
                        value: 'myCourses' as const,
                        label: 'My Course TOS',
                        count: currentFaculty ? currentFaculty.subjects.length : 0,
                      },
                    ]
                  : []),
                {
                  value: 'all' as const,
                  label: 'All Assessment Blueprints',
                  count: allCourses.length,
                },
                {
                  value: 'template' as const,
                  label: 'Institutional Template',
                },
              ]}
            />

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500">
                AY {selectedAy} · {selectedSem}
              </span>
            </div>
          </div>
        </div>

        {/* Tab 1 & Tab 2: All Courses & My Courses Views */}
        {activeTab !== 'template' && (
          <div className="space-y-4 p-4 sm:p-6">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {/* Search */}
              <div className="lg:col-span-2 relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  placeholder="Search by course code, title, or instructor…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white py-2 pl-9 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Department */}
              <div>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  disabled={isChairperson}
                  className="w-full rounded-xl border border-ink-200 bg-white py-2 px-3 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Academic Year */}
              <div>
                <select
                  value={selectedAy}
                  onChange={(e) => setSelectedAy(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white py-2 px-3 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {ACADEMIC_YEARS.map((ay) => (
                    <option key={ay} value={ay}>
                      AY {ay}
                    </option>
                  ))}
                </select>
              </div>

              {/* Semester */}
              <div>
                <select
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white py-2 px-3 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {SEMESTERS.map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exam Term Filter */}
              <div>
                <select
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white py-2 px-3 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {EXAM_TERMS.map((t) => (
                    <option key={t} value={t}>
                      {t === 'All Terms' ? 'All Exam Terms' : `${t} Exam`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status Quick Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 pb-3">
              <span className="text-2xs font-semibold text-ink-500">Filter Status:</span>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors',
                  statusFilter === 'all'
                    ? 'bg-brand-600 text-white shadow-2xs'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
                )}
              >
                All Courses ({filteredRecords.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('uploaded')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors',
                  statusFilter === 'uploaded'
                    ? 'bg-success-600 text-white shadow-2xs'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
                )}
              >
                With Uploaded TOS ({filteredRecords.filter((r) => r.hasAny).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors',
                  statusFilter === 'pending'
                    ? 'bg-warning-600 text-white shadow-2xs'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
                )}
              >
                Pending TOS ({filteredRecords.filter((r) => !r.hasBoth).length})
              </button>
            </div>

            {/* Courses & TOS Grid */}
            {filteredRecords.length === 0 ? (
              <EmptyState
                icon={FileSpreadsheet}
                title="No Table of Specifications records found"
                action={
                  isFacultyUser ? (
                    <Button icon={Plus} onClick={() => handleOpenUpload()}>
                      Upload Course TOS
                    </Button>
                  ) : undefined
                }
              >
                No course records match your current filters. Adjust your search query, academic year, or department.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredRecords.map(({ course, midterm, final }) => {
                  const isAssignedFaculty =
                    (currentFaculty && course.facultyId === currentFaculty.id) ||
                    course.facultyUserId === user.id ||
                    course.facultyName.toLowerCase() === user.name.toLowerCase()

                  const canUpload = isAssignedFaculty || isSecretary

                  return (
                    <div
                      key={`${course.code}-${course.facultyId}`}
                      className="flex flex-col justify-between rounded-xl border border-ink-200 bg-white p-4 sm:p-5 shadow-2xs transition-all hover:border-brand-300 hover:shadow-sm"
                    >
                      {/* Top Course Meta */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-xs font-extrabold text-brand-900 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200/60">
                              {course.code}
                            </span>
                            <h3 className="mt-1 text-sm font-bold text-ink-950 truncate">
                              {course.title}
                            </h3>
                          </div>
                          <Badge
                            tone={
                              course.department.includes('Secondary')
                                ? 'dsee'
                                : course.department.includes('Social')
                                ? 'dssh'
                                : 'ids'
                            }
                            dot={false}
                          >
                            {course.department.includes('Secondary')
                              ? 'DSEE'
                              : course.department.includes('Social')
                              ? 'DSSH'
                              : 'IDS'}
                          </Badge>
                        </div>

                        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-600">
                          <GraduationCap className="size-3.5 text-brand-600 shrink-0" />
                          <span className="truncate">{course.facultyName}</span>
                        </div>

                        {/* Midterm and Final Exam Rows */}
                        <div className="mt-4 space-y-2.5 border-t border-ink-100 pt-3">
                          {/* MIDTERM TOS ROW */}
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50/70 p-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-2xs font-bold uppercase tracking-wider text-ink-600">
                                  Midterm Exam:
                                </span>
                                {midterm ? (
                                  <Badge tone="success" dot={true}>
                                    Available ({midterm.totalItems} items)
                                  </Badge>
                                ) : (
                                  <Badge tone="warning" dot={false}>
                                    Pending
                                  </Badge>
                                )}
                              </div>
                              {midterm && (
                                <p className="mt-1 text-2xs text-ink-500 truncate">
                                  {midterm.fileName} · Updated {formatDate(midterm.uploadedAt)}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {midterm ? (
                                <>
                                  <Tooltip content="Preview Midterm TOS Blueprint">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewItem(midterm)}
                                      className="grid size-7 place-items-center rounded-md border border-ink-200 bg-white text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                                    >
                                      <Eye className="size-3.5" />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Download Midterm TOS (.xlsx)">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadTos(midterm)}
                                      className="grid size-7 place-items-center rounded-md border border-ink-200 bg-white text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                                    >
                                      <Download className="size-3.5" />
                                    </button>
                                  </Tooltip>
                                  {canUpload && (
                                    <Tooltip content="Delete Midterm TOS">
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(midterm)}
                                        className="grid size-7 place-items-center rounded-md border border-danger-200 bg-white text-danger-700 hover:bg-danger-50 transition-colors"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </Tooltip>
                                  )}
                                </>
                              ) : (
                                canUpload && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenUpload(course.code, course.title, 'Midterm')}
                                    className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-2xs font-bold text-white hover:bg-brand-700 transition-colors"
                                  >
                                    <Upload className="size-3" />
                                    <span>Upload Midterm</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {/* FINAL EXAM ROW */}
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50/70 p-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-2xs font-bold uppercase tracking-wider text-ink-600">
                                  Final Exam:
                                </span>
                                {final ? (
                                  <Badge tone="success" dot={true}>
                                    Available ({final.totalItems} items)
                                  </Badge>
                                ) : (
                                  <Badge tone="warning" dot={false}>
                                    Pending
                                  </Badge>
                                )}
                              </div>
                              {final && (
                                <p className="mt-1 text-2xs text-ink-500 truncate">
                                  {final.fileName} · Updated {formatDate(final.uploadedAt)}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {final ? (
                                <>
                                  <Tooltip content="Preview Final TOS Blueprint">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewItem(final)}
                                      className="grid size-7 place-items-center rounded-md border border-ink-200 bg-white text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                                    >
                                      <Eye className="size-3.5" />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Download Final TOS (.xlsx)">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadTos(final)}
                                      className="grid size-7 place-items-center rounded-md border border-ink-200 bg-white text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                                    >
                                      <Download className="size-3.5" />
                                    </button>
                                  </Tooltip>
                                  {canUpload && (
                                    <Tooltip content="Delete Final TOS">
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(final)}
                                        className="grid size-7 place-items-center rounded-md border border-danger-200 bg-white text-danger-700 hover:bg-danger-50 transition-colors"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </Tooltip>
                                  )}
                                </>
                              ) : (
                                canUpload && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenUpload(course.code, course.title, 'Final')}
                                    className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-2xs font-bold text-white hover:bg-brand-700 transition-colors"
                                  >
                                    <Upload className="size-3" />
                                    <span>Upload Final</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-2xs text-ink-500">
                        <span>
                          {midterm && final
                            ? 'Both Midterm & Final TOS uploaded'
                            : midterm || final
                            ? 'Partial examination blueprint uploaded'
                            : 'No TOS filed yet for this semester'}
                        </span>
                        {canUpload && (
                          <button
                            type="button"
                            onClick={() => handleOpenUpload(course.code, course.title, midterm ? 'Final' : 'Midterm')}
                            className="font-semibold text-brand-700 hover:text-brand-900"
                          >
                            + Add / Replace
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Institutional TOS Template */}
        {activeTab === 'template' && (
          <div className="space-y-6 p-4 sm:p-6">
            <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="grid size-12 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
                    <FileSpreadsheet className="size-6" />
                  </div>
                  <div>
                    <span className="text-2xs font-bold uppercase tracking-wider text-brand-700">
                      Standard Institutional Examination Blueprint
                    </span>
                    <h3 className="text-lg font-bold text-ink-950">
                      {tosTemplate.fileName}
                    </h3>
                    <p className="mt-1 text-xs text-ink-600">
                      Maintained by {tosTemplate.uploadedBy} · Last updated{' '}
                      {formatDate(tosTemplate.updatedAt)} · Size {tosTemplate.fileSize}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Tooltip content="Preview official TOS blueprint template in-app">
                    <Button
                      variant="secondary"
                      icon={Eye}
                      onClick={() => setIsPreviewTemplateOpen(true)}
                    >
                      Preview Template
                    </Button>
                  </Tooltip>
                  <Tooltip content="Download CESS Official TOS Template (.xlsx / .docx)">
                    <Button icon={Download} onClick={handleDownloadTemplate}>
                      Download Template
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Bloom's Taxonomy Cognitive Levels Guide Card */}
            <div className="space-y-3 rounded-xl border border-ink-200 bg-white p-5">
              <h4 className="text-sm font-bold text-ink-950">
                CHED & Outcome-Based Education (OBE) TOS Cognitive Domains
              </h4>
              <p className="text-xs text-ink-600 leading-relaxed">
                A Table of Specifications (TOS) is a test map that ensures an examination aligns with Course Learning Outcomes (CLOs) across Bloom&apos;s revised cognitive levels:
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pt-2">
                <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <span className="font-bold text-xs text-ink-900">1. Remembering (20–30%)</span>
                  <p className="mt-1 text-2xs text-ink-600">Recall facts, formulas, terms, and basic educational concepts.</p>
                </div>
                <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <span className="font-bold text-xs text-ink-900">2. Understanding (20–30%)</span>
                  <p className="mt-1 text-2xs text-ink-600">Explain ideas, interpret passages, compare principles.</p>
                </div>
                <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <span className="font-bold text-xs text-ink-900">3. Applying (20–25%)</span>
                  <p className="mt-1 text-2xs text-ink-600">Use knowledge in new situations, solve problems, execute methods.</p>
                </div>
                <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <span className="font-bold text-xs text-ink-900">4. Analyzing (10–15%)</span>
                  <p className="mt-1 text-2xs text-ink-600">Distinguish parts, analyze data, identify organizational motives.</p>
                </div>
                <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <span className="font-bold text-xs text-ink-900">5. Evaluating (5–10%)</span>
                  <p className="mt-1 text-2xs text-ink-600">Justify stances, appraise arguments, judge value of solutions.</p>
                </div>
                <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <span className="font-bold text-xs text-ink-900">6. Creating (5–10%)</span>
                  <p className="mt-1 text-2xs text-ink-600">Formulate hypotheses, construct lesson plans, synthesize new models.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Upload/Replace Course TOS Modal */}
      <Dialog
        open={isUploadDialogOpen}
        onClose={() => setIsUploadDialogOpen(false)}
        title={`Upload Table of Specifications (${uploadTerm} Examination)`}
        busy={isUploading}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-xs text-ink-500">
              Total items: <strong className="text-ink-900">{uploadTotalItems}</strong> (Items breakdown sum: {cognitiveItemTotal})
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setIsUploadDialogOpen(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button onClick={handleUploadSubmit} loading={isUploading} loadingText="Publishing…">
                Publish Course TOS
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Course Code" required hint="e.g. EDUC 101, SOCSCI 110">
              <Input
                placeholder="EDUC 101"
                value={uploadSubjectCode}
                onChange={(e) => setUploadSubjectCode(e.target.value.toUpperCase())}
                required
              />
            </Field>

            <Field label="Course Title" required hint="Full official subject name">
              <Input
                placeholder="The Child and Adolescent Learner"
                value={uploadSubjectTitle}
                onChange={(e) => setUploadSubjectTitle(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Academic Year" required>
              <Select value={uploadAy} onChange={(e) => setUploadAy(e.target.value)}>
                {ACADEMIC_YEARS.map((ay) => (
                  <option key={ay} value={ay}>
                    AY {ay}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Semester" required>
              <Select value={uploadSem} onChange={(e) => setUploadSem(e.target.value)}>
                {SEMESTERS.map((sem) => (
                  <option key={sem} value={sem}>
                    {sem}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Examination Term" required>
              <Select
                value={uploadTerm}
                onChange={(e) => setUploadTerm(e.target.value as 'Midterm' | 'Final')}
              >
                <option value="Midterm">Midterm Examination</option>
                <option value="Final">Final Examination</option>
              </Select>
            </Field>
          </div>

          <Field label="Total Examination Items" required hint="Standard CESS exam total (typically 50 or 100 items)">
            <Input
              type="number"
              min={10}
              max={200}
              value={uploadTotalItems}
              onChange={(e) => setUploadTotalItems(Number(e.target.value))}
              required
            />
          </Field>

          {/* Cognitive Levels Breakdown */}
          <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-900">
                Cognitive Level Item Distribution (Items per level)
              </span>
              <span className="text-2xs font-semibold text-brand-700">
                Target: {uploadTotalItems} items
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="text-2xs font-semibold text-ink-600">Remembering</label>
                <Input
                  type="number"
                  min={0}
                  value={uploadCognitive.remembering ?? 0}
                  onChange={(e) =>
                    setUploadCognitive((prev) => ({ ...prev, remembering: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="text-2xs font-semibold text-ink-600">Understanding</label>
                <Input
                  type="number"
                  min={0}
                  value={uploadCognitive.understanding ?? 0}
                  onChange={(e) =>
                    setUploadCognitive((prev) => ({ ...prev, understanding: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="text-2xs font-semibold text-ink-600">Applying</label>
                <Input
                  type="number"
                  min={0}
                  value={uploadCognitive.applying ?? 0}
                  onChange={(e) =>
                    setUploadCognitive((prev) => ({ ...prev, applying: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="text-2xs font-semibold text-ink-600">Analyzing</label>
                <Input
                  type="number"
                  min={0}
                  value={uploadCognitive.analyzing ?? 0}
                  onChange={(e) =>
                    setUploadCognitive((prev) => ({ ...prev, analyzing: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="text-2xs font-semibold text-ink-600">Evaluating</label>
                <Input
                  type="number"
                  min={0}
                  value={uploadCognitive.evaluating ?? 0}
                  onChange={(e) =>
                    setUploadCognitive((prev) => ({ ...prev, evaluating: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="text-2xs font-semibold text-ink-600">Creating</label>
                <Input
                  type="number"
                  min={0}
                  value={uploadCognitive.creating ?? 0}
                  onChange={(e) =>
                    setUploadCognitive((prev) => ({ ...prev, creating: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>

          {/* File Picker */}
          <Field label="TOS Blueprint File (.xlsx, .docx, .pdf)" required>
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-200 bg-white p-5 text-center hover:border-brand-300 transition-colors">
              <UploadCloud className="size-8 text-brand-600 mb-2" />
              <label className="cursor-pointer font-semibold text-xs text-brand-700 hover:underline">
                <span>Select file from computer</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.docx,.pdf"
                  className="hidden"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setUploadFile(f)
                      setUploadFileName(f.name)
                    }
                  }}
                />
              </label>
              <p className="mt-1 text-2xs text-ink-400">Accepted formats: Excel (.xlsx), Word (.docx), PDF (max 20 MB)</p>
              {uploadFileName && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-900 border border-brand-200">
                  <FileSpreadsheet className="size-4" />
                  <span className="font-semibold">{uploadFileName}</span>
                  {uploadFile && (
                    <span className="text-2xs text-brand-600">({Math.round(uploadFile.size / 1024)} KB)</span>
                  )}
                </div>
              )}
            </div>
          </Field>

          <Field label="Notes / Examination Remarks (Optional)">
            <Textarea
              placeholder="e.g. Aligned with OBE competencies covering Modules 1 to 4."
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              rows={2}
            />
          </Field>
        </form>
      </Dialog>

      {/* Preview Blueprint Modal */}
      {previewItem && (
        <Dialog
          open={Boolean(previewItem)}
          onClose={() => setPreviewItem(null)}
          title={`TOS Blueprint: ${previewItem.subjectCode} - ${previewItem.examType}`}
          size="lg"
          footer={
            <div className="flex w-full items-center justify-between">
              <span className="text-xs text-ink-500">
                Uploaded by {previewItem.facultyName} on {formatDate(previewItem.uploadedAt)}
              </span>
              <Button icon={Download} onClick={() => handleDownloadTos(previewItem)}>
                Download Blueprint
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-ink-50 p-4 border border-ink-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-base text-ink-950">
                    {previewItem.subjectCode}: {previewItem.subjectTitle}
                  </h4>
                  <p className="text-xs text-ink-600">
                    {previewItem.department} · AY {previewItem.academicYear} ({previewItem.semester})
                  </p>
                </div>
                <Badge tone="brand" dot={false}>
                  {previewItem.totalItems} Total Test Items
                </Badge>
              </div>
            </div>

            {/* Cognitive Distribution Breakdown */}
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-ink-600">
                Cognitive Level Test Item Mapping
              </h5>
              <div className="space-y-2">
                {[
                  { label: 'Remembering (Knowledge)', val: previewItem.cognitiveDistribution?.remembering || 0, color: 'bg-brand-500' },
                  { label: 'Understanding (Comprehension)', val: previewItem.cognitiveDistribution?.understanding || 0, color: 'bg-ids-500' },
                  { label: 'Applying (Application)', val: previewItem.cognitiveDistribution?.applying || 0, color: 'bg-dsee-500' },
                  { label: 'Analyzing (Analysis)', val: previewItem.cognitiveDistribution?.analyzing || 0, color: 'bg-dssh-600' },
                  { label: 'Evaluating (Evaluation)', val: previewItem.cognitiveDistribution?.evaluating || 0, color: 'bg-warning-500' },
                  { label: 'Creating (Synthesis)', val: previewItem.cognitiveDistribution?.creating || 0, color: 'bg-success-600' },
                ].map((item) => {
                  const pct = previewItem.totalItems > 0 ? Math.round((item.val / previewItem.totalItems) * 100) : 0
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-ink-800">{item.label}</span>
                        <span className="text-ink-600 font-mono">
                          {item.val} items ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', item.color)}
                          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 text-xs text-brand-900">
              <p className="font-medium">
                {previewItem.description || 'Official Table of Specifications examination blueprint filed for accreditation records.'}
              </p>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <Dialog
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Remove Table of Specifications"
          busy={isDeleting}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirm} loading={isDeleting} loadingText="Removing…">
                Remove TOS
              </Button>
            </div>
          }
        >
          <p className="text-sm text-ink-700 leading-relaxed">
            Are you sure you want to remove the <strong>{deleteTarget.examType}</strong> Table of Specifications for{' '}
            <strong>{deleteTarget.subjectCode}</strong>? This action will remove the assessment blueprint from accreditation records.
          </p>
        </Dialog>
      )}

      {/* Institutional Template Preview Modal */}
      <Dialog
        open={isPreviewTemplateOpen}
        onClose={() => setIsPreviewTemplateOpen(false)}
        title="Official CESS Table of Specifications Template Preview"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button icon={Download} onClick={handleDownloadTemplate}>
              Download Official Template
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-ink-700 leading-relaxed">
          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 text-center">
            <p className="font-bold text-sm text-brand-950">MINDANAO STATE UNIVERSITY AT NAAWAN</p>
            <p className="font-semibold text-xs text-brand-800">COLLEGE OF EDUCATION AND SOCIAL SCIENCES</p>
            <p className="mt-1 text-2xs uppercase tracking-wider text-brand-700">
              TABLE OF SPECIFICATIONS (TOS) & ASSESSMENT MATRIX
            </p>
          </div>
          <p>
            The standard CESS TOS template maps every examination item to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Course Learning Outcomes (CLOs) and Competencies</li>
            <li>Class hours devoted per instructional topic</li>
            <li>Cognitive domain weighting: Remembering, Understanding, Applying, Analyzing, Evaluating, Creating</li>
            <li>Item placement numbers and point values</li>
          </ul>
        </div>
      </Dialog>

      {/* Secretary Template Update Modal */}
      <Dialog
        open={isTemplateUploadOpen}
        onClose={() => setIsTemplateUploadOpen(false)}
        title="Update Standard Institutional TOS Template"
        busy={isUpdatingTemplate}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsTemplateUploadOpen(false)} disabled={isUpdatingTemplate}>
              Cancel
            </Button>
            <Button onClick={handleTemplateUploadSubmit} loading={isUpdatingTemplate} loadingText="Publishing…">
              Publish Template
            </Button>
          </div>
        }
      >
        <form onSubmit={handleTemplateUploadSubmit} className="space-y-4">
          <p className="text-xs text-ink-600">
            Publish an updated standard Table of Specifications template (.xlsx / .docx) for all CESS and IDS faculty members.
          </p>
          <Field label="Template File (.xlsx, .docx)" required>
            <input
              type="file"
              accept=".xlsx,.xls,.docx,.pdf"
              className="text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setNewTemplateFile(f)
                  setNewTemplateFileName(f.name)
                }
              }}
            />
          </Field>
          <Field label="Template Name">
            <Input
              value={newTemplateFileName}
              onChange={(e) => setNewTemplateFileName(e.target.value)}
              placeholder="CESS_Standard_Table_of_Specifications_Template_2026.xlsx"
            />
          </Field>
        </form>
      </Dialog>
    </div>
  )
}
