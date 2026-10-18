import {
  BookOpen,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Info,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Avatar, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { FacultyEntry, Subject, SyllabusTemplate } from '../../data/types'

const DEFAULT_SYLLABUS_TEMPLATE: SyllabusTemplate = {
  fileName: 'CESS_Official_Course_Syllabus_Template_2026.docx',
  updatedAt: '2026-03-01T08:00:00Z',
  uploadedBy: 'Ms. Carmela Ortiz (College Secretary)',
  fileSize: '142 KB',
}

export function FacultyDirectoryPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const [search, setSearch] = useState('')

  const isSecretary = user.role === 'secretary'
  const isFacultyUser = user.role === 'faculty' || user.role === 'chairperson'

  const syllabusTemplate: SyllabusTemplate = db.syllabusTemplate || DEFAULT_SYLLABUS_TEMPLATE

  // Add / Edit Faculty & Subjects Dialog State (Secretary Roster Management)
  const [editingFaculty, setEditingFaculty] = useState<FacultyEntry | null>(null)
  const [facName, setFacName] = useState('')
  const [facDept, setFacDept] = useState('')
  const [facSubjects, setFacSubjects] = useState<Subject[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false)

  const facultyList = db.faculty.filter((f) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      f.name.toLowerCase().includes(q) ||
      f.department.toLowerCase().includes(q) ||
      f.subjects.some((s) => s.code.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))
    )
  })

  // Template Handlers
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
      '1. Prepare your syllabus in alignment with the CHED Memorandum Orders and MSU Naawan OBE standards.',
      '2. Ensure Program Educational Objectives (PEOs) and Course Learning Outcomes (CLOs) are explicitly stated.',
      '3. Include a weekly schedule of learning activities, formative assessments, and grading rubric.',
      '4. Upload your completed syllabus file in your faculty portal card under Academic Directory.',
    ])
    toast.info('Template Downloaded', `Downloaded ${syllabusTemplate.fileName}.`)
  }

  const handleTemplateUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingTemplate(true)
    try {
      await api.updateSyllabusTemplate(user, {
        fileName: file.name,
        updatedAt: new Date().toISOString(),
        uploadedBy: `${user.name} (${user.position || 'College Secretary'})`,
        fileSize: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      })
      toast.success(
        'Template Updated',
        `Successfully uploaded ${file.name} as the official syllabus template for all faculty members.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to update syllabus template.'
      toast.error('Upload Failed', msg)
    } finally {
      setIsUploadingTemplate(false)
      e.target.value = ''
    }
  }

  // Faculty Self-Service Syllabus Handlers
  const handleUploadMySyllabus = async (facultyId: string, subjectCode: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await api.uploadFacultySyllabus(user, facultyId, subjectCode, file.name)
      toast.success(
        'Syllabus Uploaded',
        `Uploaded ${file.name} for ${subjectCode}. The College Secretary and students can now view it.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to upload syllabus.'
      toast.error('Upload Failed', msg)
    } finally {
      e.target.value = ''
    }
  }

  const handleRemoveMySyllabus = async (facultyId: string, subjectCode: string) => {
    if (!window.confirm(`Are you sure you want to remove your uploaded syllabus for ${subjectCode}?`)) return
    try {
      await api.removeFacultySyllabus(user, facultyId, subjectCode)
      toast.info('Syllabus Removed', `Removed syllabus for ${subjectCode}.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to remove syllabus.'
      toast.error('Removal Failed', msg)
    }
  }

  // Secretary Roster Management Handlers
  const openAddFaculty = () => {
    setEditingFaculty(null)
    setFacName('')
    setFacDept('Department of Secondary and Elementary Education')
    setFacSubjects([{ code: '', title: '' }])
    setIsDialogOpen(true)
  }

  const openEditFaculty = (fac: FacultyEntry) => {
    setEditingFaculty(fac)
    setFacName(fac.name)
    setFacDept(fac.department)
    setFacSubjects(
      fac.subjects.length > 0
        ? fac.subjects.map((s) => ({ ...s }))
        : [{ code: '', title: '' }],
    )
    setIsDialogOpen(true)
  }

  const handleSubjectChange = (index: number, field: keyof Subject, value: string) => {
    setFacSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  const addSubjectRow = () => {
    setFacSubjects((prev) => [...prev, { code: '', title: '' }])
  }

  const removeSubjectRow = (index: number) => {
    setFacSubjects((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveFaculty = async (e: FormEvent) => {
    e.preventDefault()
    if (!facName.trim() || !facDept.trim()) {
      toast.error('Validation Error', 'Please enter both the faculty member’s name and department.')
      return
    }
    setIsSaving(true)
    try {
      await api.saveFacultyEntry(user, {
        id: editingFaculty?.id ?? '',
        userId: editingFaculty?.userId,
        name: facName,
        department: facDept,
        subjects: facSubjects,
      })
      toast.success(
        editingFaculty ? 'Faculty Roster Updated' : 'Faculty Added to Roster',
        `Saved ${facName.trim()} in the directory roster.`,
      )
      setIsDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save faculty entry.'
      toast.error('Save Failed', msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteFaculty = async (fac: FacultyEntry) => {
    if (!window.confirm(`Remove ${fac.name} and their subject list from the directory?`)) return
    try {
      await api.deleteFacultyEntry(user, fac.id)
      toast.info('Faculty Removed', `${fac.name} was removed from the directory.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to remove faculty entry.'
      toast.error('Remove Failed', msg)
    }
  }

  const handleDownloadSyllabus = (fac: FacultyEntry, sub: Subject) => {
    const fileName = sub.syllabusFile || `${sub.code.replace(/\s+/g, '_')}_Syllabus.pdf`
    downloadGeneratedPdf(fileName, `COURSE SYLLABUS: ${sub.code} - ${sub.title}`, [
      `Course Code: ${sub.code}`,
      `Course Title: ${sub.title}`,
      `Instructor: ${fac.name}`,
      `Department: ${fac.department}`,
      `College: College of Education and Social Sciences, MSU at Naawan`,
      '',
      'COURSE OVERVIEW & SYLLABUS SUMMARY:',
      '1. Vision and Mission of Mindanao State University at Naawan',
      '2. Program Outcomes and Course Learning Outcomes (CLOs)',
      '3. Weekly Topic Schedule, Instructional Activities, and Assessment Tasks',
      '4. Grading System, Course Requirements, and Academic References',
    ])
    toast.info('Syllabus Downloaded', `Downloaded ${fileName}.`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic Directory"
        title="Faculty Members, Subjects & Course Syllabi"
        description="Browse College of Education and Social Sciences faculty members, their assigned teaching subjects, and official course syllabi (REQ-INFO-2, REQ-INFO-3, REQ-INFO-4)."
        actions={
          isSecretary ? (
            <Button onClick={openAddFaculty} icon={Plus}>
              Add Faculty & Subjects
            </Button>
          ) : undefined
        }
      />

      {/* Official Syllabus Template Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-midnight-950 via-brand-900 to-midnight-900 p-6 text-white shadow-xl ring-1 ring-white/10">
        <div
          className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-brand-400/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-md">
              <FileText className="size-6 text-brand-200" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase text-brand-200 ring-1 ring-white/20">
                  Institutional Standard
                </span>
                <span className="text-xs text-white/70">
                  Updated {new Date(syllabusTemplate.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-white tracking-tight">Official Course Syllabus Template</h2>
              <p className="mt-0.5 text-xs text-brand-100/80">
                <span className="font-semibold text-white">{syllabusTemplate.fileName}</span>
                {syllabusTemplate.fileSize && (
                  <span className="ml-2 text-brand-200/90">({syllabusTemplate.fileSize})</span>
                )}
                {' • '}
                <span>Uploaded by {syllabusTemplate.uploadedBy}</span>
              </p>
              <p className="mt-2 text-xs text-white/75 max-w-xl">
                Faculties should download this official CESS syllabus template to format course requirements and learning outcomes before submitting.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:flex-col sm:items-end">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-midnight-950 shadow-md transition hover:bg-brand-50 active:scale-95"
            >
              <Download className="size-4 text-brand-700" />
              Download Template
            </button>

            {isSecretary && (
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 ${
                  isUploadingTemplate ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <UploadCloud className="size-3.5 text-brand-200" />
                {isUploadingTemplate ? 'Uploading…' : 'Upload / Replace Template'}
                <input
                  type="file"
                  accept=".docx,.doc,.pdf"
                  className="sr-only"
                  onChange={handleTemplateUpload}
                  disabled={isUploadingTemplate}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Search Input */}
      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            type="search"
            placeholder="Search faculty name, department, subject code, or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4"
          />
        </div>
      </Card>

      {/* Directory Grid */}
      {facultyList.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={BookOpen} title="No faculty or subjects match your search">
            Try searching with a different instructor name or subject code.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {facultyList.map((fac) => {
            const isMyProfile =
              isFacultyUser &&
              ((fac.userId && fac.userId === user.id) ||
                fac.name.trim().toLowerCase() === user.name.trim().toLowerCase())

            return (
              <Card
                key={fac.id}
                className={`overflow-hidden transition-all ${
                  isMyProfile
                    ? 'ring-2 ring-brand-500 shadow-md'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3 border-b border-ink-100 bg-brand-50/40 p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={fac.name} size="lg" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-ink-900 truncate">{fac.name}</h3>
                        {isMyProfile && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800 ring-1 ring-inset ring-brand-300 shrink-0">
                            <Sparkles className="size-3 text-brand-600" /> My Teaching Load
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500 truncate">{fac.department}</p>
                    </div>
                  </div>

                  {isSecretary && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Edit3}
                        onClick={() => openEditFaculty(fac)}
                        title="Edit faculty details and teaching subjects"
                      >
                        Edit Roster
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        icon={Trash2}
                        onClick={() => handleDeleteFaculty(fac)}
                        aria-label={`Remove ${fac.name}`}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                      Subjects Handled & Syllabi ({fac.subjects.length})
                    </p>
                    {isMyProfile && (
                      <span className="text-[11px] font-medium text-brand-700">
                        Upload or update your course syllabi below
                      </span>
                    )}
                  </div>

                  {fac.subjects.length === 0 ? (
                    <p className="text-xs text-ink-500">No subjects assigned yet.</p>
                  ) : (
                    <ul className="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-100 overflow-hidden">
                      {fac.subjects.map((sub) => (
                        <li
                          key={`${sub.code}-${sub.title}`}
                          className="flex flex-col gap-2.5 bg-white p-3.5 hover:bg-brand-50/30 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200">
                                {sub.code}
                              </span>
                              <span className="text-xs font-semibold text-ink-900 truncate">{sub.title}</span>
                            </div>
                            {sub.syllabusFile && (
                              <p className="mt-1 truncate text-[11px] text-ink-500">
                                📄 {sub.syllabusFile}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {/* Download Button (Available to all when file exists) */}
                            {sub.syllabusFile ? (
                              <button
                                type="button"
                                onClick={() => handleDownloadSyllabus(fac, sub)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-xs ring-1 ring-ink-200 hover:bg-brand-50 active:scale-95 transition"
                              >
                                <Download className="size-3" /> Syllabus
                              </button>
                            ) : !isMyProfile ? (
                              <span className="text-[11px] italic text-ink-400">No syllabus uploaded</span>
                            ) : null}

                            {/* Faculty Self-Service Controls (Only on faculty member's own courses) */}
                            {isMyProfile && (
                              <>
                                {sub.syllabusFile ? (
                                  <>
                                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink-50 px-2 py-1 text-xs font-medium text-ink-700 shadow-xs ring-1 ring-ink-200 hover:bg-ink-100 transition">
                                      <UploadCloud className="size-3 text-ink-500" />
                                      Replace
                                      <input
                                        type="file"
                                        accept=".pdf,.docx,.doc"
                                        className="sr-only"
                                        onChange={(e) => handleUploadMySyllabus(fac.id, sub.code, e)}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMySyllabus(fac.id, sub.code)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-danger-50 px-2 py-1 text-xs font-medium text-danger-700 ring-1 ring-danger-200 hover:bg-danger-100 transition"
                                      title="Remove this syllabus file"
                                    >
                                      <Trash2 className="size-3" />
                                    </button>
                                  </>
                                ) : (
                                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition active:scale-95">
                                    <UploadCloud className="size-3.5" />
                                    Upload Syllabus
                                    <input
                                      type="file"
                                      accept=".pdf,.docx,.doc"
                                      className="sr-only"
                                      onChange={(e) => handleUploadMySyllabus(fac.id, sub.code, e)}
                                    />
                                  </label>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Secretary Dialog: Add / Edit Faculty & Assigned Subjects (No syllabus editing) */}
      <Dialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        size="lg"
        title={editingFaculty ? `Edit Faculty Roster — ${editingFaculty.name}` : 'Add Faculty Member to Directory'}
        description="Maintain instructor details and teaching subject assignments. Syllabi are uploaded directly by each assigned faculty member."
        busy={isSaving}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveFaculty} loading={isSaving} icon={Save}>
              Save Faculty & Subjects
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Faculty Full Name" required>
              <Input
                type="text"
                value={facName}
                onChange={(e) => setFacName(e.target.value)}
                placeholder="e.g. Prof. Ana Lim"
              />
            </Field>
            <Field label="Department" required>
              <Select
                value={facDept}
                onChange={(e) => setFacDept(e.target.value)}
              >
                <option value="Department of Secondary and Elementary Education">
                  Department of Secondary and Elementary Education
                </option>
                <option value="Department of Social Sciences and Humanities">
                  Department of Social Sciences and Humanities
                </option>
                <option value="Integrated Developmental School">
                  Integrated Developmental School
                </option>
              </Select>
            </Field>
          </div>

          {/* Governance Notice */}
          <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/70 p-3.5 text-xs text-brand-900">
            <Info className="size-4 shrink-0 text-brand-700 mt-0.5" />
            <div>
              <p className="font-semibold text-brand-950">Course Syllabi Governance</p>
              <p className="mt-0.5 text-brand-800">
                Official course syllabus files can only be uploaded and managed by the assigned faculty member. The College Secretary manages teaching load assignments and uploads the institutional syllabus template.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                Assigned Teaching Subjects
              </p>
              <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={addSubjectRow}>
                Add Subject
              </Button>
            </div>

            {facSubjects.map((sub, idx) => (
              <div key={idx} className="rounded-xl border border-ink-200 bg-ink-50/40 p-3.5 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-32 shrink-0">
                    <label className="mb-1 block text-[11px] font-semibold text-ink-600">Subject Code</label>
                    <Input
                      type="text"
                      value={sub.code}
                      onChange={(e) => handleSubjectChange(idx, 'code', e.target.value)}
                      placeholder="EDUC 101"
                      className="h-9 text-xs uppercase"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] font-semibold text-ink-600">Subject Title</label>
                    <Input
                      type="text"
                      value={sub.title}
                      onChange={(e) => handleSubjectChange(idx, 'title', e.target.value)}
                      placeholder="The Child and Adolescent Learner"
                      className="h-9 text-xs"
                    />
                  </div>
                  {facSubjects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSubjectRow(idx)}
                      className="mt-6 rounded p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                      aria-label="Remove subject"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                {sub.syllabusFile && (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">Uploaded Syllabus File: {sub.syllabusFile}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </form>
      </Dialog>
    </div>
  )
}
