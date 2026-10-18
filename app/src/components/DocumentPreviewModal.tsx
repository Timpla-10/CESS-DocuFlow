import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
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
import {
  controlNumber,
  downloadGeneratedPdf,
  locationLabelForStaff,
  revisionLabel,
} from '../content/language'
import type { Database, DocRecord } from '../data/types'
import { formatDateTime } from '../lib/time'
import { formatSize, sessionFiles } from './documents'
import { cn } from './ui'

export interface DocumentPreviewModalProps {
  open: boolean
  onClose: () => void
  doc: DocRecord
  db: Database
  initialAttachmentId?: string
}

export function DocumentPreviewModal({
  open,
  onClose,
  doc,
  db,
  initialAttachmentId,
}: DocumentPreviewModalProps) {
  const [zoom, setZoom] = useState(1.0)
  const [activeTab, setActiveTab] = useState<string>(
    initialAttachmentId || (doc.attachments[0]?.id ?? 'overview'),
  )

  const docType = db.documentTypes.find((t) => t.id === doc.typeId)
  const requester = db.users.find((u) => u.id === doc.requesterId)
  const attachments = doc.attachments

  // Sync initialAttachmentId when opened or changed
  useEffect(() => {
    if (initialAttachmentId) {
      setActiveTab(initialAttachmentId)
    } else if (doc.attachments.length > 0) {
      setActiveTab(doc.attachments[0].id)
    } else {
      setActiveTab('overview')
    }
  }, [initialAttachmentId, doc.attachments])

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

  const activeAttachment = attachments.find((a) => a.id === activeTab)
  const activeReq = docType?.requirements.find((r) => r.id === activeAttachment?.requirementId)
  const blobUrl = activeAttachment ? sessionFiles.get(activeAttachment.id) : undefined

  const handleDownload = () => {
    if (activeAttachment) {
      const fileName = activeAttachment.name
      downloadGeneratedPdf(fileName, `Audit Copy: ${fileName}`, [
        `Control Number: ${controlNumber(doc)}`,
        `Document Title: ${doc.title}`,
        `Document Type: ${docType?.name ?? doc.typeId}`,
        `Origin: ${doc.origin}`,
        `Requester: ${requester?.name ?? 'Unknown'} (${requester?.department ?? ''})`,
        `Attachment Category: ${activeAttachment.isSignedCopy ? 'Final Signed Release Copy (REQ-REL-4)' : (activeReq?.label ?? 'Supporting Attachment')}`,
        `Uploaded By: ${activeAttachment.uploadedBy}`,
        `Uploaded At: ${formatDateTime(activeAttachment.uploadedAt)}`,
        `Revision: ${revisionLabel(activeAttachment.revision)}`,
        '',
        'This official electronic copy was exported from CESS DocuFlow for review and institutional audit.',
      ])
    } else {
      downloadGeneratedPdf(
        `${controlNumber(doc)}_Overview.pdf`,
        `Official Routing Summary: ${doc.title}`,
        [
          `Control Number: ${controlNumber(doc)}`,
          `Document Title: ${doc.title}`,
          `Status: ${doc.status}`,
          `Requester: ${requester?.name ?? ''} (${requester?.department ?? ''})`,
          `Filing Date: ${formatDateTime(doc.submittedAt)}`,
        ],
      )
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Document Preview"
      className="fixed inset-0 z-[100] flex flex-col bg-brand-950/95 backdrop-blur-md text-white select-none animate-in fade-in duration-200"
    >
      {/* Top Header Control Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/15 bg-brand-900 px-4 sm:px-6 shadow-lg">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-white/15 text-brand-200 ring-1 ring-white/20">
            {controlNumber(doc)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-white max-w-[280px] sm:max-w-md">
              {doc.title}
            </h2>
            <p className="truncate text-[11px] text-white/80">
              {docType?.name ?? doc.typeId} · {revisionLabel(doc.revision)} · {doc.origin}
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
            <RotateCcw className="size-3.5 inline mr-1" />
            Fit
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="hidden items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 hover:bg-white/25 transition sm:inline-flex"
            title="Print Official Document Sheet"
          >
            <Printer className="size-3.5 text-brand-200" /> Print
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-white/20 hover:bg-brand-500 transition active:scale-95"
            title="Download PDF Copy"
          >
            <Download className="size-3.5" /> Download
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

      {/* Multi-Attachment Switcher Tabs */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/15 bg-brand-950/90 px-4 py-2 sm:px-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50 shrink-0 mr-1">
          Files ({attachments.length}):
        </span>

        {/* Overview Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            activeTab === 'overview'
              ? 'bg-brand-600 text-white shadow-sm ring-1 ring-brand-400'
              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
          )}
        >
          <FileText className="size-3.5" />
          <span>Institutional Summary Sheet</span>
        </button>

        {/* Attachment Tabs */}
        {attachments.map((a) => {
          const isSelected = activeTab === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveTab(a.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                isSelected
                  ? 'bg-brand-600 text-white shadow-sm ring-1 ring-brand-400 font-semibold'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              {a.isSignedCopy ? (
                <FileCheck2 className="size-3.5 text-emerald-300" />
              ) : (
                <FileText className="size-3.5 text-brand-200" />
              )}
              <span className="truncate max-w-[180px] sm:max-w-xs">{a.name}</span>
              <span className="text-[10px] opacity-75 font-mono">({formatSize(a.sizeKb)})</span>
              {a.isSignedCopy && (
                <span className="rounded bg-emerald-500/30 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
                  Signed
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Main Canvas Scroll Area */}
      <div className="flex-1 overflow-auto bg-brand-950/80 p-4 sm:p-8 flex justify-center">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="relative my-auto"
        >
          {/* Real uploaded blob rendering (if session contains active uploaded file) */}
          {blobUrl && activeAttachment ? (
            <div className="w-[794px] min-h-[960px] bg-white rounded-sm shadow-2xl p-6 text-slate-900 select-text">
              <div className="mb-4 flex items-center justify-between border-b pb-3 text-xs text-ink-500">
                <span className="font-semibold text-ink-900">{activeAttachment.name}</span>
                <span>Uploaded by {activeAttachment.uploadedBy}</span>
              </div>
              {activeAttachment.name.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <img
                  src={blobUrl}
                  alt={activeAttachment.name}
                  className="mx-auto max-h-[850px] w-auto object-contain rounded"
                />
              ) : (
                <iframe
                  src={`${blobUrl}#toolbar=0`}
                  title={activeAttachment.name}
                  className="size-full min-h-[860px] w-full rounded border-0"
                />
              )}
            </div>
          ) : (
            /* High-Fidelity Official Digital Document Sheet (A4 Institutional Layout) */
            <div className="w-[794px] min-h-[1123px] bg-white text-slate-900 shadow-2xl rounded-sm p-12 relative select-text font-serif">
              {/* Official Translucent Watermark */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.06] select-none"
                aria-hidden
              >
                <div className="rotate-[-35deg] text-center">
                  <p className="text-6xl font-black uppercase tracking-widest text-slate-950 font-sans">
                    {doc.archived
                      ? 'ARCHIVED RECORD'
                      : doc.status === 'released'
                      ? 'OFFICIALLY RELEASED'
                      : 'OFFICIAL DOCUMENT'}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-widest text-slate-800 font-sans">
                    CESS DOCUFLOW • MSU AT NAAWAN
                  </p>
                </div>
              </div>

              {/* Top Letterhead with Official University & College Seals */}
              <div className="relative border-b-2 border-slate-900 pb-5">
                <div className="flex items-center justify-between gap-4">
                  <img
                    src={msunLogo}
                    alt="Mindanao State University at Naawan Seal"
                    className="size-20 shrink-0 object-contain select-none"
                  />
                  <div className="flex-1 text-center font-sans">
                    <p className="text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                      Republic of the Philippines
                    </p>
                    <h1 className="text-base font-extrabold uppercase tracking-tight text-slate-950 leading-tight">
                      Mindanao State University at Naawan
                    </h1>
                    <p className="text-xs font-bold text-brand-900 uppercase tracking-wide">
                      College of Education and Social Sciences
                    </p>
                    <p className="text-[11px] text-slate-600">
                      9023 Naawan, Misamis Oriental · Telefax: (088) 222-5555
                    </p>
                    <p className="text-[10px] font-medium text-slate-500 italic mt-0.5">
                      DocuFlow Electronic Academic & Administrative Document Tracking System
                    </p>
                  </div>
                  <img
                    src={cessLogo}
                    alt="College of Education and Social Sciences Seal"
                    className="size-20 shrink-0 object-contain select-none"
                  />
                </div>
                <div className="mt-2 h-0.5 w-full bg-slate-900" />
              </div>

              {/* Document Identity Banner */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 border border-slate-200 rounded font-sans text-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Document Category & Type
                  </span>
                  <span className="text-sm font-black text-slate-950">
                    {docType?.name ?? doc.typeId}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Institutional Control Number
                  </span>
                  <span className="font-mono text-sm font-black text-brand-900">
                    {controlNumber(doc)}
                  </span>
                  <span className="ml-2 font-semibold text-slate-600">
                    ({revisionLabel(doc.revision)})
                  </span>
                </div>
              </div>

              {/* Metadata Matrix */}
              <div className="mt-6 font-sans">
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    <tr className="border-b border-slate-300">
                      <td className="w-1/4 bg-slate-100 p-2.5 font-bold text-slate-700">
                        Requester Name:
                      </td>
                      <td className="w-1/4 p-2.5 font-semibold text-slate-900">
                        {requester?.name ?? 'Unknown Requester'}
                      </td>
                      <td className="w-1/4 bg-slate-100 p-2.5 font-bold text-slate-700">
                        Date & Time Filed:
                      </td>
                      <td className="w-1/4 p-2.5 text-slate-900">
                        {formatDateTime(doc.submittedAt)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="bg-slate-100 p-2.5 font-bold text-slate-700">
                        Affiliation / Department:
                      </td>
                      <td className="p-2.5 text-slate-900">
                        {requester?.department ?? 'CESS Academic Faculty'}
                      </td>
                      <td className="bg-slate-100 p-2.5 font-bold text-slate-700">
                        Unit of Origin:
                      </td>
                      <td className="p-2.5 font-semibold text-slate-900">
                        {doc.origin === 'IDS'
                          ? 'Integrated Developmental School (MSUN-IDS)'
                          : 'College of Education and Social Sciences (CESS)'}
                      </td>
                    </tr>
                    <tr>
                      <td className="bg-slate-100 p-2.5 font-bold text-slate-700">
                        Current Status:
                      </td>
                      <td className="p-2.5 font-bold text-brand-800 uppercase">
                        {doc.status.replace(/_/g, ' ')}
                      </td>
                      <td className="bg-slate-100 p-2.5 font-bold text-slate-700">
                        Holding Office:
                      </td>
                      <td className="p-2.5 font-semibold text-slate-900">
                        {locationLabelForStaff(doc, db)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Section 1: Statement of Purpose */}
              <div className="mt-8">
                <h3 className="border-b border-slate-300 pb-1 text-xs font-black uppercase tracking-wider text-slate-900 font-sans">
                  I. Request Subject & Statement of Purpose
                </h3>
                <div className="mt-3 text-sm leading-relaxed text-slate-800">
                  <p className="font-bold text-base text-slate-950 mb-1">{doc.title}</p>
                  <p className="text-xs leading-relaxed italic text-slate-700 bg-slate-50/70 p-3.5 rounded border border-slate-200">
                    "{doc.description || 'Official document submitted for institutional processing, review, and administrative action through CESS DocuFlow.'}"
                  </p>
                </div>
              </div>

              {/* Section 2: Attachment Verification & File Details */}
              <div className="mt-8">
                <h3 className="border-b border-slate-300 pb-1 text-xs font-black uppercase tracking-wider text-slate-900 font-sans">
                  II. Form & Attachment Verification
                </h3>
                <div className="mt-3 rounded border border-slate-200 p-4 font-sans text-xs bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-950">
                        {activeAttachment ? activeAttachment.name : `${docType?.name} Electronic Filing`}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Classification:{' '}
                        <span className="font-semibold text-slate-900">
                          {activeAttachment?.isSignedCopy
                            ? 'Final Scanned Signed Copy (Official Release)'
                            : activeReq?.label ?? 'Required Form / Attachment'}
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        File Size:{' '}
                        {activeAttachment ? formatSize(activeAttachment.sizeKb) : 'Standard E-Form'} ·
                        Uploaded by: {activeAttachment?.uploadedBy ?? requester?.name ?? 'Requester'} ·{' '}
                        Revision {activeAttachment?.revision ?? doc.revision}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      Content Verified
                    </span>
                  </div>

                  {/* Simulated Form Field Details Tailored to Document Type */}
                  <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded bg-slate-50 p-2.5 border border-slate-200">
                      <span className="block font-bold text-[10px] uppercase text-slate-500">
                        Checklist Requirement
                      </span>
                      <span className="font-semibold text-slate-900">
                        {activeReq?.label ?? 'Mandatory Institutional Form'}
                      </span>
                    </div>
                    <div className="rounded bg-slate-50 p-2.5 border border-slate-200">
                      <span className="block font-bold text-[10px] uppercase text-slate-500">
                        Verification Authority
                      </span>
                      <span className="font-semibold text-slate-900">
                        College Secretary Office & Academic Dean
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Reviewing Offices Endorsement Stamps */}
              <div className="mt-8 font-sans">
                <h3 className="border-b border-slate-300 pb-1 text-xs font-black uppercase tracking-wider text-slate-900">
                  III. Official Action & Institutional Review Stamps
                </h3>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {/* Secretary Stamp */}
                  <div className="border-2 border-dashed border-slate-300 rounded p-3 text-center bg-slate-50/50">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      College Secretary
                    </span>
                    <span className="inline-flex items-center justify-center gap-1 mt-1 text-xs font-bold text-brand-800">
                      <CheckCircle2 className="size-3.5" />
                      <span>CHECKED COMPLETE</span>
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Verified by Secretary
                    </p>
                  </div>

                  {/* Department Chairperson / IDS Principal */}
                  <div className="border-2 border-dashed border-slate-300 rounded p-3 text-center bg-slate-50/50">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      {doc.origin === 'IDS' ? 'IDS Principal' : 'Department Chairperson'}
                    </span>
                    <span className="inline-flex items-center justify-center gap-1 mt-1 text-xs font-bold text-brand-800">
                      {doc.routeIndex >= 1 ? (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          <span>ENDORSED</span>
                        </>
                      ) : (
                        <span>PENDING ACTION</span>
                      )}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Academic Evaluation</p>
                  </div>

                  {/* Dean / Final Approver */}
                  <div className="border-2 border-dashed border-slate-300 rounded p-3 text-center bg-slate-50/50">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      College Dean / Executive
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center justify-center gap-1 mt-1 text-xs font-bold',
                        doc.status === 'released' || doc.status === 'ready'
                          ? 'text-brand-800'
                          : 'text-slate-600',
                      )}
                    >
                      {doc.status === 'released' || doc.status === 'ready' ? (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          <span>APPROVED</span>
                        </>
                      ) : (
                        <span>ROUTING IN PROGRESS</span>
                      )}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Final College Action</p>
                  </div>
                </div>
              </div>

              {/* Institutional Footer */}
              <div className="mt-12 pt-4 border-t border-slate-200 text-center font-sans text-[10px] text-slate-500">
                <p>
                  This official electronic document sheet is securely tracked by <strong>CESS DocuFlow</strong>.
                </p>
                <p className="mt-0.5">
                  Mindanao State University at Naawan · Official Document System · Republic of the Philippines
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
