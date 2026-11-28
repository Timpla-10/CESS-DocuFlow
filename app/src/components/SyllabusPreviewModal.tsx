import {
  CheckCircle2,
  Download,
  Printer,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import cessLogo from '../assets/cess-logo.png'
import msunLogo from '../assets/msun-logo.png'
import { downloadGeneratedPdf } from '../content/language'
import type { FacultyEntry, Subject, SyllabusTemplate } from '../data/types'

export interface SyllabusPreviewModalProps {
  open: boolean
  onClose: () => void
  faculty?: FacultyEntry
  subject?: Subject
  isTemplate?: boolean
  template?: SyllabusTemplate
}

export function SyllabusPreviewModal({
  open,
  onClose,
  faculty,
  subject,
  isTemplate = false,
  template,
}: SyllabusPreviewModalProps) {
  const [zoom, setZoom] = useState(1.0)

  // Keyboard navigation & Esc key handler
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setZoom((z) => Math.min(1.6, z + 0.15))
      }
      if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setZoom((z) => Math.max(0.65, z - 0.15))
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setZoom(1.0)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const title = isTemplate
    ? 'Official Course Syllabus Template'
    : `${subject?.code ?? 'Course'} — ${subject?.title ?? 'Syllabus'}`
  const fileName = isTemplate
    ? (template?.fileName || 'CESS_Official_Course_Syllabus_Template_2026.docx')
    : (subject?.syllabusFile || `${subject?.code?.replace(/\s+/g, '_')}_Syllabus.pdf`)

  const handleDownload = () => {
    if (isTemplate) {
      downloadGeneratedPdf(fileName, 'OFFICIAL CESS COURSE SYLLABUS TEMPLATE', [
        'MINDANAO STATE UNIVERSITY AT NAAWAN',
        'COLLEGE OF EDUCATION AND SOCIAL SCIENCES',
        'OFFICIAL COURSE SYLLABUS & TABLE OF SPECIFICATIONS (TOS) TEMPLATE',
        '',
        `Template File: ${fileName}`,
        `Managed by: ${template?.uploadedBy || 'College Secretary'}`,
        `Last Revision: ${template ? new Date(template.updatedAt).toLocaleDateString() : 'Current'}`,
        '',
        'INSTRUCTIONS FOR FACULTY MEMBERS:',
        '1. Prepare your syllabus in alignment with the CHED Memorandum Orders and MSU Naawan OBE standards.',
        '2. Ensure Program Educational Objectives (PEOs) and Course Learning Outcomes (CLOs) are explicitly stated.',
        '3. Include a weekly schedule of learning activities, formative assessments, and grading rubric.',
        '4. Upload your completed syllabus file in your faculty portal card under Academic Directory.',
      ])
    } else if (faculty && subject) {
      downloadGeneratedPdf(fileName, `COURSE SYLLABUS: ${subject.code} - ${subject.title}`, [
        `Course Code: ${subject.code}`,
        `Course Title: ${subject.title}`,
        `Instructor: ${faculty.name}`,
        `Department: ${faculty.department}`,
        `College: College of Education and Social Sciences, MSU at Naawan`,
        '',
        'COURSE OVERVIEW & SYLLABUS SUMMARY:',
        '1. Vision and Mission of Mindanao State University at Naawan',
        '2. Program Outcomes and Course Learning Outcomes (CLOs)',
        '3. Weekly Topic Schedule, Instructional Activities, and Assessment Tasks',
        '4. Grading System, Course Requirements, and Academic References',
      ])
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Syllabus Document Preview"
      className="fixed inset-0 z-[100] flex flex-col bg-brand-950/95 backdrop-blur-md text-white select-none animate-in fade-in duration-200"
    >
      {/* Top Header Control Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/15 bg-brand-900 px-4 sm:px-6 shadow-lg">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-white/15 text-brand-200 ring-1 ring-white/20 shrink-0">
            {isTemplate ? 'TEMPLATE' : (subject?.code || 'SYLLABUS')}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-white max-w-[260px] sm:max-w-md">
              {title}
            </h2>
            <p className="truncate text-[11px] text-white/80">
              {isTemplate
                ? `Uploaded by ${template?.uploadedBy || 'College Secretary'}`
                : `${faculty?.name ?? ''} · ${faculty?.department ?? ''}`}
            </p>
          </div>
        </div>

        {/* Center: Zoom Controls */}
        <div className="hidden items-center gap-1 rounded-xl bg-white/15 px-2.5 py-1 ring-1 ring-white/20 sm:flex">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))}
            className="rounded p-1 text-white hover:bg-white/20 transition-colors"
            title="Zoom Out (Ctrl -)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="min-w-[48px] text-center text-xs font-mono font-bold text-white">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))}
            className="rounded p-1 text-white hover:bg-white/20 transition-colors"
            title="Zoom In (Ctrl +)"
            aria-label="Zoom In"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1.0)}
            className="ml-1 rounded px-2 py-0.5 text-[11px] font-semibold text-white/90 hover:bg-white/20 hover:text-white transition-colors"
            title="Reset Zoom (Ctrl 0)"
          >
            <RotateCcw className="size-3 inline mr-1" />
            Fit
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="hidden items-center gap-1.5 rounded-lg border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 sm:inline-flex"
            title="Print Syllabus"
          >
            <Printer className="size-3.5" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-brand-500 active:scale-95"
            title="Download Document Copy"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Download Copy</span>
          </button>

          <div className="h-5 w-px bg-white/20 mx-1 hidden sm:block" aria-hidden="true" />

          {/* Prominent High-Contrast Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold text-white shadow-xs ring-1 ring-white/30 hover:bg-danger-600 hover:ring-danger-500 hover:text-white transition-all active:scale-95"
            title="Close Preview (Esc)"
            aria-label="Close Preview"
          >
            <X className="size-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 overflow-auto bg-brand-950/80 p-4 sm:p-8 flex justify-center items-start">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="w-full max-w-4xl"
        >
          {/* Paper Sheet Document Canvas */}
          <div className="min-h-[1050px] w-full rounded-sm bg-white p-8 sm:p-14 text-slate-900 shadow-2xl ring-1 ring-black/10 select-text">
            {/* University Letterhead */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-5">
              <img
                src={msunLogo}
                alt="MSU Naawan Seal"
                className="size-16 sm:size-20 object-contain shrink-0"
              />

              <div className="text-center px-4 font-serif">
                <p className="text-[11px] font-bold tracking-wider uppercase text-slate-600">
                  Republic of the Philippines
                </p>
                <h1 className="text-sm sm:text-base font-black tracking-wide text-slate-950 uppercase">
                  Mindanao State University at Naawan
                </h1>
                <p className="text-xs font-medium text-slate-600">
                  9023 Naawan, Misamis Oriental, Philippines · www.msunaawan.edu.ph
                </p>
                <p className="mt-1 text-xs font-bold tracking-wide uppercase text-brand-900">
                  College of Education and Social Sciences (CESS)
                </p>
                <p className="text-[11px] font-semibold text-slate-700">
                  {isTemplate ? 'Curriculum & Instruction Committee' : (faculty?.department || 'Academic Department')}
                </p>
              </div>

              <img
                src={cessLogo}
                alt="CESS College Seal"
                className="size-16 sm:size-20 object-contain shrink-0"
              />
            </div>

            {/* Document Title Banner */}
            <div className="mt-6 text-center">
              <span className="inline-block rounded-md bg-brand-50 px-3 py-1 font-mono text-xs font-black uppercase tracking-wider text-brand-900 ring-1 ring-inset ring-brand-200">
                {isTemplate ? 'Official Standard Template' : 'Outcome-Based Education (OBE) Course Syllabus'}
              </span>
              <h2 className="mt-2 text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 font-serif">
                {isTemplate ? 'Official Course Syllabus & Learning Plan Template' : `${subject?.code}: ${subject?.title}`}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Academic Year 2025–2026 · College of Education and Social Sciences
              </p>
            </div>

            {/* Course Metadata Grid */}
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/70 p-4 font-sans text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Course Code
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {isTemplate ? 'TEMPLATE-CESS' : (subject?.code || '—')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Credit Units
                  </span>
                  <span className="font-semibold text-slate-900">
                    3.0 Units (Lecture)
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Instructor of Record
                  </span>
                  <span className="font-semibold text-slate-900">
                    {isTemplate ? 'All Faculty Members' : (faculty?.name || '—')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    File Status
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-brand-800">
                    <CheckCircle2 className="size-3" />
                    <span>Verified on File</span>
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                <span>
                  <strong>Attached File:</strong> {fileName}
                </span>
                <span>
                  <strong>Academic Office:</strong> College Secretary & Curriculum Repository
                </span>
              </div>
            </div>

            {/* Document Content Sections */}
            <div className="mt-8 space-y-6 text-xs text-slate-800 leading-relaxed font-serif">
              {/* Section I */}
              <div>
                <h3 className="border-b border-slate-300 pb-1 text-xs font-black uppercase tracking-wider text-slate-900">
                  I. Course Description & Alignment with University VMGO
                </h3>
                <p className="mt-2 text-justify text-slate-700">
                  This course adheres strictly to the CHED Memorandum Orders and the Outcome-Based Education (OBE)
                  framework of Mindanao State University at Naawan. It is formulated to empower students with foundational
                  and advanced competencies, critical inquiry, empirical assessment, and ethical responsibility in accordance
                  with the institutional vision, mission, and college goals of the College of Education and Social Sciences.
                </p>
              </div>

              {/* Section II */}
              <div>
                <h3 className="border-b border-slate-300 pb-1 text-xs font-black uppercase tracking-wider text-slate-900">
                  II. Course Learning Outcomes (CLOs)
                </h3>
                <div className="mt-2 space-y-2 text-slate-700 font-sans">
                  <div className="flex items-start gap-2 rounded bg-slate-50 p-2.5 ring-1 ring-slate-200">
                    <span className="font-bold text-brand-900 shrink-0">CLO 1:</span>
                    <span>Demonstrate mastery of core principles, pedagogical approaches, and theoretical paradigms in the field of study.</span>
                  </div>
                  <div className="flex items-start gap-2 rounded bg-slate-50 p-2.5 ring-1 ring-slate-200">
                    <span className="font-bold text-brand-900 shrink-0">CLO 2:</span>
                    <span>Synthesize, analyze, and apply empirical data and academic literature to solve multifaceted pedagogical and community inquiries.</span>
                  </div>
                  <div className="flex items-start gap-2 rounded bg-slate-50 p-2.5 ring-1 ring-slate-200">
                    <span className="font-bold text-brand-900 shrink-0">CLO 3:</span>
                    <span>Design authentic instructional modules, research syntheses, and evidence-based assessment matrices aligning with CHED quality guidelines.</span>
                  </div>
                </div>
              </div>

              {/* Section III: Syllabus Coverage Outline */}
              <div>
                <h3 className="border-b border-slate-300 pb-1 text-xs font-black uppercase tracking-wider text-slate-900">
                  III. Weekly Plan, Course Outline & Assessment Tasks
                </h3>
                <div className="mt-3 overflow-hidden rounded border border-slate-300 font-sans text-[11px]">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 font-bold text-slate-900 border-b border-slate-300">
                      <tr>
                        <th className="p-2.5 w-24">Week</th>
                        <th className="p-2.5">Topic / Module Focus</th>
                        <th className="p-2.5 w-40">Teaching Methodology</th>
                        <th className="p-2.5 w-36">Assessment Deliverables</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      <tr>
                        <td className="p-2.5 font-bold">Weeks 1–3</td>
                        <td className="p-2.5">Institutional VMGO, Course Orientation, Core Foundations</td>
                        <td className="p-2.5">Interactive Lecture, Group Discussion</td>
                        <td className="p-2.5">Diagnostic Quiz & Formative Reflection</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold">Weeks 4–8</td>
                        <td className="p-2.5">Deep Dive Modules: Primary Literature & Case Analyses</td>
                        <td className="p-2.5">Inquiry-based Seminar, Collaborative Workshop</td>
                        <td className="p-2.5">Case Analysis Paper & Recitation</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-brand-900">Week 9</td>
                        <td className="p-2.5 font-bold text-brand-900">Midterm Comprehensive Examination</td>
                        <td className="p-2.5 font-bold text-brand-900">Written / Practical Exam</td>
                        <td className="p-2.5 font-bold text-brand-900">Standardized Midterm Assessment</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold">Weeks 10–17</td>
                        <td className="p-2.5">Advanced Application, Independent Research & Synthesis</td>
                        <td className="p-2.5">Peer Review Colloquium, Field Application</td>
                        <td className="p-2.5">Term Research Project & Presentation</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-brand-900">Week 18</td>
                        <td className="p-2.5 font-bold text-brand-900">Final Term Examination & Portfolio Submission</td>
                        <td className="p-2.5 font-bold text-brand-900">Summative Evaluation</td>
                        <td className="p-2.5 font-bold text-brand-900">Final Examination & Course Portfolio</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section IV: Grading Criteria */}
              <div>
                <h3 className="border-b border-slate-300 pb-1 text-xs font-black uppercase tracking-wider text-slate-900">
                  IV. Grading System & Evaluation Weights
                </h3>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 font-sans text-center">
                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                    <p className="text-base font-black text-brand-900">40%</p>
                    <p className="text-[10px] uppercase font-bold text-slate-600">Major Examinations</p>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                    <p className="text-base font-black text-brand-900">25%</p>
                    <p className="text-[10px] uppercase font-bold text-slate-600">Quizzes & Exercises</p>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                    <p className="text-base font-black text-brand-900">25%</p>
                    <p className="text-[10px] uppercase font-bold text-slate-600">Projects & Reports</p>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                    <p className="text-base font-black text-brand-900">10%</p>
                    <p className="text-[10px] uppercase font-bold text-slate-600">Class Participation</p>
                  </div>
                </div>
              </div>

              {/* Section V: Administrative Endorsement & Review Stamps */}
              <div className="mt-8 pt-4 border-t-2 border-slate-200 font-sans">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded border border-slate-200 p-3 bg-slate-50/50">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Prepared by</p>
                    <p className="mt-2 font-bold text-slate-900">{isTemplate ? 'Curriculum Committee' : (faculty?.name || 'Assigned Faculty')}</p>
                    <p className="text-[10px] text-slate-500">Instructor of Record</p>
                  </div>
                  <div className="rounded border border-slate-200 p-3 bg-slate-50/50">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Department Review</p>
                    <p className="mt-2 font-bold text-brand-800">
                      <CheckCircle2 className="size-3.5 inline mr-1" />
                      Curriculum Aligned
                    </p>
                    <p className="text-[10px] text-slate-500">Department Chairperson</p>
                  </div>
                  <div className="rounded border border-slate-200 p-3 bg-slate-50/50">
                    <p className="text-[10px] uppercase font-bold text-slate-500">College Verification</p>
                    <p className="mt-2 font-bold text-brand-800">
                      <CheckCircle2 className="size-3.5 inline mr-1" />
                      Recorded on File
                    </p>
                    <p className="text-[10px] text-slate-500">Office of the College Secretary</p>
                  </div>
                </div>
              </div>

              {/* Institutional Footer */}
              <div className="mt-10 pt-4 border-t border-slate-200 text-center font-sans text-[10px] text-slate-500">
                <p>
                  This official electronic course syllabus is maintained and tracked by <strong>CESS DocuFlow</strong>.
                  College of Education and Social Sciences · Mindanao State University at Naawan.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
