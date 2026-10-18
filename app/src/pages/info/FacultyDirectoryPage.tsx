import {
  BookOpen,
  Download,
  Edit3,
  Plus,
  Save,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Avatar, Button, Card, DepartmentBadge, EmptyState, PageHeader } from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { FacultyEntry, Subject } from '../../data/types'

export function FacultyDirectoryPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const [search, setSearch] = useState('')

  const isSecretary = user.role === 'secretary'

  // Add / Edit Faculty & Subjects Dialog State (REQ-INFO-3)
  const [editingFaculty, setEditingFaculty] = useState<FacultyEntry | null>(null)
  const [facName, setFacName] = useState('')
  const [facDept, setFacDept] = useState('')
  const [facSubjects, setFacSubjects] = useState<Subject[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const facultyList = db.faculty.filter((f) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      f.name.toLowerCase().includes(q) ||
      f.department.toLowerCase().includes(q) ||
      f.subjects.some((s) => s.code.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))
    )
  })

  const openAddFaculty = () => {
    setEditingFaculty(null)
    setFacName('')
    setFacDept('Department of Secondary and Elementary Education (DSEE)')
    setFacSubjects([{ code: '', title: '', syllabusFile: '' }])
    setIsDialogOpen(true)
  }

  const openEditFaculty = (fac: FacultyEntry) => {
    setEditingFaculty(fac)
    setFacName(fac.name)
    setFacDept(fac.department)
    setFacSubjects(fac.subjects.length > 0 ? fac.subjects.map((s) => ({ ...s })) : [{ code: '', title: '', syllabusFile: '' }])
    setIsDialogOpen(true)
  }

  const handleSubjectChange = (index: number, field: keyof Subject, value: string) => {
    setFacSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  const handleSyllabusUpload = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    handleSubjectChange(index, 'syllabusFile', file.name)
    e.target.value = ''
  }

  const addSubjectRow = () => {
    setFacSubjects((prev) => [...prev, { code: '', title: '', syllabusFile: '' }])
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
        name: facName,
        department: facDept,
        subjects: facSubjects,
      })
      toast.success(
        editingFaculty ? 'Faculty Updated' : 'Faculty Added',
        `Saved ${facName.trim()} and their subjects/syllabi in the directory.`,
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

      {/* Search Input */}
      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            type="search"
            placeholder="Search faculty name, department, subject code, or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
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
          {facultyList.map((fac) => (
            <Card key={fac.id} className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-ink-100 bg-brand-50/40 p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={fac.name} size="lg" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-ink-900">{fac.name}</h3>
                    <div className="mt-1 flex items-center gap-1.5">
                      <DepartmentBadge department={fac.department} />
                    </div>
                  </div>
                </div>
                {isSecretary && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Edit3}
                      onClick={() => openEditFaculty(fac)}
                    >
                      Edit
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
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">
                  Subjects Handled & Syllabi ({fac.subjects.length})
                </p>
                {fac.subjects.length === 0 ? (
                  <p className="text-xs text-ink-500">No subjects listed yet.</p>
                ) : (
                  <ul className="divide-y divide-ink-100 rounded-lg ring-1 ring-ink-100">
                    {fac.subjects.map((sub) => (
                      <li key={`${sub.code}-${sub.title}`} className="flex items-center justify-between gap-2 bg-white p-3 hover:bg-brand-50/50">
                        <div className="min-w-0">
                          <span className="mr-2 rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                            {sub.code}
                          </span>
                          <span className="text-xs font-medium text-ink-900">{sub.title}</span>
                        </div>
                        {sub.syllabusFile ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadSyllabus(fac, sub)}
                            className="inline-flex shrink-0 items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-xs ring-1 ring-ink-200 hover:bg-brand-50"
                          >
                            <Download className="size-3" /> Syllabus
                          </button>
                        ) : (
                          <span className="shrink-0 text-[11px] text-ink-400">No syllabus file</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Faculty, Subjects & Syllabi Dialog (REQ-INFO-3) */}
      <Dialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        size="lg"
        title={editingFaculty ? `Edit Faculty & Subjects — ${editingFaculty.name}` : 'Add Faculty Member & Subjects'}
        description="Add or update faculty details, the subjects they handle, and the official syllabus file for each subject (REQ-INFO-3)."
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
              <select
                value={facDept}
                onChange={(e) => setFacDept(e.target.value)}
                className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 focus-ring"
              >
                <option value="Department of Secondary and Elementary Education (DSEE)">
                  Department of Secondary and Elementary Education (DSEE)
                </option>
                <option value="Department of Social Sciences and Humanities (DSSH)">
                  Department of Social Sciences and Humanities (DSSH)
                </option>
                <option value="Integrated Developmental School (IDS)">
                  Integrated Developmental School (IDS)
                </option>
              </select>
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                Subjects Handled & Syllabus Files
              </p>
              <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={addSubjectRow}>
                Add Subject
              </Button>
            </div>

            {facSubjects.map((sub, idx) => (
              <div key={idx} className="rounded-xl border border-ink-200 bg-ink-50/40 p-3.5 space-y-2.5">
                <div className="flex items-start gap-2">
                  <div className="w-32 shrink-0">
                    <label className="mb-1 block text-[11px] font-semibold text-ink-600">Subject Code</label>
                    <Input
                      type="text"
                      value={sub.code}
                      onChange={(e) => handleSubjectChange(idx, 'code', e.target.value)}
                      placeholder="EDUC 101"
                      className="h-9 text-xs"
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

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex-1 min-w-[180px]">
                    <Input
                      type="text"
                      value={sub.syllabusFile ?? ''}
                      onChange={(e) => handleSubjectChange(idx, 'syllabusFile', e.target.value)}
                      placeholder="Syllabus file name (e.g. EDUC101_Syllabus_2026.pdf)"
                      className="h-8 text-xs"
                    />
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100">
                    <UploadCloud className="size-3.5" /> Upload Syllabus PDF
                    <input
                      type="file"
                      accept=".pdf"
                      className="sr-only"
                      onChange={(e) => handleSyllabusUpload(idx, e)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </form>
      </Dialog>
    </div>
  )
}
