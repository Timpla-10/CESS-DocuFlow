import {
  BookOpen,
  Download,
  FileText,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { useUser } from '../../app/session'
import { Input } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Avatar, Card, EmptyState, PageHeader } from '../../components/ui'
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
      />

      {/* Official Syllabus Template Card */}
      <div className="surface-brand-gradient relative overflow-hidden rounded-2xl p-6 text-white shadow-xl ring-1 ring-white/15">
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
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-brand-900 shadow-md transition hover:bg-brand-50 active:scale-95"
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
                              <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-ink-500">
                                <FileText className="size-3 text-ink-400 shrink-0" />
                                <span className="truncate">{sub.syllabusFile}</span>
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
    </div>
  )
}
