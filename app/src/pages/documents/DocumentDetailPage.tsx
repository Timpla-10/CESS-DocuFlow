import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileText,
  PackageCheck,
  Paperclip,
  RotateCcw,
  Send,
  UploadCloud,
  UserCheck,
  X,
  XCircle,
  Lock,
} from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import {
  AttachmentList,
  DelayedBadge,
  DocumentPreviewModal,
  RouteProgress,
  StatusBadge,
  WaitingTime,
  formatSize,
  sessionFiles,
} from '../../components/documents'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  DefinitionList,
  Segmented,
} from '../../components/ui'
import {
  OFFICE_LABEL,
  ROLE_OFFICE,
  controlNumber,
  externalOfficeLabel,
  isRequester,
  locationLabel,
  locationLabelForStaff,
  requesterMessage,
  revisionLabel,
} from '../../content/language'
import { ACCEPTED_EXT, MAX_FILE_MB, reviewOptions, type NewFile, type ReviewKind } from '../../data/engine'
import { canView, isDelayed, typeOf, userById } from '../../data/selectors'
import { api, useDb } from '../../data/store'
import type { ExternalOfficeId } from '../../data/types'
import { formatDate, formatDateTime, plural } from '../../lib/time'

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const navigate = useNavigate()

  const doc = db.documents.find((d) => d.id === id)

  // Sub-dialog states
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | undefined>()
  const [isResubmitOpen, setIsResubmitOpen] = useState(false)
  const [isCheckOpen, setIsCheckOpen] = useState(false)
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [isExternalOpen, setIsExternalOpen] = useState(false)
  const [isExternalReturnOpen, setIsExternalReturnOpen] = useState(false)
  const [isReleaseOpen, setIsReleaseOpen] = useState(false)

  // Resubmit form state
  const [resubmitTitle, setResubmitTitle] = useState('')
  const [resubmitDesc, setResubmitDesc] = useState('')
  const [resubmitNote, setResubmitNote] = useState('')
  const [resubmitFiles, setResubmitFiles] = useState<{ name: string; sizeKb: number; fileObj?: File }[]>([])
  const [resubmitBusy, setResubmitBusy] = useState(false)
  const [resubmitErrors, setResubmitErrors] = useState<{ title?: string; general?: string }>({})

  // Secretary Content Verification form state (REQ-REQT-4, REQ-REQT-5)
  const [checkDecision, setCheckDecision] = useState<'complete' | 'return' | 'reject'>('complete')
  const [flaggedReqIds, setFlaggedReqIds] = useState<string[]>([])
  const [checkReasons, setCheckReasons] = useState('')
  const [checkBusy, setCheckBusy] = useState(false)
  const [checkErrors, setCheckErrors] = useState<{ reasons?: string }>({})

  // Review Office form state
  const [reviewKind, setReviewKind] = useState<ReviewKind>('endorse')
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewErrors, setReviewErrors] = useState<{ remarks?: string }>({})

  // External Office form state
  const [externalOffice, setExternalOffice] = useState<ExternalOfficeId>(db.externalOffices[0]?.id ?? 'hrmo')
  const [externalHandedBy, setExternalHandedBy] = useState(user.name)
  const [externalRemarks, setExternalRemarks] = useState('')
  const [externalBusy, setExternalBusy] = useState(false)
  const [externalErrors, setExternalErrors] = useState<{ handedBy?: string }>({})

  // External Return form state
  const [extReturnRemarks, setExtReturnRemarks] = useState('')
  const [extReturnBusy, setExtReturnBusy] = useState(false)

  // Release form state (REQ-REL-2, REQ-REL-4)
  const [releaseReceivedBy, setReleaseReceivedBy] = useState('')
  const [releaseSignedFile, setReleaseSignedFile] = useState<{ name: string; sizeKb: number; fileObj?: File } | null>(null)
  const [releaseBusy, setReleaseBusy] = useState(false)
  const [releaseErrors, setReleaseErrors] = useState<{ receivedBy?: string }>({})

  if (!doc || !canView(user, doc)) {
    return (
      <Card className="mx-auto mt-8 max-w-lg p-8 text-center">
        <AlertCircle className="mx-auto size-10 text-danger-500" />
        <h2 className="mt-4 text-lg font-bold text-ink-900">Document Not Found</h2>
        <p className="mt-2 text-sm text-ink-600">
          This document could not be found, or you do not have permission to view it.
        </p>
        <div className="mt-6">
          <ButtonLink to="/app" variant="secondary">
            Return to Dashboard
          </ButtonLink>
        </div>
      </Card>
    )
  }

  const docType = typeOf(db, doc)
  const requester = userById(db, doc.requesterId)
  const delayed = isDelayed(db, doc)
  const isDocRequester = doc.requesterId === user.id
  const isReqUser = isRequester(user.role) || isDocRequester
  const userAudience: 'requester' | 'staff' = isDocRequester ? 'requester' : isReqUser ? 'requester' : 'staff'
  const message = requesterMessage(doc, delayed, db)

  // Action authorizations
  const canResubmit = isDocRequester && doc.status === 'returned'
  const canSecretaryCheck = user.role === 'secretary' && doc.status === 'submitted'
  const currentStep = doc.route[doc.routeIndex]
  const userOffice = ROLE_OFFICE[user.role]

  const allowedReviewOpts =
    userOffice && !isDocRequester ? reviewOptions(db, doc, userOffice) : []
  const isReviewerForDoc = allowedReviewOpts.length > 0

  const canSecretaryFinalize =
    user.role === 'secretary' &&
    doc.status === 'with_office' &&
    currentStep?.stage === 'final'

  const canSecretaryRecordExternalReturn =
    user.role === 'secretary' && doc.status === 'with_external'

  const canSecretaryRelease = user.role === 'secretary' && doc.status === 'ready'

  const currentAttachments = doc.attachments.filter((a) => a.revision === doc.revision)

  // --- Handlers ---

  const handleOpenResubmit = () => {
    if (!canResubmit) return
    setResubmitTitle(doc.title)
    setResubmitDesc(doc.description)
    setResubmitNote('')
    setResubmitFiles([])
    setResubmitErrors({})
    setIsResubmitOpen(true)
  }

  const handleOpenCheck = () => {
    setCheckDecision('complete')
    setFlaggedReqIds([])
    setCheckReasons('')
    setCheckErrors({})
    setIsCheckOpen(true)
  }

  const handleOpenReview = (initialKind?: ReviewKind) => {
    const defaultKind =
      initialKind && allowedReviewOpts.some((o) => o.kind === initialKind)
        ? initialKind
        : allowedReviewOpts[0]?.kind ?? 'endorse'
    setReviewKind(defaultKind)
    setReviewRemarks('')
    setReviewErrors({})
    setIsReviewOpen(true)
  }

  const handleOpenRelease = () => {
    setReleaseReceivedBy(requester?.name ?? '')
    setReleaseSignedFile(null)
    setReleaseErrors({})
    setIsReleaseOpen(true)
  }

  const handleResubmitFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]
    const sizeKb = Math.round(file.size / 1024)
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
    if (!ACCEPTED_EXT.includes(ext)) {
      toast.error('Unsupported File Type', 'Please attach a PDF, JPG, or PNG file.')
      return
    }
    if (sizeKb > MAX_FILE_MB * 1024) {
      toast.error('File Too Large', 'Please upload a file smaller than 10 MB.')
      return
    }
    setResubmitFiles((prev) => [...prev, { name: file.name, sizeKb, fileObj: file }])
    setResubmitErrors((prev) => ({ ...prev, general: undefined }))
    e.target.value = ''
  }

  const handleSignedFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]
    const sizeKb = Math.round(file.size / 1024)
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
    if (!ACCEPTED_EXT.includes(ext)) {
      toast.error('Unsupported File Type', 'Please attach a PDF, JPG, or PNG scan of the signed document.')
      return
    }
    if (sizeKb > MAX_FILE_MB * 1024) {
      toast.error('File Too Large', 'Please upload a file smaller than 10 MB.')
      return
    }
    setReleaseSignedFile({ name: file.name, sizeKb, fileObj: file })
    e.target.value = ''
  }

  const handleResubmitSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setResubmitErrors({})
    const errs: { title?: string; general?: string } = {}
    if (!resubmitTitle.trim()) {
      errs.title = 'Please enter a document title.'
    }
    if (resubmitFiles.length === 0 && !resubmitNote.trim()) {
      errs.general = 'Please attach at least one corrected file or explain what you revised.'
    }
    if (Object.keys(errs).length > 0) {
      setResubmitErrors(errs)
      toast.error('Incomplete Resubmission', 'Please resolve the highlighted issues before submitting.')
      return
    }
    setResubmitBusy(true)
    try {
      const payloadFiles: NewFile[] = resubmitFiles.map((f) => ({
        name: f.name,
        sizeKb: f.sizeKb,
      }))
      const updated = await api.resubmit(user, doc.id, {
        title: resubmitTitle.trim(),
        description: resubmitDesc.trim(),
        note: resubmitNote.trim(),
        files: payloadFiles,
      })
      // Save object URLs
      resubmitFiles.forEach((f, idx) => {
        const attach = updated.attachments[updated.attachments.length - resubmitFiles.length + idx]
        if (f.fileObj && attach) {
          sessionFiles.set(attach.id, URL.createObjectURL(f.fileObj))
        }
      })
      toast.success(
        'Document Resubmitted',
        'Your document has been resubmitted under the same Control Number with a new Revision Number.',
      )
      setIsResubmitOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Resubmission failed.'
      toast.error('Unable to Resubmit', msg)
    } finally {
      setResubmitBusy(false)
    }
  }

  const handleCheckRequirements = async (e: FormEvent) => {
    e.preventDefault()
    setCheckErrors({})
    if (checkDecision === 'return' && !checkReasons.trim()) {
      setCheckErrors({ reasons: 'Please enter the specific reasons for returning this submission.' })
      toast.error('Reason Required', 'Please provide feedback explaining what needs correction.')
      return
    }
    if (checkDecision === 'reject' && !checkReasons.trim()) {
      setCheckErrors({ reasons: 'Please enter the reasons for disapproving/rejecting this submission.' })
      toast.error('Rejection Reason Required', 'Please provide feedback explaining why the document is disapproved.')
      return
    }
    setCheckBusy(true)
    try {
      await api.checkRequirements(user, doc.id, {
        decision: checkDecision,
        missing: checkDecision === 'return' ? flaggedReqIds : [],
        reasons: checkReasons,
      })
      toast.success(
        checkDecision === 'return'
          ? 'Returned for Content Correction'
          : checkDecision === 'reject'
          ? 'Document Disapproved / Rejected'
          : 'Content Verified & Routed',
        checkDecision === 'return'
          ? 'The submission was returned to the requester with your content verification feedback.'
          : checkDecision === 'reject'
          ? 'The submission has been disapproved and rejected. The requester has been notified.'
          : 'Content verification recorded. The document has been logged and routed automatically.',
      )
      setIsCheckOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Content verification failed.'
      toast.error('Verification Unsuccessful', msg)
    } finally {
      setCheckBusy(false)
    }
  }

  const handleReviewSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setReviewErrors({})
    if (reviewKind === 'return' && !reviewRemarks.trim()) {
      setReviewErrors({ remarks: 'Please enter correction remarks explaining what needs to be changed.' })
      toast.error('Remarks Required', 'Please provide correction feedback before returning.')
      return
    }
    if (reviewKind === 'reject' && !reviewRemarks.trim()) {
      setReviewErrors({ remarks: 'Please state the reason for disapproving/rejecting this document.' })
      toast.error('Reason Required', 'Please provide the disapproval reason.')
      return
    }
    setReviewBusy(true)
    try {
      await api.recordReview(user, doc.id, {
        kind: reviewKind,
        remarks: reviewRemarks,
      })
      toast.success(
        reviewKind === 'return'
          ? 'Document Returned for Correction'
          : reviewKind === 'reject'
          ? 'Document Disapproved / Rejected'
          : reviewKind === 'approve'
          ? 'Document Approved'
          : 'Document Endorsed',
        reviewKind === 'return'
          ? 'The requester was notified with your correction remarks.'
          : reviewKind === 'reject'
          ? 'The document has been officially disapproved. The requester was notified.'
          : 'Your decision has been recorded and the document routed accordingly.',
      )
      setIsReviewOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Review action failed.'
      toast.error('Action Failed', msg)
    } finally {
      setReviewBusy(false)
    }
  }

  const handleSendExternal = async (e: FormEvent) => {
    e.preventDefault()
    setExternalErrors({})
    if (!externalHandedBy.trim()) {
      setExternalErrors({ handedBy: 'Please specify the name of the person who handed over the document.' })
      toast.error('Hand-off Person Required', 'Please state who is delivering the document.')
      return
    }
    setExternalBusy(true)
    try {
      await api.sendToExternal(user, doc.id, {
        office: externalOffice,
        handedBy: externalHandedBy,
        remarks: externalRemarks,
      })
      toast.success('Office Transfer Recorded', `Document recorded as sent to ${externalOfficeLabel(externalOffice, db)}.`)
      setIsExternalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed.'
      toast.error('Transfer Failed', msg)
    } finally {
      setExternalBusy(false)
    }
  }

  const handleExternalReturn = async (e: FormEvent) => {
    e.preventDefault()
    setExtReturnBusy(true)
    try {
      await api.recordExternalReturn(user, doc.id, {
        remarks: extReturnRemarks,
      })
      toast.success('Return Recorded', 'Document return recorded. It is now back with the College Secretary.')
      setIsExternalReturnOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Return failed.'
      toast.error('Return Failed', msg)
    } finally {
      setExtReturnBusy(false)
    }
  }

  const handleMarkReady = async () => {
    try {
      await api.markReady(user, doc.id)
      toast.success(
        'Marked Ready for Release',
        'Requester has been notified that their signed document is ready for collection.',
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed.'
      toast.error('Action Failed', msg)
    }
  }

  const handleReleaseSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setReleaseErrors({})
    if (!releaseReceivedBy.trim()) {
      setReleaseErrors({ receivedBy: 'Please enter the name of the person who received the document.' })
      toast.error('Recipient Name Required', 'Please enter who collected the document.')
      return
    }
    setReleaseBusy(true)
    try {
      const updated = await api.recordRelease(user, doc.id, {
        receivedBy: releaseReceivedBy,
        signedFile: releaseSignedFile
          ? { name: releaseSignedFile.name, sizeKb: releaseSignedFile.sizeKb }
          : undefined,
      })
      if (releaseSignedFile?.fileObj) {
        const lastAtt = updated.attachments[updated.attachments.length - 1]
        if (lastAtt) {
          sessionFiles.set(lastAtt.id, URL.createObjectURL(releaseSignedFile.fileObj))
        }
      }
      toast.success('Document Released & Archived', 'Document release recorded and moved to the read-only archive.')
      setIsReleaseOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Release failed.'
      toast.error('Release Failed', msg)
    } finally {
      setReleaseBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to Documents
        </button>
        <span className="text-xs text-ink-500 font-mono">Control Ref: {controlNumber(doc)}</span>
      </div>

      {/* Main Document Summary Card */}
      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 bg-brand-50/50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand" dot={false}>
                  {docType?.name}
                </Badge>
                <Badge tone="neutral" dot={false}>
                  {revisionLabel(doc.revision)}
                </Badge>
                {doc.encodedBySecretary && (
                  <Badge tone="brand" dot={false}>
                    Encoded by Secretary (Walk-in)
                  </Badge>
                )}
                {doc.archived && (
                  <Badge tone="neutral" dot={false}>
                    Archived (Read-Only)
                  </Badge>
                )}
                {isReqUser && doc.requesterId === user.id && doc.status !== 'returned' && doc.status !== 'rejected' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-800 ring-1 ring-inset ring-ink-200">
                    <Lock className="size-3 text-ink-600" aria-hidden />
                    Locked during routing
                  </span>
                )}
                {isReqUser && doc.requesterId === user.id && doc.status === 'returned' && (
                  <Badge tone="danger" dot={false} className="gap-1 font-bold">
                    <RotateCcw className="size-3" aria-hidden />
                    Unlocked for Revision
                  </Badge>
                )}
                {doc.status === 'rejected' && (
                  <Badge tone="danger" dot={false} className="gap-1 font-bold">
                    <AlertCircle className="size-3" aria-hidden />
                    Disapproved / Closed
                  </Badge>
                )}
              </div>

              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">
                {doc.title}
              </h1>

              {doc.description && (
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{doc.description}</p>
              )}
            </div>

            {/* Status indicators */}
            <div className="flex flex-col items-end gap-2">
              <StatusBadge doc={doc} audience={userAudience} db={db} />
              {delayed && <DelayedBadge audience={userAudience} />}
              <WaitingTime doc={doc} />
            </div>
          </div>
        </div>

        {/* Human-Centered Guidance Callout */}
        <div className="p-6">
          <Callout
            tone={
              doc.status === 'returned' || doc.status === 'rejected'
                ? 'danger'
                : doc.status === 'ready'
                ? 'success'
                : delayed
                ? 'warning'
                : 'brand'
            }
            title={message.title}
          >
            <p>{message.body}</p>

            {/* Specific return info details (REQ-MON-3) */}
            {doc.status === 'returned' && doc.returnInfo && (
              <div className="mt-3 rounded-lg bg-white p-3.5 ring-1 ring-danger-200">
                <p className="text-xs font-bold uppercase tracking-wider text-danger-700">
                  Comments from {doc.returnInfo.office} ({doc.returnInfo.by})
                </p>
                <p className="mt-1 text-sm font-medium text-ink-900">{doc.returnInfo.reasons}</p>
                {doc.returnInfo.missing.length > 0 && (
                  <div className="mt-2 text-xs text-danger-800">
                    <span className="font-semibold">Flagged forms/attachments: </span>
                    {doc.returnInfo.missing
                      .map((mid) => docType?.requirements.find((r) => r.id === mid)?.label ?? mid)
                      .join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Specific rejection info details */}
            {doc.status === 'rejected' && doc.rejectionInfo && (
              <div className="mt-3 rounded-lg bg-white p-4 ring-2 ring-danger-300 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-danger-100 pb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-danger-700 flex items-center gap-1.5">
                    <AlertCircle className="size-3.5 text-danger-600" />
                    Official Disapproval from {doc.rejectionInfo.office}
                  </p>
                  <span className="text-2xs font-semibold text-ink-500">
                    Recorded {formatDateTime(doc.rejectionInfo.at)} by {doc.rejectionInfo.by}
                  </span>
                </div>
                <div className="mt-2.5">
                  <p className="text-xs font-bold text-ink-800">Reason for Rejection / Disapproval:</p>
                  <p className="mt-1 text-sm font-medium text-ink-950 whitespace-pre-wrap">{doc.rejectionInfo.reasons}</p>
                </div>
                <div className="mt-3 rounded-md bg-danger-50 px-3 py-2 text-2xs text-danger-800 border border-danger-200">
                  <strong>Notice:</strong> This document request has been closed and disapproved. Unlike returned requests, rejected documents cannot be resubmitted. If you have questions or require reconsideration, please visit the {doc.rejectionInfo.office} or the College Secretary in person.
                </div>
              </div>
            )}
          </Callout>

          {/* Strict Edit Lock Notice for Requesters (REQ-SUB-LOCK) */}
          {isReqUser && doc.requesterId === user.id && doc.status !== 'returned' && doc.status !== 'rejected' && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-ink-200 bg-ink-50/80 p-4 shadow-2xs">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-200 text-ink-800">
                <Lock className="size-4.5 text-ink-700" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-ink-950">Submission Locked from Editing</h4>
                  <span className="inline-flex items-center gap-1 rounded-md bg-ink-200 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-ink-800">
                    Read-Only In Routing
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  Documents in routing cannot be edited or altered. Modifications, replacement of attachments, and resubmissions are strictly permitted only if a reviewing office returns the document for revision.
                </p>
              </div>
            </div>
          )}

          {/* Automatic Completeness & Content Verification Status Strip (REQ-REQT-3, REQ-REQT-4) */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl bg-success-50/50 p-3.5 ring-1 ring-inset ring-success-100">
              <FileCheck2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden />
              <div className="text-xs">
                <p className="font-bold text-ink-900">Completeness Check: Passed</p>
                <p className="mt-0.5 text-ink-600">
                  All required forms are attached ({currentAttachments.length} file{currentAttachments.length === 1 ? '' : 's'}).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl bg-ink-50/70 p-3.5 ring-1 ring-inset ring-ink-100">
              <CheckCircle2
                className={`mt-0.5 size-4 shrink-0 ${
                  doc.contentVerification?.result === 'complete'
                    ? 'text-success-600'
                    : doc.contentVerification?.result === 'returned'
                    ? 'text-danger-600'
                    : 'text-brand-600'
                }`}
                aria-hidden
              />
              <div className="text-xs">
                <p className="font-bold text-ink-900">
                  Secretary Verification:{' '}
                  {doc.contentVerification
                    ? doc.contentVerification.result === 'complete'
                      ? 'Verified Complete'
                      : 'Returned for Issues'
                    : 'Pending Verification'}
                </p>
                <p className="mt-0.5 text-ink-600">
                  {doc.contentVerification
                    ? `${doc.contentVerification.verifiedBy} · ${formatDateTime(doc.contentVerification.at)}${
                        doc.contentVerification.remarks ? ` — “${doc.contentVerification.remarks}”` : ''
                      }`
                    : 'Awaiting content check before routing.'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar for Authorized Roles */}
          {(canResubmit ||
            canSecretaryCheck ||
            isReviewerForDoc ||
            canSecretaryFinalize ||
            canSecretaryRecordExternalReturn ||
            canSecretaryRelease) && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-200">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-800">
                  Actions available for you
                </p>
                <p className="text-xs text-ink-600">
                  {canResubmit
                    ? 'Review the comments above and upload corrected documents.'
                    : canSecretaryCheck
                    ? 'Automatic check confirmed required attachments are present. Verify that the content inside is correct before routing.'
                    : isReviewerForDoc
                    ? `Record the decision of the ${currentStep?.label ?? OFFICE_LABEL[user.role as keyof typeof OFFICE_LABEL]}.`
                    : canSecretaryFinalize
                    ? 'All reviews completed. Ready to mark for release or forward to an external office.'
                    : canSecretaryRecordExternalReturn
                    ? 'Record when the document returns from the external office.'
                    : 'Record the release to the requester once collected and attach the signed scan.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canResubmit && (
                  <Button onClick={handleOpenResubmit} icon={RotateCcw}>
                    Resubmit Corrected Document
                  </Button>
                )}

                {canSecretaryCheck && (
                  <Button onClick={handleOpenCheck} icon={CheckCircle2}>
                    Verify Content & Route
                  </Button>
                )}

                {isReviewerForDoc && (
                  <>
                    <Button
                      onClick={() =>
                        handleOpenReview(
                          allowedReviewOpts.find(
                            (o) =>
                              o.kind === 'approve' ||
                              o.kind === 'endorse' ||
                              o.kind === 'endorse_higher',
                          )?.kind ?? 'endorse',
                        )
                      }
                      icon={UserCheck}
                      variant="primary"
                    >
                      {allowedReviewOpts.some((o) => o.kind === 'approve')
                        ? 'Approve Document'
                        : allowedReviewOpts.some((o) => o.kind === 'endorse_higher')
                        ? 'Endorse to Higher Office'
                        : 'Endorse Document'}
                    </Button>
                    <Button
                      onClick={() => handleOpenReview('return')}
                      icon={RotateCcw}
                      variant="secondary"
                      className="border-warning-300 text-warning-800 hover:bg-warning-50 hover:text-warning-900"
                    >
                      Return for Correction
                    </Button>
                    <Button
                      onClick={() => handleOpenReview('reject')}
                      icon={XCircle}
                      variant="danger-soft"
                    >
                      Disapprove / Reject
                    </Button>
                  </>
                )}

                {canSecretaryFinalize && (
                  <>
                    <Button onClick={handleMarkReady} icon={PackageCheck}>
                      Mark Ready for Pickup
                    </Button>
                    <Button
                      onClick={() => {
                        setExternalOffice(db.externalOffices[0]?.id ?? 'hrmo')
                        setExternalHandedBy(user.name)
                        setExternalRemarks('')
                        setIsExternalOpen(true)
                      }}
                      variant="secondary"
                      icon={Building2}
                    >
                      Send to External Office
                    </Button>
                  </>
                )}

                {canSecretaryRecordExternalReturn && (
                  <Button onClick={() => setIsExternalReturnOpen(true)} icon={CheckCircle2}>
                    Record Return from External Office
                  </Button>
                )}

                {canSecretaryRelease && (
                  <Button onClick={handleOpenRelease} icon={PackageCheck}>
                    Record Release to Requester
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Document Metadata Grid (REQ-REC-1, REQ-TRK-2) */}
          <div className="mt-6 border-t border-ink-100 pt-6">
            <DefinitionList
              items={[
                {
                  label: 'Control Number & Revision',
                  value: <span className="font-mono font-bold text-brand-900">{controlNumber(doc)}</span>,
                  hint: doc.encodedBySecretary
                    ? 'Walk-in document encoded by the College Secretary'
                    : `Origin: ${doc.origin}`,
                },
                {
                  label: 'Requester',
                  value: requester ? `${requester.name} (${requester.department})` : '—',
                  hint: requester?.email,
                },
                {
                  label: 'Date & Time Submitted',
                  value: formatDateTime(doc.submittedAt),
                },
                {
                  label: 'Last Updated Time',
                  value: formatDateTime(doc.updatedAt),
                },
                {
                  label: 'Current Office Location',
                  value: isReqUser ? locationLabel(doc, db) : locationLabelForStaff(doc, db),
                  hint: `Arrived on ${formatDate(doc.officeSince)} (${plural(doc.routeIndex, 'step')} completed)`,
                },
                {
                  label: 'Standard Processing Time',
                  value: docType
                    ? `${docType.processingDays[0]} to ${docType.processingDays[1]} working days`
                    : '—',
                  hint: delayed ? 'Past the standard turnaround threshold (Delayed)' : 'Within normal timeframe',
                },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Section 1: Submitted Documents & Attachments (Separated from Routing Path) */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-ink-100 mb-4">
          <div>
            <h2 className="text-base font-bold text-ink-950">Submitted Files & Attachments</h2>
            <p className="text-xs text-ink-500">
              Official forms and uploaded documents available for verification and review.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="secondary"
              icon={Eye}
              onClick={() => {
                setPreviewAttachmentId(undefined)
                setIsPreviewModalOpen(true)
              }}
            >
              Preview Document & Files
            </Button>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
              {doc.attachments.filter((a) => a.revision === doc.revision).length} file(s) in {revisionLabel(doc.revision)}
            </span>
          </div>
        </div>
        <AttachmentList db={db} doc={doc} />
      </Card>

      {/* Section 2: Institutional Review Route Journey */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="pb-3 border-b border-ink-100">
            <h2 className="text-base font-bold text-ink-950">
              Institutional Route Journey ({doc.origin})
            </h2>
            <p className="text-xs text-ink-500">
              Step-by-step approval journey and recorded audit milestones across offices
            </p>
          </div>

          <div className="max-w-2xl pt-2">
            <RouteProgress doc={doc} db={db} />
          </div>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* DIALOGS                                                                   */}
      {/* ========================================================================= */}

      {/* 1. Resubmit Dialog (REQ-SUB-8) */}
      <Dialog
        open={isResubmitOpen && canResubmit}
        onClose={() => setIsResubmitOpen(false)}
        title="Resubmit Corrected Document"
        description="Attach your corrected files below. Your request will retain the same control number with an incremented revision number and will return to the College Secretary."
        busy={resubmitBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsResubmitOpen(false)} disabled={resubmitBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleResubmitSubmit}
              loading={resubmitBusy}
              loadingText="Resubmitting…"
              icon={Send}
            >
              Resubmit Document
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Field label="Document Title" required error={resubmitErrors.title}>
            <Input
              type="text"
              value={resubmitTitle}
              onChange={(e) => {
                setResubmitTitle(e.target.value)
                if (resubmitErrors.title) setResubmitErrors((prev) => ({ ...prev, title: undefined }))
              }}
            />
          </Field>

          <Field
            label="What changes did you make?"
            required
            error={resubmitErrors.general}
            hint="Explain how you addressed the comments provided by the reviewing office."
          >
            <Textarea
              rows={3}
              value={resubmitNote}
              onChange={(e) => {
                setResubmitNote(e.target.value)
                if (resubmitErrors.general) setResubmitErrors((prev) => ({ ...prev, general: undefined }))
              }}
              placeholder="e.g. Attached the signed certification and updated page 2..."
            />
          </Field>

          <div>
            <label className="block text-sm font-semibold text-ink-800">Attach Corrected Files</label>
            <div className="mt-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100">
                <Paperclip className="size-3.5" aria-hidden /> Attach File
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="sr-only"
                  onChange={handleResubmitFileChosen}
                />
              </label>
            </div>
            {resubmitFiles.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-lg border border-ink-100 p-2">
                {resubmitFiles.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-ink-800">
                    <span className="truncate">{f.name} ({f.sizeKb} KB)</span>
                    <button
                      type="button"
                      onClick={() => setResubmitFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-danger-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </Dialog>

      {/* 2. Secretary Content Verification & Completeness Check Dialog (REQ-REQT-4, REQ-REQT-5, REQ-REQT-6) */}
      <Dialog
        open={isCheckOpen}
        onClose={() => setIsCheckOpen(false)}
        size="lg"
        title="Verify Content & Log Submission"
        description="The automatic completeness checker has verified that all required attachments are present. Review the uploaded files for content correctness, then mark Complete to log and route, Return if content issues are found, or Disapprove / Reject if the submission is invalid."
        busy={checkBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCheckOpen(false)} disabled={checkBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckRequirements}
              loading={checkBusy}
              variant={checkDecision === 'return' || checkDecision === 'reject' ? 'danger' : 'primary'}
              icon={checkDecision === 'return' ? AlertCircle : checkDecision === 'reject' ? X : CheckCircle2}
            >
              {checkDecision === 'return'
                ? 'Return for Content Issues'
                : checkDecision === 'reject'
                ? 'Disapprove & Reject Submission'
                : 'Mark Complete, Log & Route'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {/* Automatic Completeness Check Result Banner (REQ-REQT-4) */}
          <div className="flex items-center justify-between rounded-xl bg-success-50 p-3.5 text-xs text-success-700 ring-1 ring-inset ring-success-100">
            <div className="flex items-center gap-2 font-semibold">
              <FileCheck2 className="size-4 shrink-0" />
              <span>Automatic Completeness Check Result: All required attachments are present</span>
            </div>
            <Badge tone="success" dot={false}>
              Auto-Check Passed
            </Badge>
          </div>

          {/* Uploaded Files for Content Inspection */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
              Uploaded Files to Inspect ({currentAttachments.length})
            </p>
            <ul className="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-100">
              {currentAttachments.map((a) => {
                const req = docType?.requirements.find((r) => r.id === a.requirementId)
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5 text-xs">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="size-4 shrink-0 text-brand-600" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{a.name}</p>
                        <p className="text-ink-500">
                          {req ? req.label : 'Additional file'} · {formatSize(a.sizeKb)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewAttachmentId(a.id)
                        setIsPreviewModalOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 transition-colors"
                      title="Inspect and read document content before deciding"
                    >
                      <Eye className="size-3.5 text-brand-600" /> Preview Content
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Verification Result Selector */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
              Content Verification Result (REQ-REQT-4)
            </p>
            <Segmented
              label="Verification Result"
              value={checkDecision}
              onChange={(v) => {
                setCheckDecision(v)
                setCheckErrors({})
              }}
              options={[
                { value: 'complete', label: 'Complete — Content is Correct' },
                { value: 'return', label: 'Return — Content Has Issues' },
                { value: 'reject', label: 'Disapprove / Reject Submission' },
              ]}
            />
          </div>

          {checkDecision === 'return' && docType && (
            <div className="space-y-2 rounded-xl bg-danger-50/40 p-3.5 ring-1 ring-inset ring-danger-100">
              <p className="text-xs font-bold text-danger-800">
                Optional: Flag specific attachments that contain incorrect or incomplete information
              </p>
              <div className="space-y-1.5">
                {docType.requirements.map((req) => {
                  const isFlagged = flaggedReqIds.includes(req.id)
                  return (
                    <Checkbox
                      key={req.id}
                      checked={isFlagged}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFlaggedReqIds((prev) => [...prev, req.id])
                        } else {
                          setFlaggedReqIds((prev) => prev.filter((id) => id !== req.id))
                        }
                      }}
                      label={<span className="text-xs font-semibold text-ink-900">{req.label}</span>}
                    />
                  )
                })}
              </div>
            </div>
          )}

          <Field
            label={
              checkDecision === 'return'
                ? 'Reasons for Returning (Content Issues)'
                : checkDecision === 'reject'
                ? 'Reasons for Disapproval / Rejection'
                : 'Verification Remarks'
            }
            required={checkDecision === 'return' || checkDecision === 'reject'}
            optional={checkDecision === 'complete'}
            error={checkErrors.reasons}
            hint={
              checkDecision === 'return'
                ? 'Required (REQ-REQT-5): Explain what information inside the document or attachments is incorrect or incomplete.'
                : checkDecision === 'reject'
                ? 'Required: Explain why this submission is disapproved/rejected. The requester will receive this notification.'
                : 'Optional note recorded with your content verification.'
            }
          >
            <Textarea
              rows={3}
              value={checkReasons}
              onChange={(e) => {
                setCheckReasons(e.target.value)
                if (checkErrors.reasons) setCheckErrors({})
              }}
              placeholder={
                checkDecision === 'return'
                  ? 'e.g. Page 2 of the form is unsigned, or the attached certification is missing the instructor signature...'
                  : checkDecision === 'reject'
                  ? 'e.g. Document does not meet institutional academic requirements or ineligible request...'
                  : 'Content verified complete and accurate. Logging and routing...'
              }
            />
          </Field>
        </form>
      </Dialog>

      {/* 3. Reviewing Office Action Dialog (REQ-ROUTE-5, REQ-ROUTE-6) */}
      <Dialog
        open={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        title={`Review Document — ${currentStep?.label ?? OFFICE_LABEL[user.role as keyof typeof OFFICE_LABEL]}`}
        description="Record your decision on this document. You can endorse it, approve it, return it for revisions, or disapprove/reject it."
        busy={reviewBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsReviewOpen(false)} disabled={reviewBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleReviewSubmit}
              loading={reviewBusy}
              variant={reviewKind === 'return' || reviewKind === 'reject' ? 'danger' : 'primary'}
            >
              {reviewKind === 'return'
                ? 'Return for Correction'
                : reviewKind === 'reject'
                ? 'Disapprove & Reject Document'
                : reviewKind === 'approve'
                ? 'Approve Document'
                : reviewKind === 'endorse_higher'
                ? 'Endorse to Higher Office'
                : 'Endorse Document'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {/* Pre-Action Document Inspection */}
          <div className="flex items-center justify-between rounded-xl bg-brand-50/70 p-3.5 ring-1 ring-inset ring-brand-200 text-xs">
            <div className="flex items-center gap-2.5">
              <FileText className="size-4 text-brand-700 shrink-0" />
              <div>
                <p className="font-bold text-brand-950">Inspect Document & Attachments</p>
                <p className="text-[11px] text-brand-800">
                  Read the full submission and verify attached files before recording your decision.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewAttachmentId(undefined)
                setIsPreviewModalOpen(true)
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-brand-800 shadow-xs ring-1 ring-ink-200 hover:bg-brand-50 transition-colors"
            >
              <Eye className="size-3.5 text-brand-600" /> Preview Document
            </button>
          </div>

          {/* Action to Record (Visual Segmented Card Selector - REQ-ROUTE-5..8) */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
              Select Decision Action <span className="text-danger-600">*</span>
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {/* 1. Endorse or Approve */}
              {allowedReviewOpts
                .filter(
                  (o) =>
                    o.kind === 'endorse' ||
                    o.kind === 'approve' ||
                    o.kind === 'endorse_higher',
                )
                .map((opt) => (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => {
                      setReviewKind(opt.kind)
                      if (reviewErrors.remarks) setReviewErrors({})
                    }}
                    className={`flex flex-col items-start rounded-xl p-3 text-left ring-1 transition-all ${
                      reviewKind === opt.kind
                        ? 'bg-brand-50/90 ring-2 ring-brand-600 shadow-xs'
                        : 'bg-white ring-ink-200 hover:bg-ink-50/70'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold text-brand-900">
                      <CheckCircle2 className="size-3.5 text-brand-600" />
                      {opt.kind === 'approve'
                        ? 'Approve Document'
                        : opt.kind === 'endorse_higher'
                        ? 'Endorse Higher'
                        : 'Endorse Document'}
                    </span>
                    <span className="mt-1 text-2xs text-ink-600 leading-tight">
                      {opt.kind === 'approve'
                        ? 'Final office approval — route to Secretary for release'
                        : opt.kind === 'endorse_higher'
                        ? `Route to ${docType?.higherApproval.map((o) => OFFICE_LABEL[o]).join(' & ')}`
                        : `Forward to ${opt.next ? OFFICE_LABEL[opt.next] : 'next reviewing office'}`}
                    </span>
                  </button>
                ))}

              {/* 2. Return for Correction */}
              {allowedReviewOpts.some((o) => o.kind === 'return') && (
                <button
                  type="button"
                  onClick={() => {
                    setReviewKind('return')
                    if (reviewErrors.remarks) setReviewErrors({})
                  }}
                  className={`flex flex-col items-start rounded-xl p-3 text-left ring-1 transition-all ${
                    reviewKind === 'return'
                      ? 'bg-warning-50/90 ring-2 ring-warning-600 shadow-xs'
                      : 'bg-white ring-ink-200 hover:bg-ink-50/70'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-warning-900">
                    <RotateCcw className="size-3.5 text-warning-700" />
                    Return for Correction
                  </span>
                  <span className="mt-1 text-2xs text-ink-600 leading-tight">
                    Return to requester with feedback to correct missing/erroneous files
                  </span>
                </button>
              )}

              {/* 3. Disapprove / Reject */}
              {allowedReviewOpts.some((o) => o.kind === 'reject') && (
                <button
                  type="button"
                  onClick={() => {
                    setReviewKind('reject')
                    if (reviewErrors.remarks) setReviewErrors({})
                  }}
                  className={`flex flex-col items-start rounded-xl p-3 text-left ring-1 transition-all ${
                    reviewKind === 'reject'
                      ? 'bg-danger-50/90 ring-2 ring-danger-600 shadow-xs'
                      : 'bg-white ring-ink-200 hover:bg-ink-50/70'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-danger-900">
                    <XCircle className="size-3.5 text-danger-600" />
                    Disapprove / Reject
                  </span>
                  <span className="mt-1 text-2xs text-ink-600 leading-tight">
                    Officially disapprove and close the document request
                  </span>
                </button>
              )}
            </div>
          </div>

          <Field
            label="Remarks / Comments"
            required={reviewKind === 'return' || reviewKind === 'reject'}
            error={reviewErrors.remarks}
            hint={
              reviewKind === 'return'
                ? 'Please explain what needs to be corrected. The requester will review your comments.'
                : reviewKind === 'reject'
                ? 'Please state the reason for disapproving/rejecting this document. The requester will review your comments.'
                : 'Optional notes to accompany your endorsement or approval.'
            }
          >
            <Textarea
              rows={3}
              value={reviewRemarks}
              onChange={(e) => {
                setReviewRemarks(e.target.value)
                if (reviewErrors.remarks) setReviewErrors({})
              }}
              placeholder={
                reviewKind === 'reject'
                  ? 'Enter the official reason for disapproving this document...'
                  : 'Enter your comments or decision rationale...'
              }
            />
          </Field>
        </form>
      </Dialog>

      {/* 4. Secretary Send to External Office Dialog (REQ-EXT-1, REQ-EXT-2) */}
      <Dialog
        open={isExternalOpen}
        onClose={() => setIsExternalOpen(false)}
        title="Record Transfer to External Office"
        description="Record the transfer of physical or electronic documents to an external university office so its location and waiting days remain visible."
        busy={externalBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsExternalOpen(false)} disabled={externalBusy}>
              Cancel
            </Button>
            <Button onClick={handleSendExternal} loading={externalBusy} icon={Building2}>
              Record Office Transfer
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Field label="External University Office" required>
            <Select
              value={externalOffice}
              onChange={(e) => setExternalOffice(e.target.value)}
            >
              {db.externalOffices.map((ext) => (
                <option key={ext.id} value={ext.id}>
                  {ext.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Handed Over By" required error={externalErrors.handedBy}>
            <Input
              type="text"
              value={externalHandedBy}
              onChange={(e) => {
                setExternalHandedBy(e.target.value)
                if (externalErrors.handedBy) setExternalErrors({})
              }}
            />
          </Field>

          <Field label="Transfer Remarks" optional>
            <Textarea
              rows={2}
              value={externalRemarks}
              onChange={(e) => setExternalRemarks(e.target.value)}
              placeholder="e.g. Sent for verification of service credits..."
            />
          </Field>
        </form>
      </Dialog>

      {/* 5. Secretary Record External Return Dialog (REQ-EXT-3) */}
      <Dialog
        open={isExternalReturnOpen}
        onClose={() => setIsExternalReturnOpen(false)}
        title="Record Return from External Office"
        description="Record that the document has been returned by the external office back to the College Secretary."
        busy={extReturnBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsExternalReturnOpen(false)} disabled={extReturnBusy}>
              Cancel
            </Button>
            <Button onClick={handleExternalReturn} loading={extReturnBusy} icon={CheckCircle2}>
              Record Return
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Field label="Return Remarks" optional>
            <Textarea
              rows={3}
              value={extReturnRemarks}
              onChange={(e) => setExtReturnRemarks(e.target.value)}
              placeholder="e.g. Processed and signed by HRMO representative..."
            />
          </Field>
        </form>
      </Dialog>

      {/* 6. Secretary Release Dialog (REQ-REL-1..4) */}
      <Dialog
        open={isReleaseOpen}
        onClose={() => setIsReleaseOpen(false)}
        title="Release Document & Archive Record"
        description="Record the final collection of the document and attach a scanned copy of the final signed document. Once recorded, the status updates to Released and moves to the read-only College Archive."
        busy={releaseBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsReleaseOpen(false)} disabled={releaseBusy}>
              Cancel
            </Button>
            <Button onClick={handleReleaseSubmit} loading={releaseBusy} icon={PackageCheck}>
              Confirm Release & Archive
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Field
            label="Name of Person Who Received Document (REQ-REL-2)"
            required
            error={releaseErrors.receivedBy}
            hint="Enter the full name of the student, faculty member, or authorized representative."
          >
            <Input
              type="text"
              value={releaseReceivedBy}
              onChange={(e) => {
                setReleaseReceivedBy(e.target.value)
                if (releaseErrors.receivedBy) setReleaseErrors({})
              }}
              placeholder="e.g. Maria Santos"
            />
          </Field>

          {/* REQ-REL-4: Attach scanned copy of final signed document */}
          <div>
            <label className="block text-sm font-semibold text-ink-800">
              Scanned Copy of Final Signed Document (REQ-REL-4)
            </label>
            <p className="mt-0.5 text-xs text-ink-500">
              Attach a scanned PDF or image of the final signed document for the permanent archive record.
            </p>
            <div className="mt-2">
              {releaseSignedFile ? (
                <div className="flex items-center justify-between rounded-lg bg-success-50/60 px-3 py-2 text-xs ring-1 ring-success-200">
                  <span className="flex items-center gap-2 font-semibold text-ink-900">
                    <FileCheck2 className="size-4 text-success-600" />
                    {releaseSignedFile.name} ({releaseSignedFile.sizeKb} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => setReleaseSignedFile(null)}
                    className="text-ink-400 hover:text-danger-600"
                    aria-label="Remove signed file"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100">
                  <UploadCloud className="size-4" aria-hidden /> Attach Scanned Signed Document
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={handleSignedFileChosen}
                  />
                </label>
              )}
            </div>
          </div>
        </form>
      </Dialog>

      {/* 5. In-App Document & Attachment Previewer Modal (Zero-download inspection) */}
      {isPreviewModalOpen && doc && (
        <DocumentPreviewModal
          open={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          doc={doc}
          db={db}
          initialAttachmentId={previewAttachmentId}
        />
      )}
    </div>
  )
}
