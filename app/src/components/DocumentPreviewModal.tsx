import { formatSize } from './documents'
import {
  Check,
  Download,
  FileCheck2,
  FileText,
  Link2,
  Printer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
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
  locationLabelForStaff,
  revisionLabel,
} from '../content/language'
import type { Database, DocRecord } from '../data/types'
import { typeOf } from '../data/selectors'
import { formatDateTime } from '../lib/time'
import { openStoredFile } from '../lib/storedFiles'
import { cn } from './ui'
import { useSession } from '../app/session'
import {
  checkDocumentAccess,
  downloadPermittedDocument,
  generateNonPublicSecureLink,
} from '../lib/documentSecurity'
import { useToast } from './Toast'
import { SignatureList } from './DocumentSignatures'

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

  const docType = typeOf(db, doc)
  const requester = db.users.find((u) => u.id === doc.requesterId)
  const attachments = doc.attachments
  const signatures = (doc.signatures ?? []).filter((signature) => signature.revision === doc.revision)

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

  const { user } = useSession()
  const toast = useToast()
  const [isCopiedLink, setIsCopiedLink] = useState(false)

  const access = user ? checkDocumentAccess(user, doc) : { permitted: false, scope: 'denied' as const, scopeLabel: 'Restricted', reason: 'You must be signed in to access this document.' }
  const activeAttachment = attachments.find((a) => a.id === activeTab)
  const source = access.permitted ? activeAttachment?.fileUrl : undefined
  const [preview, setPreview] = useState<{ source: string; url?: string }>()
  useEffect(() => {
    if (!open || !source) return
    let active = true
    let release: (() => void) | undefined
    openStoredFile(source).then((file) => {
      if (active) {
        release = file.release
        setPreview({ source, url: file.url })
      } else {
        file.release()
      }
    }).catch(() => { if (active) setPreview({ source }) })
    return () => { active = false; release?.() }
  }, [open, source])
  const blobUrl = preview?.source === source ? preview?.url : undefined

  if (!open) return null
  if (!access.permitted) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
          <ShieldAlert className="mx-auto size-12 text-danger-500" />
          <h3 className="mt-3 text-lg font-bold text-ink-900">Restricted Confidential Document</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-600">
            {access.reason || 'Files attached to this document are access-controlled and restricted to the requester, College Secretary, and authorized reviewing officials.'}
          </p>
          <div className="mt-4 rounded-xl bg-ink-50 p-3 text-left text-xs text-ink-700">
            <span className="font-semibold block text-ink-900 mb-1">Institutional Access Rules:</span>
            <ul className="list-disc pl-4 space-y-0.5 text-2xs text-ink-600">
              <li>Document submitter / requester</li>
              <li>College Secretary & Records Administrators</li>
              <li>Designated reviewing offices in the routing chain</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
          >
            Close Preview
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  const handleDownload = async () => {
    if (!user) return
    const res = await downloadPermittedDocument(user, doc, activeAttachment, docType?.name)
    if (!res.success) {
      toast.error('Download Blocked', res.error || 'Access restricted.')
    } else {
      toast.info('Document Downloaded', `Exported verified institutional copy under ${access.scopeLabel}.`)
    }
  }

  const handleCopySecureLink = () => {
    if (!user) return
    try {
      const linkInfo = generateNonPublicSecureLink(doc, user, activeAttachment?.id)
      navigator.clipboard.writeText(linkInfo.url)
      setIsCopiedLink(true)
      setTimeout(() => setIsCopiedLink(false), 2500)
      toast.success(
        'Non-Public Secure Link Copied',
        `Authenticated token link created (valid for ${linkInfo.expiresInMinutes} mins). Only authorized accounts can view this record.`,
      )
    } catch (err: unknown) {
      toast.error('Unable to Generate Link', err instanceof Error ? err.message : 'Permission check failed.')
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
      className="document-preview-root fixed inset-0 z-[100] flex flex-col bg-brand-950/95 backdrop-blur-md text-white select-none animate-in fade-in duration-200"
    >
      {/* Top Header Control Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/15 bg-brand-900 px-4 sm:px-6 shadow-lg">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-white/15 text-brand-200 ring-1 ring-white/20">
            {controlNumber(doc)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-bold text-white max-w-[220px] sm:max-w-xs md:max-w-md">
                {doc.title}
              </h2>
              <span className="hidden items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 md:inline-flex">
                <ShieldCheck className="size-3 text-emerald-300" /> Non-Public Verified
              </span>
            </div>
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
            onClick={handleCopySecureLink}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 hover:bg-white/25 transition active:scale-95"
            title="Copy authenticated non-public link (15-min token)"
          >
            {isCopiedLink ? (
              <>
                <Check className="size-3.5 text-emerald-300" />
                <span className="text-emerald-200">Link Copied</span>
              </>
            ) : (
              <>
                <Link2 className="size-3.5 text-brand-200" />
                <span className="hidden sm:inline">Non-Public Link</span>
                <span className="sm:hidden">Link</span>
              </>
            )}
          </button>
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
            title="Download PDF Copy (Permission Verified)"
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
      <div className="document-print-area flex flex-1 justify-start overflow-auto bg-brand-950/80 p-4 sm:p-8 xl:justify-center">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="document-print-zoom relative my-auto"
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
          ) : activeAttachment ? (
            <p role="status" className="rounded-lg bg-white p-6 text-sm text-ink-700">{source && preview?.source !== source ? 'Loading attachment…' : 'The original attachment is unavailable for preview.'}</p>
          ) : (
            /* Routing summary */
            <div className="document-print-sheet relative min-h-[1123px] w-[794px] select-text rounded-sm bg-white p-12 font-serif text-slate-900 shadow-2xl">
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
                      : doc.status === 'rejected'
                      ? 'DISAPPROVED / REJECTED'
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
                      9023 Naawan, Misamis Oriental
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
                        {requester?.department ?? 'Unavailable'}
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
                  {doc.documentNumber && <p className="mb-2 wrap-anywhere text-xs text-slate-700">Document number {doc.documentNumber}</p>}
                  <p className="text-xs leading-relaxed italic text-slate-700 bg-slate-50/70 p-3.5 rounded border border-slate-200">
                    "{doc.description || 'Official document submitted for institutional processing, review, and administrative action through CESS DocuFlow.'}"
                  </p>
                </div>
              </div>
              <section className="mt-8 font-sans">
                <h3 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wider">Routing History</h3>
                {doc.history.length ? (
                  <ul className="mt-2 divide-y divide-slate-200 text-xs">
                    {doc.history.map((entry) => (
                      <li key={entry.id} className="py-2">
                        <span className="font-semibold capitalize">{entry.action.replaceAll("_", " ")}</span>
                        {" · "}{entry.actorName} · {formatDateTime(entry.at)}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-xs text-slate-600">No routing activity recorded.</p>}
              </section>

              {signatures.length > 0 && (
                <section className="relative mt-8 space-y-3 font-sans" aria-label="Signatures for this revision">
                  <h3 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wider">Electronic signatures</h3>
                  <SignatureList signatures={signatures} />
                </section>
              )}

              {/* Institutional Footer */}
              <div className="mt-12 pt-4 border-t border-slate-200 text-center font-sans text-[10px] text-slate-500">
                <p>
                  This routing summary is generated by <strong>CESS DocuFlow</strong>.
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
