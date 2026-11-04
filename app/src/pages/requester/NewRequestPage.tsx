import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileCheck2,
  FileText,
  Info,
  Paperclip,
  Send,
  UploadCloud,
  X,
} from 'lucide-react'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { sessionFiles } from '../../components/documents'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, ButtonLink, Card, CardHeader, PageHeader } from '../../components/ui'
import { controlNumber, downloadGeneratedPdf, formatRoleTitle } from '../../content/language'
import { formatDateTime } from '../../lib/time'
import { ACCEPTED_EXT, MAX_FILE_MB, type NewFile } from '../../data/engine'
import { api, useDb } from '../../data/store'
import type { DocRecord, DocumentType, Origin, Requirement } from '../../data/types'

interface SelectedFileItem {
  requirementId?: string
  name: string
  sizeKb: number
  fileObj?: File
}

export function NewRequestPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Allowed document types for this user's role (REQ-SUB-1)
  const userAudience = user.role === 'student' ? 'student' : 'faculty'
  const types = db.documentTypes.filter((t) => t.audience === userAudience)

  // Origin is strictly derived from account and affiliation (REQ-SUB-6)
  const derivedOrigin: Origin =
    user.origin ??
    (user.role === 'ids_principal' || user.department.includes('Integrated Developmental School') ? 'IDS' : 'CESS')

  // Automatic timestamp preview per acceptance criteria
  const [submissionTimePreview, setSubmissionTimePreview] = useState<string>(() => new Date().toISOString())

  useEffect(() => {
    const timer = setInterval(() => {
      setSubmissionTimePreview(new Date().toISOString())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const initialTypeFromUrl = searchParams.get('type')
  const defaultTypeId = types.find((t) => t.id === initialTypeFromUrl)?.id ?? types[0]?.id ?? ''

  const [selectedTypeId, setSelectedTypeId] = useState<string>(defaultTypeId)
  const selectedType: DocumentType | undefined = types.find((t) => t.id === selectedTypeId)

  useEffect(() => {
    const typeFromUrl = searchParams.get('type')
    if (typeFromUrl && types.some((t) => t.id === typeFromUrl)) {
      setSelectedTypeId(typeFromUrl)
    }
  }, [searchParams, types])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<SelectedFileItem[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({})
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedDoc, setSubmittedDoc] = useState<DocRecord | null>(null)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)

  // Handle switching document type
  const handleTypeChange = (newTypeId: string) => {
    setSelectedTypeId(newTypeId)
    setAttachedFiles([])
    setErrors({})
    setFileErrors({})
    setHasAttemptedSubmit(false)
  }

  // REQ-REQT-9: Download blank official form template for the chosen document type
  const handleDownloadTemplate = (type: DocumentType) => {
    const fileName = type.templateName || `${type.name.replace(/\s+/g, '_')}_Template.pdf`
    downloadGeneratedPdf(fileName, `OFFICIAL FORM TEMPLATE: ${type.name}`, [
      `Document Service: ${type.name}`,
      `Eligible Audience: ${type.audience === 'student' ? 'Students' : 'CESS & IDS Faculty'}`,
      `Standard Processing Time: ${type.processingDays[0]} to ${type.processingDays[1]} working days`,
      '',
      'REQUIRED CHECKLIST ITEMS:',
      ...type.requirements.map(
        (r, i) => `${i + 1}. [${r.required ? 'REQUIRED' : 'OPTIONAL'}] ${r.label}${r.source ? ` (${r.source})` : ''}`,
      ),
      '',
      'INSTRUCTIONS FOR REQUESTER:',
      '1. Fill in all required fields on this official college form accurately.',
      '2. Obtain any preliminary departmental or instructor signatures if applicable.',
      '3. Save or scan the completed form as PDF, JPG, or PNG (max 20 MB) and upload it in CESS DocuFlow.',
    ])
    toast.info('Template Downloaded', `Downloaded ${fileName}. Fill it in and attach it below.`)
  }

  // REQ-SUB-3, REQ-SUB-4: File selection with multiple upload support, 20 MB size limit, inline error messages
  const handleFileChosen = (e: ChangeEvent<HTMLInputElement>, req?: Requirement) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    if (req) {
      // Specific requirement checklist upload
      const file = fileList[0]
      const sizeKb = Math.round(file.size / 1024)
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`

      if (!ACCEPTED_EXT.includes(ext)) {
        const msg = `“${file.name}” is not a supported file type. Accepted formats: PDF, JPG, PNG.`
        setFileErrors((prev) => ({ ...prev, [req.id]: msg }))
        toast.error('Unsupported File Format', msg)
        e.target.value = ''
        return
      }

      if (sizeKb > MAX_FILE_MB * 1024) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
        const msg = `“${file.name}” (${sizeMb} MB) exceeds the 20 MB limit. Please attach a compressed version.`
        setFileErrors((prev) => ({ ...prev, [req.id]: msg }))
        toast.error('File Exceeds Size Limit', msg)
        e.target.value = ''
        return
      }

      // Valid requirement file
      setFileErrors((prev) => {
        const next = { ...prev }
        delete next[req.id]
        return next
      })

      setAttachedFiles((prev) => {
        const filtered = prev.filter((f) => f.requirementId !== req.id)
        return [
          ...filtered,
          {
            requirementId: req.id,
            name: file.name,
            sizeKb,
            fileObj: file,
          },
        ]
      })

      setErrors((prev) => {
        const next = { ...prev }
        delete next.attachments
        return next
      })
      toast.success('File Attached', `Attached “${file.name}” for ${req.label}.`)
    } else {
      // REQ-SUB-3: Multiple supporting documents upload
      const chosenFiles = Array.from(fileList)
      const invalidTypes: string[] = []
      const oversized: string[] = []
      const validFiles: SelectedFileItem[] = []

      for (const file of chosenFiles) {
        const sizeKb = Math.round(file.size / 1024)
        const ext = `.${file.name.split('.').pop()?.toLowerCase()}`

        if (!ACCEPTED_EXT.includes(ext)) {
          invalidTypes.push(file.name)
        } else if (sizeKb > MAX_FILE_MB * 1024) {
          const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
          oversized.push(`${file.name} (${sizeMb} MB)`)
        } else {
          validFiles.push({
            name: file.name,
            sizeKb,
            fileObj: file,
          })
        }
      }

      if (invalidTypes.length > 0 || oversized.length > 0) {
        const errorDetails: string[] = []
        if (invalidTypes.length > 0) {
          errorDetails.push(`Unsupported format (must be PDF, JPG, PNG): ${invalidTypes.join(', ')}`)
        }
        if (oversized.length > 0) {
          errorDetails.push(`Exceeds 20 MB limit: ${oversized.join(', ')}`)
        }
        const combinedMsg = errorDetails.join('. ')
        setFileErrors((prev) => ({ ...prev, general: combinedMsg }))
        toast.error('File Upload Issue', combinedMsg)
      } else {
        setFileErrors((prev) => {
          const next = { ...prev }
          delete next.general
          return next
        })
      }

      if (validFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...validFiles])
        toast.success(
          validFiles.length === 1 ? 'Supporting File Attached' : 'Supporting Files Attached',
          `Added ${validFiles.length} supporting document(s).`,
        )
      }
    }

    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const requiredList = selectedType ? selectedType.requirements.filter((r) => r.required) : []
  const attachedRequiredCount = requiredList.filter((r) => attachedFiles.some((f) => f.requirementId === r.id)).length
  const allRequiredAttached = requiredList.length > 0 && attachedRequiredCount === requiredList.length

  const mandatoryMissing = selectedType
    ? selectedType.requirements.filter((r) => r.required && !attachedFiles.some((f) => f.requirementId === r.id))
    : []

  const isTitleValid = title.trim().length >= 3
  const isDescriptionValid = description.trim().length > 0
  const isFormComplete = isTitleValid && isDescriptionValid && allRequiredAttached

  const missingItemsSummary: string[] = []
  if (!title.trim()) {
    missingItemsSummary.push('Title or Subject (required, min 3 characters)')
  } else if (title.trim().length < 3) {
    missingItemsSummary.push('Title or Subject (must be at least 3 characters)')
  }
  if (!description.trim()) {
    missingItemsSummary.push('Description or Purpose of Request (required)')
  }
  mandatoryMissing.forEach((m) => {
    missingItemsSummary.push(`Required form: ${m.label}`)
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setHasAttemptedSubmit(true)
    if (!selectedTypeId || !selectedType) {
      setErrors({ typeId: 'Please select a document type.' })
      toast.error('Submission Incomplete', 'Please select a document type.')
      return
    }

    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = 'Please enter a title or subject for this request.'
    } else if (title.trim().length < 3) {
      newErrors.title = 'Title or subject must be at least 3 characters.'
    }

    if (!description.trim()) {
      newErrors.description = 'Please enter a description or purpose for your document request.'
    }

    // Automatic completeness check before submission reaches the College Secretary (REQ-REQT-3)
    if (mandatoryMissing.length > 0) {
      newErrors.attachments = `Automatic completeness check failed: ${mandatoryMissing.length} required form(s) missing (${mandatoryMissing.map((m) => m.label).join(', ')}). Incomplete requests cannot advance.`
    }

    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
      toast.error(
        'Submission Incomplete — Cannot Advance',
        `Missing ${missingItemsSummary.length} required item(s). Please attach all required forms and fill in required fields.`,
      )
      return
    }

    setIsSubmitting(true)
    try {
      const payloadFiles: NewFile[] = attachedFiles.map((f) => ({
        requirementId: f.requirementId,
        name: f.name,
        sizeKb: f.sizeKb,
      }))

      const doc = await api.submitRequest(user, {
        typeId: selectedType.id,
        title: title.trim(),
        description: description.trim(),
        files: payloadFiles,
      })

      // Store local object URLs for preview in session
      attachedFiles.forEach((f, idx) => {
        if (f.fileObj && doc.attachments[idx]) {
          sessionFiles.set(doc.attachments[idx].id, URL.createObjectURL(f.fileObj))
        }
      })

      setSubmittedDoc(doc)
      setIsConfirmModalOpen(true)
      toast.success(
        'Request Submitted Successfully',
        `Assigned Control Number: ${controlNumber(doc)}. Your request is saved with status Submitted.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'We could not submit your request. Please try again.'
      toast.error('Submission Unsuccessful', msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={
          selectedTypeId
            ? `/app/my-documents?folder=${selectedTypeId}`
            : '/app/my-documents'
        }
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to Document Repository
      </Link>

      <PageHeader
        eyebrow="New Submission"
        title="Submit Document Request"
        description="Choose your document type, attach your files, and submit your request."
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Step 1: Document Type Choice & Template Download (REQ-SUB-1, REQ-REQT-9) */}
        <Card className="p-5 sm:p-6">
          <CardHeader
            title="1. Select Document Type & Download Template"
            description="Choose the document you are requesting."
          />
          <div className="mt-4 space-y-4">
            <Field
              label="Document Type"
              required
              error={errors.typeId}
              hint="Showing document types available for your role."
            >
              <Select
                value={selectedTypeId}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full"
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedType && (
              <div className="rounded-xl bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-100">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-900">{selectedType.name}</p>
                    <p className="mt-1 text-sm text-ink-600">{selectedType.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-brand-700">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5" aria-hidden />
                        Standard processing time: {selectedType.processingDays[0]} to {selectedType.processingDays[1]} working days
                      </span>
                      <span className="text-ink-500">·</span>
                      <span>Derived Origin: {derivedOrigin}</span>
                    </div>
                  </div>

                  {/* REQ-REQT-9: Downloadable blank template for each document type */}
                  <div className="shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={() => handleDownloadTemplate(selectedType)}
                    >
                      Download Form Template
                    </Button>
                    <p className="mt-1 text-right text-[11px] text-ink-500">
                      {selectedType.templateName || `${selectedType.id}_template.pdf`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Step 2: Request Details (REQ-SUB-2) */}
        <Card className="p-5 sm:p-6">
          <CardHeader
            title="2. Requester Information & Request Details"
            description="Verified requester credentials, derived routing origin, and automatic submission timestamp."
          />
          <div className="mt-4 space-y-4">
            {/* Requester Profile & Automatic Metadata (REQ-SUB-2, REQ-SUB-5, REQ-SUB-6) */}
            <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink-900 text-sm">Requester Information</span>
                  <Badge tone={derivedOrigin === 'IDS' ? 'warning' : 'brand'} dot={false}>
                    {derivedOrigin === 'IDS' ? 'IDS Affiliation' : 'CESS Affiliation'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-2xs text-ink-700 font-mono bg-white px-2.5 py-1 rounded-md border border-ink-200 shadow-2xs">
                  <Clock className="size-3 text-brand-600" aria-hidden="true" />
                  <span>Submission Timestamp: <strong>Automatic</strong></span>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="block font-semibold text-ink-500">Requester Name</span>
                  <span className="font-bold text-ink-900 text-sm">{user.name}</span>
                </div>
                <div>
                  <span className="block font-semibold text-ink-500">Official University Email</span>
                  <span className="font-medium text-ink-800 break-all">{user.email}</span>
                </div>
                <div>
                  <span className="block font-semibold text-ink-500">Role & Position</span>
                  <span className="font-medium text-ink-800">{user.position} ({formatRoleTitle(user)})</span>
                </div>
                <div>
                  <span className="block font-semibold text-ink-500">Department / Academic Program</span>
                  <span className="font-medium text-ink-800">{user.department}</span>
                </div>
              </div>

              <div className="mt-3.5 grid gap-3 rounded-lg bg-white p-3 border border-ink-100 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-ink-900">Derived Origin:</span>
                    <Badge tone={derivedOrigin === 'IDS' ? 'warning' : 'brand'} dot={false}>
                      {derivedOrigin}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-2xs text-ink-600 leading-snug">
                    Automatically derived from your institutional affiliation ({user.department}).
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-ink-900">Automatic Timestamp:</span>
                    <span className="font-semibold text-brand-800">{formatDateTime(submissionTimePreview)}</span>
                  </div>
                  <p className="mt-0.5 text-2xs text-ink-600 leading-snug">
                    System records and seals this timestamp automatically upon submission.
                  </p>
                </div>
              </div>
            </div>


            {/* Explicit Affiliation & Routing Path Notice (REQ-PM-FEEDBACK-2) */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-brand-950">
                    {user.role === 'ids_principal'
                      ? '🏫 IDS Principal'
                      : derivedOrigin === 'IDS'
                        ? user.role === 'faculty' ? '🏫 IDS Faculty' : '🏫 IDS Student'
                        : user.role === 'faculty' ? '🏛️ CESS Faculty' : '🏛️ CESS Student'}
                  </span>
                  <Badge tone={derivedOrigin === 'IDS' ? 'warning' : 'brand'} dot={false}>
                    {derivedOrigin === 'IDS' ? 'Integrated Developmental School' : 'College of Education and Social Sciences'}
                  </Badge>
                </div>
                <span className="font-mono text-2xs font-semibold text-brand-700">
                  Routing:{' '}
                  {user.role === 'ids_principal'
                    ? 'Secretary → Chairperson → Dean → Release'
                    : derivedOrigin === 'IDS'
                      ? 'Secretary → Chairperson → IDS Principal → Dean → Release'
                      : 'Secretary → Chairperson → Dean → Release'}
                </span>
              </div>
              <div className="mt-2.5 rounded-lg bg-white p-2.5 ring-1 ring-brand-100 text-ink-700">
                <span className="font-semibold text-ink-900">Official Routing Path: </span>
                {user.role === 'ids_principal' ? (
                  <span>
                    Secretary Check → Chairperson → Dean Endorsement → Release{' '}
                    <span className="text-brand-700 font-medium">(Self-endorsement omitted)</span>
                  </span>
                ) : derivedOrigin === 'IDS' ? (
                  <span>
                    Secretary Check → Chairperson →{' '}
                    <strong className="text-warning-800 underline decoration-warning-400">IDS Principal (Review)</strong>{' '}
                    → Dean Endorsement → Release
                  </span>
                ) : (
                  <span>Secretary Check → Chairperson → Dean Endorsement → Release</span>
                )}
              </div>
              {user.role === 'ids_principal' ? (
                <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-600">
                  <Info className="size-3.5 shrink-0 text-brand-600 mt-0.5" />
                  <span>
                    <strong>Note:</strong> As the IDS Principal submitting an official document request, your request proceeds to the Chairperson and Dean for endorsement without duplicate self-review.
                  </span>
                </p>
              ) : derivedOrigin === 'IDS' ? (
                <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-600">
                  <Info className="size-3.5 shrink-0 text-brand-600 mt-0.5" />
                  <span><strong>Note:</strong> As an IDS requester, your document will route through the IDS Principal before the Dean.</span>
                </p>
              ) : (
                <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-600">
                  <Info className="size-3.5 shrink-0 text-brand-600 mt-0.5" />
                  <span><strong>Note:</strong> As a CESS requester, your document routes through your Department Chairperson and the College Dean.</span>
                </p>
              )}
            </div>

            <Field
              label="Title or Subject"
              required
              error={errors.title}
              hint="Example: Travel to Regional Science Conference in CDO, or Thesis Title Approval — Grade 10 English."
            >
              <Input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (errors.title) setErrors((prev) => { const n = { ...prev }; delete n.title; return n })
                }}
                placeholder="Briefly state the document purpose"
              />
            </Field>

            <Field
              label="Description / Purpose of Request"
              required
              error={errors.description}
              hint="Explain the purpose, context, and key details of your document request."
            >
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  if (errors.description) setErrors((prev) => { const n = { ...prev }; delete n.description; return n })
                }}
                placeholder="Provide any additional context or remarks (optional)..."
              />
            </Field>
          </div>
        </Card>

        {/* Step 3: Required Attachments Checklist & Automatic Completeness Check (REQ-REQT-2, REQ-REQT-3, REQ-REQT-7) */}
        {selectedType && (
          <Card className="p-5 sm:p-6">
            <CardHeader
              title="3. Required Forms & Automatic Completeness Check"
              description="The system automatically verifies that all required forms are uploaded before your request is sent to the College Secretary. Accepted formats: PDF, JPG, PNG (max 20 MB per file)."
            />

            {/* Live Automatic Completeness Indicator (REQ-REQT-3) */}
            <div
              className={`mt-4 rounded-xl p-4 text-xs ring-1 ring-inset transition-all ${
                allRequiredAttached
                  ? 'bg-success-50 text-success-800 ring-success-200'
                  : 'bg-amber-50/70 text-amber-900 ring-amber-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <FileCheck2 className={`size-4.5 shrink-0 ${allRequiredAttached ? 'text-success-600' : 'text-amber-600'}`} aria-hidden />
                  <div>
                    <p className="font-bold text-sm">
                      {allRequiredAttached
                        ? `Automatic Completeness Check: Passed (${attachedRequiredCount} of ${requiredList.length} Required Forms Attached)`
                        : `Automatic Completeness Check: Incomplete (${attachedRequiredCount} of ${requiredList.length} Required Forms Attached)`}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {allRequiredAttached
                        ? 'All required forms for this document type have been uploaded. Complete result is verified.'
                        : `Missing required attachments detected. Incomplete requests cannot advance to the College Secretary.`}
                    </p>
                  </div>
                </div>
                <Badge tone={allRequiredAttached ? 'success' : 'warning'} dot={false}>
                  {allRequiredAttached ? 'Complete Result: Ready' : 'Incomplete: Cannot Advance'}
                </Badge>
              </div>

              {/* Complete Result Summary Breakdown */}
              {allRequiredAttached && (
                <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-success-200 text-ink-800">
                  <p className="font-semibold text-success-800 flex items-center gap-1.5 text-2xs uppercase tracking-wider">
                    <CheckCircle2 className="size-3.5 text-success-600" />
                    Verified Required Checklist Items:
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {requiredList.map((r) => {
                      const attached = attachedFiles.find((f) => f.requirementId === r.id)
                      return (
                        <li key={r.id} className="flex items-center justify-between gap-2 text-ink-700">
                          <span className="font-medium">• {r.label}</span>
                          <span className="font-mono text-2xs text-success-700 bg-success-50 px-2 py-0.5 rounded border border-success-200">
                            ✓ {attached?.name} ({attached ? (attached.sizeKb >= 1024 ? `${(attached.sizeKb / 1024).toFixed(1)} MB` : `${attached.sizeKb} KB`) : ''})
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Missing items listed explicitly when attempted or missing (Acceptance Criteria: missing items are listed) */}
            {(hasAttemptedSubmit || mandatoryMissing.length > 0) && missingItemsSummary.length > 0 && (
              <div className="mt-4 rounded-xl bg-danger-50 p-4 text-xs font-medium text-danger-900 ring-1 ring-inset ring-danger-200" role="alert">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger-600" aria-hidden />
                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="font-bold text-sm text-danger-900">Missing Required Items Detected</p>
                      <p className="text-danger-700 text-xs">
                        The system checks required fields and files against <strong>{selectedType.name}</strong> before submission. The following items must be provided before your request can advance:
                      </p>
                    </div>
                    <ul className="list-inside list-disc space-y-1 rounded-lg bg-white/80 p-2.5 text-xs text-danger-800 border border-danger-200">
                      {missingItemsSummary.map((item, idx) => (
                        <li key={idx} className="font-medium">
                          {item}
                        </li>
                      ))}
                    </ul>
                    <p className="text-2xs text-danger-700 italic">
                      Incomplete requests cannot advance to the College Secretary until all items are attached.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-4">
              {selectedType.requirements.map((req) => {
                const attached = attachedFiles.find((f) => f.requirementId === req.id)
                const hasError = !!fileErrors[req.id] || (errors.attachments && req.required && !attached)
                return (
                  <div
                    key={req.id}
                    className={`rounded-xl border p-4 transition-all ${
                      attached
                        ? 'border-success-200 bg-success-50/30'
                        : hasError
                        ? 'border-danger-300 bg-danger-50/20'
                        : req.required
                        ? 'border-brand-200 bg-white hover:border-brand-300'
                        : 'border-ink-200 bg-ink-50/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 max-w-xl">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-ink-900">{req.label}</p>
                          <Badge tone={req.required ? 'brand' : 'neutral'} dot={false}>
                            {req.required ? 'Required' : 'Optional'}
                          </Badge>
                          {attached && (
                            <Badge tone="success" dot={false}>
                              Attached
                            </Badge>
                          )}
                        </div>
                        {req.why && <p className="mt-1 text-xs text-ink-600">{req.why}</p>}
                        {req.source && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-brand-700">
                            <Info className="size-3.5 shrink-0" aria-hidden />
                            Where to get it: {req.source}
                          </p>
                        )}
                      </div>

                      {/* File Upload Action */}
                      <div className="flex shrink-0 items-center gap-2">
                        {attached ? (
                          <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 shadow-xs ring-1 ring-success-200">
                            <CheckCircle2 className="size-4 text-success-600" aria-hidden />
                            <span className="max-w-[150px] truncate text-xs font-semibold text-ink-800" title={attached.name}>
                              {attached.name} ({attached.sizeKb >= 1024 ? `${(attached.sizeKb / 1024).toFixed(1)} MB` : `${attached.sizeKb} KB`})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setAttachedFiles((prev) => prev.filter((f) => f.requirementId !== req.id))
                                setFileErrors((prev) => {
                                  const next = { ...prev }
                                  delete next[req.id]
                                  return next
                                })
                              }}
                              className="text-ink-400 hover:text-danger-600"
                              aria-label="Remove attached file"
                            >
                              <X className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-100">
                            <UploadCloud className="size-3.5" aria-hidden />
                            Attach File (Max 20 MB)
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="sr-only"
                              onChange={(e) => handleFileChosen(e, req)}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Inline file validation error next to the requirement (REQ-SUB-4) */}
                    {fileErrors[req.id] && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-danger-50 p-2.5 text-xs text-danger-700 ring-1 ring-inset ring-danger-200" role="alert">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger-600" aria-hidden="true" />
                        <p>{fileErrors[req.id]}</p>
                      </div>
                    )}

                    {errors.attachments && req.required && !attached && !fileErrors[req.id] && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-danger-700">
                        <AlertCircle className="size-3.5 shrink-0 text-danger-600" aria-hidden="true" />
                        <span>This required form must be attached before submitting.</span>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* REQ-SUB-3: Multiple supporting documents upload */}
              <div className="pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-700 hover:underline">
                    <Paperclip className="size-4" aria-hidden />
                    Attach supporting documents (multiple files allowed, max 20 MB each)
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="sr-only"
                      onChange={(e) => handleFileChosen(e)}
                    />
                  </label>
                  <span className="text-2xs text-ink-500">PDF, JPG, PNG accepted</span>
                </div>

                {fileErrors['general'] && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-danger-50 p-2.5 text-xs text-danger-700 ring-1 ring-inset ring-danger-200" role="alert">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger-600" aria-hidden="true" />
                    <p>{fileErrors['general']}</p>
                  </div>
                )}
              </div>

              {/* Access Control & File Linking Summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50/70 p-3 text-2xs text-ink-600 ring-1 ring-inset ring-ink-100">
                <div className="flex items-center gap-1.5 font-medium text-ink-800">
                  <FileCheck2 className="size-3.5 text-brand-600" />
                  <span>Files linked to request: <strong>{attachedFiles.length}</strong> total digital {attachedFiles.length === 1 ? 'copy' : 'copies'}</span>
                </div>
                <span>🔒 Access-controlled: Viewable only by requester and authorized reviewing offices</span>
              </div>

              {/* Extra files list */}
              {attachedFiles.filter((f) => !f.requirementId).length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Additional Files</p>
                  <ul className="divide-y divide-ink-100 rounded-lg ring-1 ring-ink-100">
                    {attachedFiles
                      .map((f, i) => ({ f, i }))
                      .filter(({ f }) => !f.requirementId)
                      .map(({ f, i }) => (
                        <li key={i} className="flex items-center justify-between bg-white px-3 py-2 text-xs">
                          <span className="flex items-center gap-2 font-medium text-ink-800">
                            <FileText className="size-3.5 text-brand-600" aria-hidden />
                            {f.name} ({f.sizeKb} KB)
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="text-ink-400 hover:text-danger-600"
                            aria-label={`Remove ${f.name}`}
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Informative Submission Summary */}
        <div className="rounded-2xl bg-brand-50/70 p-5 ring-1 ring-inset ring-brand-100">
          <p className="text-sm font-bold text-brand-900">What happens after you submit?</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            Because the system automatically checks that all required files are present, the College Secretary focuses on verifying that the
            content inside your attachments is accurate and complete. Once verified, your document is routed automatically along the{' '}
            <strong>{user.origin ?? 'CESS'}</strong> approval path.
          </p>
        </div>

        {/* Form Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            {!isFormComplete ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                <AlertCircle className="size-3.5 shrink-0 text-amber-600" />
                <span>Incomplete: {missingItemsSummary.length} required item(s) needed before submission can advance</span>
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-success-700 bg-success-50 px-3 py-1.5 rounded-lg border border-success-200">
                <CheckCircle2 className="size-3.5 shrink-0 text-success-600" />
                <span>Completeness check passed: Ready to advance to College Secretary</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink
              to={user.role === 'ids_principal' ? '/app/for-review' : '/app/my-documents'}
              variant="secondary"
            >
              Cancel
            </ButtonLink>
            <Button
              type="submit"
              size="lg"
              loading={isSubmitting}
              loadingText="Submitting Request…"
              iconRight={Send}
            >
              Submit Document Request
            </Button>
          </div>
        </div>
      </form>
      {/* Submission Confirmation Modal (REQ-SUB-5, REQ-SUB-6, REQ-REC-1, REQ-REC-2) */}
      {submittedDoc && (
        <Dialog
          open={isConfirmModalOpen}
          onClose={() => {
            setIsConfirmModalOpen(false)
            navigate(`/app/documents/${submittedDoc.id}?submitted=true`)
          }}
          size="lg"
          title={
            <div className="flex items-center gap-2.5 text-success-800">
              <div className="flex size-9 items-center justify-center rounded-xl bg-success-100 text-success-700">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink-950">Document Request Submitted</h3>
                <p className="text-xs font-normal text-ink-500">Official submission confirmation & assigned tracking credentials</p>
              </div>
            </div>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsConfirmModalOpen(false)
                  navigate(`/app/my-documents?folder=${selectedTypeId}`)
                }}
              >
                Go to Document Repository
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsConfirmModalOpen(false)
                    setTitle('')
                    setDescription('')
                    setAttachedFiles([])
                    setErrors({})
                    setFileErrors({})
                    setHasAttemptedSubmit(false)
                    setSubmittedDoc(null)
                  }}
                >
                  Submit Another Request
                </Button>
                <Button
                  onClick={() => {
                    setIsConfirmModalOpen(false)
                    navigate(`/app/documents/${submittedDoc.id}?submitted=true`)
                  }}
                  iconRight={ArrowRight}
                >
                  Track Document & View Details
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Control Number Hero Card */}
            <div className="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50/70 via-white to-brand-50/30 p-5 text-center">
              <span className="text-2xs font-extrabold uppercase tracking-wider text-brand-700">
                Assigned Official Control Number (REQ-REC-2)
              </span>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2.5">
                <span className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-brand-950 selection:bg-brand-200">
                  {controlNumber(submittedDoc)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(controlNumber(submittedDoc))
                    toast.success('Control Number Copied', `Copied ${controlNumber(submittedDoc)} to clipboard.`)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-2xs ring-1 ring-brand-200 hover:bg-brand-50 transition-colors"
                  title="Copy Control Number"
                >
                  <Copy className="size-3.5" />
                  <span>Copy</span>
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-600">
                This unique Control Number has been registered in the CESS repository. Use it to follow up with the College Secretary or track progress.
              </p>
            </div>

            {/* Official Confirmation Summary Grid (REQ-SUB-5, REQ-SUB-6, REQ-REC-1) */}
            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
              <h4 className="text-2xs font-bold uppercase tracking-wider text-ink-500 mb-3">
                Official Submission Record Summary
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink-100">
                  <span className="text-ink-500 font-medium block">Initial Status</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone="brand" dot={false}>Submitted</Badge>
                    <span className="text-2xs text-ink-500">Awaiting Secretary verification</span>
                  </div>
                </div>

                <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink-100">
                  <span className="text-ink-500 font-medium block">Derived Institutional Origin</span>
                  <div className="mt-1 flex items-center gap-1.5 font-bold text-ink-900">
                    <Badge tone={submittedDoc.origin === 'IDS' ? 'warning' : 'brand'} dot={false}>
                      {submittedDoc.origin}
                    </Badge>
                    <span className="text-2xs font-normal text-ink-500">
                      Derived from {user.department}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink-100">
                  <span className="text-ink-500 font-medium block">Automatic Timestamp</span>
                  <span className="mt-1 font-semibold text-ink-900 block font-mono text-2xs">
                    {formatDateTime(submittedDoc.submittedAt)}
                  </span>
                </div>

                <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink-100">
                  <span className="text-ink-500 font-medium block">Revision Number</span>
                  <span className="mt-1 font-mono font-semibold text-ink-900 block">
                    Revision {String(submittedDoc.revision).padStart(2, '0')} (Initial Submission)
                  </span>
                </div>

                <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink-100 sm:col-span-2">
                  <span className="text-ink-500 font-medium block">Document Type & Title</span>
                  <p className="mt-0.5 font-bold text-ink-900">
                    {selectedType?.name}: <span className="font-semibold text-ink-700">“{submittedDoc.title}”</span>
                  </p>
                </div>

                <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink-100 sm:col-span-2">
                  <span className="text-ink-500 font-medium block">Attached Digital Copies</span>
                  <p className="mt-0.5 text-ink-700">
                    <strong>{submittedDoc.attachments.length}</strong> digital file(s) linked and access-controlled in repository.
                  </p>
                </div>
              </div>
            </div>

            {/* Informative Guidance */}
            <div className="rounded-xl bg-brand-50/70 p-3.5 text-xs text-brand-900 ring-1 ring-inset ring-brand-100 flex items-start gap-2.5">
              <Info className="size-4 shrink-0 text-brand-600 mt-0.5" />
              <div>
                <p className="font-semibold">Next Step: Content Verification</p>
                <p className="mt-0.5 text-ink-600 text-2xs leading-relaxed">
                  The College Secretary will verify the information inside your attachments. Once verified, your request will automatically proceed along the{' '}
                  <strong>{submittedDoc.origin}</strong> routing path. You can find this request anytime in your Document Repository under <strong>{selectedType?.name}</strong>.
                </p>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
