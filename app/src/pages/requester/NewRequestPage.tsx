import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
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
import { sessionFiles } from '../../components/documents'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, ButtonLink, Card, CardHeader, PageHeader } from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { ACCEPTED_EXT, MAX_FILE_MB, type NewFile } from '../../data/engine'
import { api, useDb } from '../../data/store'
import type { DocumentType, Requirement } from '../../data/types'

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
  const types = db.documentTypes.filter((t) => t.audience === user.role)

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
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Handle switching document type
  const handleTypeChange = (newTypeId: string) => {
    setSelectedTypeId(newTypeId)
    setAttachedFiles([])
    setErrors({})
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
      '3. Save or scan the completed form as PDF, JPG, or PNG (max 10 MB) and upload it in CESS DocuFlow.',
    ])
    toast.info('Template Downloaded', `Downloaded ${fileName}. Fill it in and attach it below.`)
  }

  // File selection for a specific requirement or general attachment
  const handleFileChosen = (e: ChangeEvent<HTMLInputElement>, req?: Requirement) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    const file = fileList[0]
    const sizeKb = Math.round(file.size / 1024)

    // Validation (REQ-SUB-3, REQ-SUB-4)
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
    if (!ACCEPTED_EXT.includes(ext)) {
      toast.error('Unsupported file format', `“${file.name}” isn't supported. Please attach a PDF, JPG, or PNG file.`)
      e.target.value = ''
      return
    }

    if (sizeKb > MAX_FILE_MB * 1024) {
      toast.error('File exceeds size limit', `“${file.name}” is larger than 10 MB. Please attach a compressed version.`)
      e.target.value = ''
      return
    }

    // Replace if requirement already has an attached file, or append
    setAttachedFiles((prev) => {
      const filtered = req ? prev.filter((f) => f.requirementId !== req.id) : prev
      return [
        ...filtered,
        {
          requirementId: req?.id,
          name: file.name,
          sizeKb,
          fileObj: file,
        },
      ]
    })

    // Clear attachment error once user uploads files
    setErrors((prev) => {
      const next = { ...prev }
      delete next.attachments
      return next
    })

    // Reset input so user can choose same file if re-selected
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const requiredList = selectedType ? selectedType.requirements.filter((r) => r.required) : []
  const attachedRequiredCount = requiredList.filter((r) => attachedFiles.some((f) => f.requirementId === r.id)).length
  const allRequiredAttached = requiredList.length > 0 && attachedRequiredCount === requiredList.length

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedType) return

    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = 'Please enter a title or brief summary for this request.'
    }

    // Automatic completeness check before submission reaches the College Secretary (REQ-REQT-3)
    const mandatoryMissing = selectedType.requirements.filter(
      (r) => r.required && !attachedFiles.some((f) => f.requirementId === r.id),
    )

    if (mandatoryMissing.length > 0) {
      newErrors.attachments = `Automatic completeness check: Please attach all required forms before submitting (${mandatoryMissing.map((m) => m.label).join(', ')}).`
    }

    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
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

      toast.success(
        'Request Submitted Successfully',
        'Automatic completeness check passed! Your request is now with the College Secretary for content verification.',
      )
      navigate(`/app/documents/${doc.id}`)
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
        to={selectedTypeId ? `/app/my-documents?folder=${selectedTypeId}` : '/app/my-documents'}
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
                      <span>Origin: {user.origin ?? 'CESS'}</span>
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
            title="2. Request Details"
            description="Give your request a clear, specific title so reviewing offices understand your purpose immediately."
          />
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 rounded-xl bg-ink-50/60 p-3.5 text-xs text-ink-600 ring-1 ring-inset ring-ink-100 sm:grid-cols-3">
              <div>
                <span className="font-semibold text-ink-500">Requester:</span>{' '}
                <span className="font-bold text-ink-900">{user.name}</span>
              </div>
              <div>
                <span className="font-semibold text-ink-500">Department:</span>{' '}
                <span className="font-medium text-ink-800">{user.department}</span>
              </div>
              <div>
                <span className="font-semibold text-ink-500">Origin Route:</span>{' '}
                <span className="font-medium text-ink-800">{user.origin === 'IDS' ? 'IDS Route' : 'CESS Route'}</span>
              </div>
            </div>

            {/* Explicit Faculty Affiliation & Routing Path Notice (REQ-PM-FEEDBACK-2) */}
            {user.role === 'faculty' && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand-950">
                      {user.origin === 'IDS' ? 'IDS Faculty Submission' : 'CESS Faculty Submission'}
                    </span>
                    <Badge tone={user.origin === 'IDS' ? 'warning' : 'brand'} dot={false}>
                      {user.origin === 'IDS' ? 'Integrated Developmental School' : 'College of Education and Social Sciences'}
                    </Badge>
                  </div>
                  <span className="font-mono text-2xs text-brand-700">
                    Routing Unit: {user.origin ?? 'CESS'}
                  </span>
                </div>
                <div className="mt-2.5 rounded-lg bg-white p-2.5 ring-1 ring-brand-100 text-ink-700">
                  <span className="font-semibold text-ink-900">Official Routing Path: </span>
                  {user.origin === 'IDS' ? (
                    <span>
                      College Secretary Check → Chairperson →{' '}
                      <strong className="text-warning-800 underline decoration-warning-400">IDS Principal (Review)</strong>{' '}
                      → College Dean → Release
                    </span>
                  ) : (
                    <span>College Secretary Check → Chairperson → College Dean → Release</span>
                  )}
                </div>
                {user.origin === 'IDS' && (
                  <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-500">
                    <Info className="size-3 shrink-0 text-brand-600 mt-0.5" />
                    <span>As an IDS faculty member, your document will route through the IDS Principal before Dean’s endorsement.</span>
                  </p>
                )}
              </div>
            )}

            <Field
              label="Title or Subject"
              required
              error={errors.title}
              hint="Example: Travel to Regional Science Conference in CDO, or Thesis Title Approval — Grade 10 English."
            >
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Briefly state the document purpose"
              />
            </Field>

            <Field
              label="Short Description / Additional Notes"
              optional
              hint="Any relevant details that could assist the College Secretary and reviewers."
            >
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
              description="The system automatically verifies that all required forms are uploaded before your request is sent to the College Secretary. Accepted formats: PDF, JPG, PNG (max 10 MB per file)."
            />

            {/* Live Automatic Completeness Indicator (REQ-REQT-3) */}
            <div
              className={`mt-4 flex items-center justify-between gap-3 rounded-xl p-3.5 text-xs ring-1 ring-inset ${
                allRequiredAttached
                  ? 'bg-success-50 text-success-700 ring-success-100'
                  : 'bg-brand-50/60 text-brand-800 ring-brand-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="size-4 shrink-0" aria-hidden />
                <span className="font-semibold">
                  {allRequiredAttached
                    ? `Automatic Completeness Check Passed — all ${requiredList.length} required form(s) are attached.`
                    : `Automatic Completeness Check: ${attachedRequiredCount} of ${requiredList.length} required form(s) attached.`}
                </span>
              </div>
              <Badge tone={allRequiredAttached ? 'success' : 'brand'} dot={false}>
                {allRequiredAttached ? 'Ready to Submit' : 'Attachments Needed'}
              </Badge>
            </div>

            {errors.attachments && (
              <div className="mt-4 rounded-xl bg-danger-50 p-4 text-sm font-medium text-danger-700 ring-1 ring-inset ring-danger-100">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger-600" aria-hidden />
                  <p>{errors.attachments}</p>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-4">
              {selectedType.requirements.map((req) => {
                const attached = attachedFiles.find((f) => f.requirementId === req.id)
                return (
                  <div
                    key={req.id}
                    className={`rounded-xl border p-4 transition-all ${
                      attached
                        ? 'border-success-200 bg-success-50/30'
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
                            <span className="max-w-[150px] truncate text-xs font-semibold text-ink-800">
                              {attached.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.requirementId !== req.id))}
                              className="text-ink-400 hover:text-danger-600"
                              aria-label="Remove attached file"
                            >
                              <X className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-100">
                            <UploadCloud className="size-3.5" aria-hidden />
                            Attach File
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
                  </div>
                )
              })}

              {/* Additional optional attachments */}
              <div className="pt-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-700 hover:underline">
                  <Paperclip className="size-4" aria-hidden />
                  Attach an extra supporting document (optional)
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => handleFileChosen(e)}
                  />
                </label>
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
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <ButtonLink to="/app/my-documents" variant="secondary">
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
      </form>
    </div>
  )
}
