import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  School,
  Send,
  UploadCloud,
} from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import {
  DelayedBadge,
  DocumentList,
  FilterBar,
  StatusBadge,
  WaitingTime,
  exportDocumentsCsv,
  sessionFiles,
  useDocumentFilters,
} from '../../components/documents'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, cn } from '../../components/ui'
import {
  OFFICE_LABEL,
  controlNumber,
  revisionLabel,
} from '../../content/language'
import { ACCEPTED_EXT, MAX_FILE_MB, type NewFile } from '../../data/engine'
import { isDelayed, userById, visibleDocuments } from '../../data/selectors'
import { api, useDb } from '../../data/store'
import type { DocumentType, Requirement } from '../../data/types'
import { formatDate } from '../../lib/time'

export function AllDocumentsPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const navigate = useNavigate()

  // Base list of unarchived documents
  const allActiveDocs = visibleDocuments(db, user).filter((d) => !d.archived)

  // Unit split: CESS vs IDS (REQ-PM-FEEDBACK-4)
  const [unitTab, setUnitTab] = useState<'CESS' | 'IDS'>('CESS')
  const unitDocs = allActiveDocs.filter((d) => (d.origin ?? 'CESS') === unitTab)

  // Secondary view: Folders vs Table
  const [viewMode, setViewMode] = useState<'folders' | 'table'>('folders')
  const [selectedFolderTypeId, setSelectedFolderTypeId] = useState<string | null>(null)

  // FilterBar state for Table View
  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, unitDocs, 'oldest')

  // Available document types for this unit
  const unitTypes = db.documentTypes.filter((t) => {
    if (unitTab === 'IDS') {
      return (t.idsRoute && t.idsRoute.length > 0) || t.audience === 'faculty'
    }
    return t.audience === 'student' || t.audience === 'faculty'
  })

  const selectedFolderType: DocumentType | undefined = unitTypes.find(
    (t) => t.id === selectedFolderTypeId,
  )

  // Walk-in encoding dialog state (REQ-REC-8)
  const requesters = db.users.filter(
    (u) => (u.role === 'student' || u.role === 'faculty') && u.active,
  )
  const [isWalkInOpen, setIsWalkInOpen] = useState(false)
  const [requesterId, setRequesterId] = useState(requesters[0]?.id ?? '')
  const selectedRequester = requesters.find((u) => u.id === requesterId)
  const availableTypes = db.documentTypes.filter(
    (t) => !selectedRequester || t.audience === selectedRequester.role,
  )
  const [typeId, setTypeId] = useState(availableTypes[0]?.id ?? '')
  const selectedType = availableTypes.find((t) => t.id === typeId) ?? availableTypes[0]

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<
    { requirementId?: string; name: string; sizeKb: number; fileObj?: File }[]
  >([])
  const [walkInBusy, setWalkInBusy] = useState(false)
  const [walkInErrors, setWalkInErrors] = useState<{ title?: string; files?: string }>({})

  const handleOpenWalkIn = (preselectedTypeId?: string) => {
    const firstReq = requesters[0]
    setRequesterId(firstReq?.id ?? '')
    const firstTypes = db.documentTypes.filter((t) => !firstReq || t.audience === firstReq.role)
    setTypeId(preselectedTypeId ?? firstTypes[0]?.id ?? '')
    setTitle('')
    setDescription('')
    setAttachedFiles([])
    setWalkInErrors({})
    setIsWalkInOpen(true)
  }

  const handleRequesterChange = (newReqId: string) => {
    setRequesterId(newReqId)
    const req = requesters.find((u) => u.id === newReqId)
    const nextTypes = db.documentTypes.filter((t) => !req || t.audience === req.role)
    setTypeId(nextTypes[0]?.id ?? '')
    setAttachedFiles([])
    setWalkInErrors({})
  }

  const handleFileChosen = (e: ChangeEvent<HTMLInputElement>, req?: Requirement) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]
    const sizeKb = Math.round(file.size / 1024)
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
    if (!ACCEPTED_EXT.includes(ext)) {
      toast.error('Unsupported File Type', 'Please attach a PDF, JPG, or PNG file.')
      e.target.value = ''
      return
    }
    if (sizeKb > MAX_FILE_MB * 1024) {
      toast.error('File Too Large', 'Please upload a file smaller than 10 MB.')
      e.target.value = ''
      return
    }
    setAttachedFiles((prev) => {
      const filtered = req ? prev.filter((f) => f.requirementId !== req.id) : prev
      return [...filtered, { requirementId: req?.id, name: file.name, sizeKb, fileObj: file }]
    })
    setWalkInErrors((prev) => ({ ...prev, files: undefined }))
    e.target.value = ''
  }

  const handleWalkInSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedType || !selectedRequester) return

    const errs: { title?: string; files?: string } = {}
    if (!title.trim()) {
      errs.title = 'Please enter a title or subject for this walk-in document.'
    }
    const missingReqs = (selectedType.requirements ?? []).filter(
      (r) => r.required && !attachedFiles.some((f) => f.requirementId === r.id),
    )
    if (missingReqs.length > 0) {
      errs.files = `Missing required attachment: ${missingReqs.map((r) => r.label).join(', ')}`
    }

    if (errs.title || errs.files) {
      setWalkInErrors(errs)
      toast.error(
        'Submission Incomplete',
        errs.title ?? errs.files ?? 'Please provide all required walk-in information.',
      )
      return
    }

    setWalkInErrors({})
    setWalkInBusy(true)
    try {
      const payloadFiles: NewFile[] = attachedFiles.map((f) => ({
        requirementId: f.requirementId,
        name: f.name,
        sizeKb: f.sizeKb,
      }))

      const doc = await api.encodeWalkInRequest(user, {
        requesterId: selectedRequester.id,
        typeId: selectedType.id,
        title: title.trim(),
        description: description.trim(),
        files: payloadFiles,
      })

      attachedFiles.forEach((f, idx) => {
        if (f.fileObj && doc.attachments[idx]) {
          sessionFiles.set(doc.attachments[idx].id, URL.createObjectURL(f.fileObj))
        }
      })
      toast.success(
        'Walk-In Document Encoded',
        `Created record ${doc.controlBase}-REV00 marked as encoded by the College Secretary.`,
      )
      setIsWalkInOpen(false)
      navigate(`/app/documents/${doc.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to encode walk-in document.'
      toast.error('Encoding Failed', msg)
    } finally {
      setWalkInBusy(false)
    }
  }

  const cessCount = allActiveDocs.filter((d) => (d.origin ?? 'CESS') === 'CESS').length
  const idsCount = allActiveDocs.filter((d) => d.origin === 'IDS').length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Central Repository"
        title="Central Document Repository"
        description="Master registry for CESS and IDS documents. Browse folders or search records."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => {
                exportDocumentsCsv(db, unitDocs, `${unitTab}_DocuFlow_Records`)
                toast.info('Records Exported', `Exported ${unitDocs.length} ${unitTab} record(s) to CSV.`)
              }}
            >
              Export {unitTab} CSV ({unitDocs.length})
            </Button>
            <Button onClick={() => handleOpenWalkIn()} icon={FilePlus2}>
              Encode Walk-In Document
            </Button>
          </div>
        }
      />

      {/* PRIMARY UNIT TABS: CESS vs. IDS (REQ-PM-FEEDBACK-4) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-4">
        <Segmented<'CESS' | 'IDS'>
          label="Select Unit"
          value={unitTab}
          onChange={(newUnit) => {
            setUnitTab(newUnit)
            setSelectedFolderTypeId(null) // reset folder drill-down when switching unit
          }}
          options={[
            {
              value: 'CESS',
              label: 'CESS Documents (College)',
              icon: Building2,
              count: cessCount,
            },
            {
              value: 'IDS',
              label: 'IDS Documents',
              icon: School,
              count: idsCount,
            },
          ]}
        />

        {!selectedFolderTypeId && (
          <Segmented<'folders' | 'table'>
            label="Repository Layout"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'folders', label: 'Folders by Document Type', count: unitTypes.length },
              { value: 'table', label: 'Full Registry Table', count: unitDocs.length },
            ]}
          />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CASE A: A Specific Document Type Folder is Opened                  */}
      {/* ------------------------------------------------------------------ */}
      {selectedFolderType ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedFolderTypeId(null)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back to all {unitTab} folders
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-ink-500">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => setSelectedFolderTypeId(null)}
              >
                {unitTab} Folders
              </span>
              <span>/</span>
              <span className="font-bold text-ink-900">{selectedFolderType.name}</span>
            </div>
          </div>

          {/* Folder Details Banner */}
          <Card className="overflow-hidden border-brand-200 bg-gradient-to-b from-brand-50/60 to-white">
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
                      <Folder className="size-6" />
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase tracking-wider text-brand-700">
                        {unitTab} Records Folder
                      </span>
                      <h2 className="text-xl font-extrabold text-brand-950 sm:text-2xl">
                        {selectedFolderType.name}
                      </h2>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-ink-700">
                    {selectedFolderType.summary}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-600">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-semibold text-ink-800 ring-1 ring-ink-200">
                      <Clock className="size-3.5 text-brand-600" />
                      Turnaround: {selectedFolderType.processingDays[0]}–{selectedFolderType.processingDays[1]} working days
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-ink-700 ring-1 ring-ink-200">
                      Routing:{' '}
                      <strong className="font-semibold text-ink-900">
                        Secretary →{' '}
                        {(unitTab === 'IDS'
                          ? (selectedFolderType.idsRoute && selectedFolderType.idsRoute.length > 0
                              ? selectedFolderType.idsRoute
                              : ['chairperson', 'ids_principal', 'dean'])
                          : (selectedFolderType.cessRoute && selectedFolderType.cessRoute.length > 0
                              ? selectedFolderType.cessRoute
                              : ['chairperson', 'dean'])
                        )
                          .map((r) => OFFICE_LABEL[r as keyof typeof OFFICE_LABEL] || r)
                          .join(' → ')}{' '}
                        → Release
                      </strong>
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => handleOpenWalkIn(selectedFolderType.id)}
                  icon={FilePlus2}
                >
                  Encode Walk-In for this Type
                </Button>
              </div>
            </div>
          </Card>

          {/* Submissions inside this Folder */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  {unitTab} Submissions in this Folder
                </h3>
                <p className="text-xs text-ink-500">
                  All active requests under {selectedFolderType.name} from {unitTab}
                </p>
              </div>
              <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
                {unitDocs.filter((d) => d.typeId === selectedFolderType.id).length} record(s)
              </span>
            </div>

            {(() => {
              const typeDocs = unitDocs.filter((d) => d.typeId === selectedFolderType.id)
              if (typeDocs.length === 0) {
                return (
                  <Card className="p-8">
                    <EmptyState
                      icon={FolderOpen}
                      title={`No active ${selectedFolderType.name} records for ${unitTab}`}
                      action={
                        <Button
                          onClick={() => handleOpenWalkIn(selectedFolderType.id)}
                          icon={FilePlus2}
                        >
                          Encode Walk-In Document
                        </Button>
                      }
                    >
                      There are currently no active document requests under this category in the {unitTab} registry.
                    </EmptyState>
                  </Card>
                )
              }

              return (
                <div className="grid gap-3 sm:grid-cols-1">
                  {typeDocs.map((doc) => {
                    const delayed = isDelayed(db, doc)
                    const req = userById(db, doc.requesterId)
                    return (
                      <Card
                        key={doc.id}
                        className={cn(
                          'p-5 transition-all hover:border-brand-300 hover:shadow-xs',
                          doc.status === 'submitted' && 'border-warning-300 bg-warning-50/20',
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-ink-600">
                                {controlNumber(doc)}
                              </span>
                              <Badge tone="neutral" dot={false}>
                                {revisionLabel(doc.revision)}
                              </Badge>
                              <span className="text-xs font-semibold text-ink-800">
                                {req?.name} ({req?.department})
                              </span>
                              <span className="text-xs text-ink-500">
                                · Submitted {formatDate(doc.submittedAt)}
                              </span>
                              {doc.encodedBySecretary && (
                                <Badge tone="brand" dot={false}>
                                  Walk-in Encoded
                                </Badge>
                              )}
                            </div>

                            <Link
                              to={`/app/documents/${doc.id}`}
                              className="mt-2 block text-lg font-bold text-ink-950 hover:text-brand-700 hover:underline"
                            >
                              {doc.title}
                            </Link>

                            {doc.description && (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
                                {doc.description}
                              </p>
                            )}

                            {doc.status === 'submitted' && (
                              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-800 ring-1 ring-inset ring-warning-200">
                                <AlertTriangle className="size-3.5 shrink-0 text-warning-700" />
                                <span>Needs content check and routing</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <StatusBadge doc={doc} audience="staff" db={db} />
                            {delayed && <DelayedBadge audience="staff" />}
                            <WaitingTime doc={doc} />

                            <Link
                              to={`/app/documents/${doc.id}`}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                            >
                              Inspect & Route <ArrowRight className="size-3" />
                            </Link>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------ */
        /* CASE B: Main Unit Repository (Folders vs Table View)               */
        /* ------------------------------------------------------------------ */
        <div className="space-y-6">
          {/* VIEW 1: CATEGORY FOLDERS */}
          {viewMode === 'folders' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {unitTypes.map((t) => {
                const typeDocs = unitDocs.filter((d) => d.typeId === t.id)
                const toCheckCount = typeDocs.filter((d) => d.status === 'submitted').length
                const inReviewCount = typeDocs.filter((d) => d.status === 'with_office').length
                const readyCount = typeDocs.filter((d) => d.status === 'ready').length

                return (
                  <Card
                    key={t.id}
                    className="group flex flex-col justify-between overflow-hidden border-ink-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
                  >
                    <div className="p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div
                          onClick={() => setSelectedFolderTypeId(t.id)}
                          className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200/60 transition-transform group-hover:scale-105 group-hover:bg-brand-600 group-hover:text-white"
                        >
                          <Folder className="size-6" />
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {toCheckCount > 0 && (
                            <Badge tone="warning" dot={false}>
                              {toCheckCount} To Check
                            </Badge>
                          )}
                          {inReviewCount > 0 && (
                            <Badge tone="brand" dot={false}>
                              {inReviewCount} In Review
                            </Badge>
                          )}
                          {readyCount > 0 && (
                            <Badge tone="success" dot={false}>
                              {readyCount} Ready
                            </Badge>
                          )}
                          <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
                            {typeDocs.length === 1 ? '1 record' : `${typeDocs.length} records`}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <h3
                          onClick={() => setSelectedFolderTypeId(t.id)}
                          className="cursor-pointer text-base font-bold text-ink-950 transition-colors group-hover:text-brand-800"
                        >
                          {t.name}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
                          {t.summary}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-2xs text-ink-500">
                        <Clock className="size-3.5 text-brand-600" />
                        <span>
                          Turnaround: {t.processingDays[0]}–{t.processingDays[1]} working days ·{' '}
                          {unitTab} Origin
                        </span>
                      </div>
                    </div>

                    {/* Folder Card Actions */}
                    <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-5 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedFolderTypeId(t.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
                      >
                        Open Folder <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenWalkIn(t.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-2xs ring-1 ring-ink-200 hover:bg-brand-50"
                      >
                        <FilePlus2 className="size-3 text-brand-600" /> Encode Walk-In
                      </button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* VIEW 2: FLAT TABLE SEARCH & EXPORT */}
          {viewMode === 'table' && (
            <Card>
              <FilterBar
                db={db}
                filters={filters}
                setFilters={setFilters}
                showOffice
                audience="all"
                searchLabel={`Search ${unitTab} records by title, control number, or requester…`}
              />

              <DocumentList
                db={db}
                docs={result}
                audience="staff"
                showRequester
                showWaiting
                filteredEmpty={active ? { onClear: clear } : null}
                empty={
                  <EmptyState
                    icon={Files}
                    title={`No active ${unitTab} documents in the repository`}
                  >
                    Document requests submitted for {unitTab} will appear here.
                  </EmptyState>
                }
              />
            </Card>
          )}
        </div>
      )}

      {/* Walk-In Document Encoding Dialog (REQ-REC-8) */}
      <Dialog
        open={isWalkInOpen}
        onClose={() => setIsWalkInOpen(false)}
        size="lg"
        title="Encode Document Received in Person (REQ-REC-8)"
        description="Create an official CESS DocuFlow record for a physical document packet submitted at the counter. The record will be marked as encoded by the College Secretary."
        busy={walkInBusy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsWalkInOpen(false)}
              disabled={walkInBusy}
            >
              Cancel
            </Button>
            <Button onClick={handleWalkInSubmit} loading={walkInBusy} icon={Send}>
              Encode & Save Record
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Requester (Student or Faculty)" required>
              <Select
                value={requesterId}
                onChange={(e) => handleRequesterChange(e.target.value)}
                className="w-full"
              >
                {requesters.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'student' ? 'Student' : `Faculty - ${u.origin ?? 'CESS'}`})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Document Type" required>
              <Select
                value={typeId}
                onChange={(e) => {
                  setTypeId(e.target.value)
                  setAttachedFiles([])
                }}
                className="w-full"
              >
                {availableTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Title or Subject"
            required
            error={walkInErrors.title}
            hint="A clear title identifying the paper packet (e.g. Leave Application — First Semester)."
          >
            <Input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (walkInErrors.title) setWalkInErrors((prev) => ({ ...prev, title: undefined }))
              }}
              placeholder="Enter specific subject / title"
            />
          </Field>

          <Field label="Description or Purpose" optional>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes on the submitted packet..."
            />
          </Field>

          {/* Attachments Section */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-ink-800">
                Attach Physical Document Scans
              </label>
              {walkInErrors.files && (
                <p role="alert" className="text-2xs font-semibold text-danger-700">
                  {walkInErrors.files}
                </p>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {selectedType?.requirements.map((req) => {
                const attached = attachedFiles.find((f) => f.requirementId === req.id)
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50/50 p-2.5 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-ink-900">{req.label}</span>
                      {req.required ? (
                        <span className="ml-1 text-danger-600">*</span>
                      ) : (
                        <span className="ml-1 text-ink-400">(optional)</span>
                      )}
                      {attached ? (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-success-700">
                          <CheckCircle2 className="size-3 shrink-0" />
                          <span>{attached.name} ({attached.sizeKb} KB)</span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-2xs text-ink-500">Not uploaded</p>
                      )}
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-2xs ring-1 ring-ink-200 hover:bg-brand-50">
                      <UploadCloud className="size-3.5" />
                      {attached ? 'Replace' : 'Attach Scan'}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="sr-only"
                        onChange={(e) => handleFileChosen(e, req)}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
