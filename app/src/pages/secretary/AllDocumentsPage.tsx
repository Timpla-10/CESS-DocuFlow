import {
  CheckCircle2,
  Download,
  FilePlus2,
  Files,
  Send,
  UploadCloud,
  X,
} from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import {
  DocumentList,
  FilterBar,
  exportDocumentsCsv,
  sessionFiles,
  useDocumentFilters,
} from '../../components/documents'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { ACCEPTED_EXT, MAX_FILE_MB, type NewFile } from '../../data/engine'
import { visibleDocuments } from '../../data/selectors'
import { api, useDb } from '../../data/store'
import type { Requirement } from '../../data/types'

export function AllDocumentsPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const navigate = useNavigate()

  const docs = visibleDocuments(db, user).filter((d) => !d.archived)
  // REQ-ORD-1: Oldest request first by default
  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, docs, 'oldest')

  // Walk-in encoding dialog state (REQ-REC-8)
  const requesters = db.users.filter((u) => (u.role === 'student' || u.role === 'faculty') && u.active)
  const [isWalkInOpen, setIsWalkInOpen] = useState(false)
  const [requesterId, setRequesterId] = useState(requesters[0]?.id ?? '')
  const selectedRequester = requesters.find((u) => u.id === requesterId)
  const availableTypes = db.documentTypes.filter((t) => !selectedRequester || t.audience === selectedRequester.role)
  const [typeId, setTypeId] = useState(availableTypes[0]?.id ?? '')
  const selectedType = availableTypes.find((t) => t.id === typeId) ?? availableTypes[0]

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<{ requirementId?: string; name: string; sizeKb: number; fileObj?: File }[]>([])
  const [walkInBusy, setWalkInBusy] = useState(false)

  const handleOpenWalkIn = () => {
    const firstReq = requesters[0]
    setRequesterId(firstReq?.id ?? '')
    const firstTypes = db.documentTypes.filter((t) => !firstReq || t.audience === firstReq.role)
    setTypeId(firstTypes[0]?.id ?? '')
    setTitle('')
    setDescription('')
    setAttachedFiles([])
    setIsWalkInOpen(true)
  }

  const handleRequesterChange = (newReqId: string) => {
    setRequesterId(newReqId)
    const req = requesters.find((u) => u.id === newReqId)
    const nextTypes = db.documentTypes.filter((t) => !req || t.audience === req.role)
    setTypeId(nextTypes[0]?.id ?? '')
    setAttachedFiles([])
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
    e.target.value = ''
  }

  const handleWalkInSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedType || !selectedRequester) return
    if (!title.trim()) {
      toast.error('Missing Title', 'Please enter a title or subject for the walk-in document.')
      return
    }

    // For walk-in encoding, if the Secretary didn't upload a physical file for a required item,
    // allow auto-generating a placeholder scan record or using the uploaded files.
    const filesPayload: NewFile[] = [...attachedFiles]
    for (const r of selectedType.requirements) {
      if (r.required && !filesPayload.some((f) => f.requirementId === r.id)) {
        filesPayload.push({
          requirementId: r.id,
          name: `${r.label.replace(/[^a-zA-Z0-9]+/g, '_')}_WalkIn_Scan.pdf`,
          sizeKb: 380,
        })
      }
    }

    setWalkInBusy(true)
    try {
      const doc = await api.encodeWalkInRequest(user, {
        requesterId: selectedRequester.id,
        typeId: selectedType.id,
        title: title.trim(),
        description: description.trim(),
        files: filesPayload,
      })
      attachedFiles.forEach((f) => {
        const match = doc.attachments.find((a) => a.name === f.name)
        if (f.fileObj && match) {
          sessionFiles.set(match.id, URL.createObjectURL(f.fileObj))
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Central Repository"
        title="All Active Documents"
        description="A complete master registry of all active document requests across the College of Education and Social Sciences and the Integrated Development School, ordered oldest first."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => {
                exportDocumentsCsv(db, result, 'CESS_DocuFlow_Active_Records')
                toast.info('Records Exported', `Exported ${result.length} document record(s) to CSV.`)
              }}
            >
              Export Records ({result.length})
            </Button>
            <Button onClick={handleOpenWalkIn} icon={FilePlus2}>
              Encode Walk-In Document
            </Button>
          </div>
        }
      />

      <Card>
        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          showOffice
          audience="all"
          searchLabel="Search by title, control number, or requester…"
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
              title="No active documents in the repository"
            >
              Document requests submitted by students or faculty will appear here.
            </EmptyState>
          }
        />
      </Card>

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
            <Button variant="secondary" onClick={() => setIsWalkInOpen(false)} disabled={walkInBusy}>
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
              <Select value={requesterId} onChange={(e) => handleRequesterChange(e.target.value)}>
                {requesters.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'student' ? 'Student' : `Faculty · ${u.origin ?? 'CESS'}`})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Document Type" required>
              <Select
                value={selectedType?.id ?? ''}
                onChange={(e) => {
                  setTypeId(e.target.value)
                  setAttachedFiles([])
                }}
              >
                {availableTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Document Title or Subject" required>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Walk-in Application for Leave or INC Completion Form"
            />
          </Field>

          <Field label="Short Description / Counter Remarks" optional>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes on the physical packet received in person..."
            />
          </Field>

          {selectedType && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                Required Forms & Scanned Attachments ({selectedType.name})
              </p>
              <p className="text-xs text-ink-500">
                Attach digital scans of the physical forms, or leave blank to auto-log verified counter scans.
              </p>
              <div className="space-y-2">
                {selectedType.requirements.map((req) => {
                  const attached = attachedFiles.find((f) => f.requirementId === req.id)
                  return (
                    <div
                      key={req.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900">{req.label}</span>
                        <Badge tone={req.required ? 'brand' : 'neutral'} dot={false}>
                          {req.required ? 'Required' : 'Optional'}
                        </Badge>
                      </div>
                      {attached ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-success-700">
                          <CheckCircle2 className="size-3.5" />
                          {attached.name}
                          <button
                            type="button"
                            onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.requirementId !== req.id))}
                            className="text-ink-400 hover:text-danger-600"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">
                          <UploadCloud className="size-3.5" /> Attach Scan
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="sr-only"
                            onChange={(e) => handleFileChosen(e, req)}
                          />
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </form>
      </Dialog>
    </div>
  )
}
