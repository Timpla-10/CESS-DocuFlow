import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  School,
  Send,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useState, useRef, type ChangeEvent, type FormEvent } from 'react'
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
  type Filters,
} from '../../components/documents'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Tooltip, cn } from '../../components/ui'
import {
  OFFICE_LABEL,
  controlNumber,
  downloadGeneratedPdf,
  revisionLabel,
} from '../../content/language'
import { CUSTOM_DOCUMENT_TYPE_LIMIT, customDocumentTypeError, isCustomDocumentType } from '../../data/customDocumentTypes'
import { documentNumberError } from '../../data/documentNumbers'
import { DocumentNumberField } from '../../components/DocumentNumberField'
import { ACCEPTED_EXT, MAX_FILE_MB, type NewFile } from '../../data/engine'
import { isDelayed, userById, visibleDocuments } from '../../data/selectors'
import { api, useDb } from '../../data/store'
import type { DocumentFolder, DocumentType, FolderCategory, Requirement } from '../../data/types'
import { formatDate } from '../../lib/time'

const FOLDER_CATEGORY_LABELS: Record<FolderCategory, { label: string; tone: 'brand' | 'success' | 'warning' | 'neutral' | 'danger' }> = {
  academic: { label: 'Academic Curriculum', tone: 'brand' },
  administrative: { label: 'Administrative & HR', tone: 'neutral' },
  accreditation: { label: 'Accreditation Quality', tone: 'warning' },
  financial: { label: 'Financial & Grants', tone: 'success' },
  general: { label: 'General Repository', tone: 'brand' },
}

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

  // PB-58: Custom Repository Folders State
  const [folderSubTab, setFolderSubTab] = useState<'categories' | 'custom'>('categories')
  const [selectedCustomFolderId, setSelectedCustomFolderId] = useState<string | null>(null)

  const customFolders = (db.folders || []).filter(
    (f) => !f.origin || f.origin === unitTab || f.isSystem,
  )
  const selectedCustomFolder = (db.folders || []).find((f) => f.id === selectedCustomFolderId)

  // Create folder modal state
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderCategory, setNewFolderCategory] = useState<FolderCategory>('academic')
  const [newFolderPurpose, setNewFolderPurpose] = useState('')
  const [newFolderDescription, setNewFolderDescription] = useState('')
  const [createFolderBusy, setCreateFolderBusy] = useState(false)

  // Edit / Rename folder modal state
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [editFolderCategory, setEditFolderCategory] = useState<FolderCategory>('academic')
  const [editFolderPurpose, setEditFolderPurpose] = useState('')
  const [editFolderDescription, setEditFolderDescription] = useState('')
  const [editFolderBusy, setEditFolderBusy] = useState(false)

  // Delete folder state
  const [deletingFolder, setDeletingFolder] = useState<DocumentFolder | null>(null)
  const [deleteFolderBusy, setDeleteFolderBusy] = useState(false)

  // Assign document to folder state
  const [isAssignDocOpen, setIsAssignDocOpen] = useState(false)
  const [assignDocId, setAssignDocId] = useState('')
  const [assignDocBusy, setAssignDocBusy] = useState(false)

  const canManageFolder = (folder: DocumentFolder) => {
    if (user.role === 'secretary' || user.role === 'dean') return true
    return folder.createdBy === user.id
  }

  const canDeleteFolder = (folder: DocumentFolder) => {
    if (folder.isSystem) return false
    if (user.role === 'secretary' || user.role === 'dean') return true
    return folder.createdBy === user.id
  }

  const handleCreateFolder = async (e: FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) {
      toast.error('Folder Name Required', 'Please enter a name for the folder.')
      return
    }
    setCreateFolderBusy(true)
    try {
      await api.createDocumentFolder(user, {
        name: newFolderName.trim(),
        category: newFolderCategory,
        purpose: newFolderPurpose.trim() || undefined,
        description: newFolderDescription.trim() || undefined,
        origin: unitTab,
      })
      toast.success('Folder Created', `Successfully created repository folder "${newFolderName.trim()}".`)
      setIsCreateFolderOpen(false)
      setNewFolderName('')
      setNewFolderPurpose('')
      setNewFolderDescription('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create folder.'
      toast.error('Creation Failed', msg)
    } finally {
      setCreateFolderBusy(false)
    }
  }

  const handleEditFolder = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingFolder) return
    if (!editFolderName.trim()) {
      toast.error('Folder Name Required', 'Please enter a valid folder name.')
      return
    }
    setEditFolderBusy(true)
    try {
      await api.renameDocumentFolder(user, editingFolder.id, {
        name: editFolderName.trim(),
        category: editFolderCategory,
        purpose: editFolderPurpose.trim() || undefined,
        description: editFolderDescription.trim() || undefined,
      })
      toast.success('Folder Updated', `Updated folder "${editFolderName.trim()}".`)
      setEditingFolder(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update folder.'
      toast.error('Update Failed', msg)
    } finally {
      setEditFolderBusy(false)
    }
  }

  const handleDeleteFolder = async () => {
    if (!deletingFolder) return
    setDeleteFolderBusy(true)
    try {
      await api.deleteDocumentFolder(user, deletingFolder.id)
      toast.success('Folder Deleted', `Folder "${deletingFolder.name}" was successfully removed.`)
      if (selectedCustomFolderId === deletingFolder.id) {
        setSelectedCustomFolderId(null)
      }
      setDeletingFolder(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete folder.'
      toast.error('Delete Failed', msg)
    } finally {
      setDeleteFolderBusy(false)
    }
  }

  const handleAssignDocToFolder = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedCustomFolderId || !assignDocId) {
      toast.error('Selection Required', 'Please select a document to file into this folder.')
      return
    }
    setAssignDocBusy(true)
    try {
      await api.moveDocumentToFolder(user, assignDocId, selectedCustomFolderId)
      toast.success('Document Filed', 'Successfully assigned document to this repository folder.')
      setIsAssignDocOpen(false)
      setAssignDocId('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign document.'
      toast.error('Assignment Failed', msg)
    } finally {
      setAssignDocBusy(false)
    }
  }

  const handleRemoveFromFolder = async (docId: string) => {
    try {
      await api.moveDocumentToFolder(user, docId, null)
      toast.info('Document Removed', 'Document moved back to root repository.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove document.'
      toast.error('Removal Failed', msg)
    }
  }

  // Walk-in encoding dialog state (REQ-REC-8)
  const requesters = db.users.filter(
    (u) =>
      (u.role === 'student' ||
        u.role === 'faculty' ||
        u.role === 'ids_principal' ||
        u.role === 'chairperson' ||
        u.role === 'dean') &&
      u.active,
  )
  const [isWalkInOpen, setIsWalkInOpen] = useState(false)
  const [requesterId, setRequesterId] = useState(requesters[0]?.id ?? '')
  const selectedRequester = requesters.find((u) => u.id === requesterId)
  const requesterAudience = selectedRequester?.role === 'student' ? 'student' : 'faculty'
  const availableTypes = db.documentTypes.filter(
    (t) => !selectedRequester || t.audience === requesterAudience,
  )
  const [typeId, setTypeId] = useState(availableTypes[0]?.id ?? '')
  const selectedType = availableTypes.find((t) => t.id === typeId) ?? availableTypes[0]
  const isCustom = selectedType !== undefined && isCustomDocumentType(selectedType.id)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [customTypeName, setCustomTypeName] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<
    { requirementId?: string; name: string; sizeKb: number; fileObj?: File }[]
  >([])
  const [walkInBusy, setWalkInBusy] = useState(false)
  const [walkInErrors, setWalkInErrors] = useState<{ title?: string; files?: string; customTypeName?: string; description?: string; documentNumber?: string }>({})

  const handleOpenWalkIn = (preselectedTypeId?: string) => {
    const firstReq = requesters[0]
    setRequesterId(firstReq?.id ?? '')
    const firstReqAudience = firstReq?.role === 'student' ? 'student' : 'faculty'
    const firstTypes = db.documentTypes.filter((t) => !firstReq || t.audience === firstReqAudience)
    setTypeId(preselectedTypeId ?? firstTypes[0]?.id ?? '')
    setTitle('')
    setDescription('')
    setCustomTypeName('')
    setDocumentNumber('')
    setAttachedFiles([])
    setWalkInErrors({})
    setIsWalkInOpen(true)
  }

  const handleRequesterChange = (newReqId: string) => {
    setRequesterId(newReqId)
    const req = requesters.find((u) => u.id === newReqId)
    const reqAudience = req?.role === 'student' ? 'student' : 'faculty'
    const nextTypes = db.documentTypes.filter((t) => !req || t.audience === reqAudience)
    setTypeId(nextTypes[0]?.id ?? '')
    setDocumentNumber('')
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
      toast.error('File Too Large', `Please upload a file smaller than ${MAX_FILE_MB} MB.`)
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

    const errs: typeof walkInErrors = {}
    const numberError = documentNumberError(documentNumber, selectedType.documentNumberRequired)
    if (numberError) errs.documentNumber = numberError
    if (!title.trim()) {
      errs.title = 'Please enter a title or subject for this walk-in document.'
    }
    if (isCustom) {
      const typeError = customDocumentTypeError(customTypeName)
      if (typeError) errs.customTypeName = typeError
      if (!description.trim()) errs.description = 'Enter the purpose or description of the custom document.'
    }
    const missingReqs = (selectedType.requirements ?? []).filter(
      (r) => r.required && !attachedFiles.some((f) => f.requirementId === r.id),
    )
    if (missingReqs.length > 0) {
      errs.files = `Missing required attachment: ${missingReqs.map((r) => r.label).join(', ')}`
    }

    if (Object.keys(errs).length > 0) {
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
        customTypeName: isCustom ? customTypeName : undefined,
        documentNumber,
        title: title.trim(),
        description: description.trim() || 'Walk-in physical document packet encoded by the College Secretary.',
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

  const templateInputRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = (type: DocumentType) => {
    const fileName = type.templateName || `${type.name.replace(/\s+/g, '_')}_Template.pdf`
    downloadGeneratedPdf(fileName, `OFFICIAL FORM TEMPLATE: ${type.name}`, [
      `Document Service: ${type.name}`,
      `Eligible Audience: ${type.audience === 'student' ? 'Students' : 'CESS & IDS Faculty'}`,
      `Standard Processing Time: ${type.processingDays[0]} to ${type.processingDays[1]} working days`,
      '',
      'REQUIRED CHECKLIST ITEMS:',
      ...type.requirements.map(
        (r, i) =>
          `${i + 1}. [${r.required ? 'REQUIRED' : 'OPTIONAL'}] ${r.label}${
            r.source ? ` (${r.source})` : ''
          }`,
      ),
      '',
      'INSTRUCTIONS FOR SECRETARY & APPLICANTS:',
      '1. Complete all required fields accurately before submission.',
      '2. Physical and digital attachments must adhere to official college standards.',
    ])
    toast.info('Template Downloaded', `Downloaded ${fileName}.`)
  }

  const handleUploadTemplate = async (
    e: ChangeEvent<HTMLInputElement>,
    docType: DocumentType,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const sizeKb = Math.round(file.size / 1024)
    if (sizeKb > MAX_FILE_MB * 1024) {
      toast.error('File Too Large', `Please upload a template smaller than ${MAX_FILE_MB} MB.`)
      return
    }
    try {
      await api.saveDocumentType(user, {
        ...docType,
        templateName: file.name,
      })
      toast.success(
        'Template Updated',
        `Successfully uploaded "${file.name}" as the official template for ${docType.name}.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update template.'
      toast.error('Update Failed', msg)
    } finally {
      e.target.value = ''
    }
  }

  const cessCount = allActiveDocs.filter((d) => (d.origin ?? 'CESS') === 'CESS').length
  const idsCount = allActiveDocs.filter((d) => d.origin === 'IDS').length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Active Repository & Task Management"
        title="All Documents"
        description="Monitor active paperwork moving through offices across CESS and IDS, track delayed files, and encode walk-in submissions."
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
            setSelectedCustomFolderId(null)
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

        {!selectedFolderTypeId && !selectedCustomFolderId && (
          <Segmented<'folders' | 'table'>
            label="Repository Layout"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'folders', label: 'Folders & Repositories', count: unitTypes.length + customFolders.length },
              { value: 'table', label: 'Full Registry Table', count: unitDocs.length },
            ]}
          />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CASE A: A Custom Repository Folder is Opened (PB-58)               */}
      {/* ------------------------------------------------------------------ */}
      {selectedCustomFolder ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedCustomFolderId(null)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back to all {unitTab} folders
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-ink-500">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => setSelectedCustomFolderId(null)}
              >
                Custom Repository Folders
              </span>
              <span>/</span>
              <span className="font-bold text-ink-900">{selectedCustomFolder.name}</span>
            </div>
          </div>

          {/* Custom Folder Details Banner */}
          <Card className="overflow-hidden border-brand-200 bg-gradient-to-b from-brand-50/60 to-white">
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
                      <FolderOpen className="size-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={FOLDER_CATEGORY_LABELS[selectedCustomFolder.category]?.tone || 'brand'}
                          dot={false}
                          className="capitalize"
                        >
                          {FOLDER_CATEGORY_LABELS[selectedCustomFolder.category]?.label || selectedCustomFolder.category}
                        </Badge>
                        {selectedCustomFolder.isSystem && (
                          <Badge tone="neutral" dot={false}>System Protected</Badge>
                        )}
                        {selectedCustomFolder.origin && (
                          <Badge tone={selectedCustomFolder.origin === 'IDS' ? 'warning' : 'brand'} dot={false}>
                            {selectedCustomFolder.origin} Unit
                          </Badge>
                        )}
                      </div>
                      <h2 className="mt-1 text-xl font-extrabold text-brand-950 sm:text-2xl">
                        {selectedCustomFolder.name}
                      </h2>
                    </div>
                  </div>

                  {selectedCustomFolder.description && (
                    <p className="mt-3 text-sm leading-relaxed text-ink-700">
                      {selectedCustomFolder.description}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-600">
                    {selectedCustomFolder.purpose && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-ink-800 ring-1 ring-ink-200">
                        <strong>Purpose:</strong> {selectedCustomFolder.purpose}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-ink-700 ring-1 ring-ink-200">
                      Created by: <strong className="text-ink-900">{selectedCustomFolder.createdByName} ({selectedCustomFolder.createdByRole})</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-ink-700 ring-1 ring-ink-200">
                      Last updated: <strong className="text-ink-900">{formatDate(selectedCustomFolder.updatedAt)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    icon={FilePlus2}
                    onClick={() => {
                      setAssignDocId('')
                      setIsAssignDocOpen(true)
                    }}
                  >
                    + File Document into Folder
                  </Button>
                  {canManageFolder(selectedCustomFolder) && (
                    <Button
                      variant="secondary"
                      icon={Edit3}
                      onClick={() => {
                        setEditFolderName(selectedCustomFolder.name)
                        setEditFolderCategory(selectedCustomFolder.category)
                        setEditFolderPurpose(selectedCustomFolder.purpose || '')
                        setEditFolderDescription(selectedCustomFolder.description || '')
                        setEditingFolder(selectedCustomFolder)
                      }}
                    >
                      Rename / Edit Folder
                    </Button>
                  )}
                  {canDeleteFolder(selectedCustomFolder) && (
                    <Button
                      variant="danger"
                      icon={Trash2}
                      onClick={() => setDeletingFolder(selectedCustomFolder)}
                    >
                      Delete Folder
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Submissions inside this Custom Folder */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Documents Organized in this Folder
                </h3>
                <p className="text-xs text-ink-500">
                  Official active files and requests cataloged under {selectedCustomFolder.name}
                </p>
              </div>
              <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
                {allActiveDocs.filter((d) => d.folderId === selectedCustomFolder.id).length} document(s)
              </span>
            </div>

            {(() => {
              const folderDocs = allActiveDocs.filter((d) => d.folderId === selectedCustomFolder.id)
              if (folderDocs.length === 0) {
                return (
                  <Card className="p-8">
                    <EmptyState
                      icon={FolderOpen}
                      title={`No documents filed in "${selectedCustomFolder.name}" yet`}
                      action={
                        <Button
                          onClick={() => {
                            setAssignDocId('')
                            setIsAssignDocOpen(true)
                          }}
                          icon={FilePlus2}
                        >
                          File a Document into this Folder
                        </Button>
                      }
                    >
                      Organize active paperwork or walk-in records into this folder by clicking the file button above.
                    </EmptyState>
                  </Card>
                )
              }

              return (
                <div className="grid gap-3 sm:grid-cols-1">
                  {folderDocs.map((doc) => {
                    const delayed = isDelayed(db, doc)
                    const req = userById(db, doc.requesterId)
                    const docType = db.documentTypes.find((t) => t.id === doc.typeId)
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
                              {docType && (
                                <Badge tone="brand" dot={false}>
                                  {docType.name}
                                </Badge>
                              )}
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

                          <div className="flex flex-wrap items-center sm:flex-col sm:items-end gap-2 w-full sm:w-auto">
                            <StatusBadge doc={doc} audience="staff" db={db} />
                            {delayed && <DelayedBadge audience="staff" />}
                            <WaitingTime doc={doc} />

                            <div className="mt-2 flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleRemoveFromFolder(doc.id)}
                                className="text-xs font-medium text-ink-500 hover:text-danger-700 transition-colors"
                              >
                                Remove from folder
                              </button>
                              <Link
                                to={`/app/documents/${doc.id}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                              >
                                Inspect & Route <ArrowRight className="size-3 shrink-0" />
                              </Link>
                            </div>
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
      ) : selectedFolderType ? (
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
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-ink-700 ring-1 ring-ink-200">
                      <Files className="size-3.5 text-brand-600" />
                      Official Template:{' '}
                      <strong className="font-semibold text-ink-900">
                        {selectedFolderType.templateName || 'Default PDF Template'}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    icon={Download}
                    onClick={() => handleDownloadTemplate(selectedFolderType)}
                  >
                    Download Template
                  </Button>
                  <Button
                    variant="secondary"
                    icon={UploadCloud}
                    onClick={() => templateInputRef.current?.click()}
                  >
                    Upload / Replace Template
                  </Button>
                  <input
                    type="file"
                    ref={templateInputRef}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xlsx,.xls"
                    onChange={(e) => handleUploadTemplate(e, selectedFolderType)}
                  />
                  <Button
                    onClick={() => handleOpenWalkIn(selectedFolderType.id)}
                    icon={FilePlus2}
                  >
                    Encode Walk-In for this Type
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Submissions inside this Folder */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Tooltip content="List of active submissions filed under this specific document category and academic unit" placement="top">
                  <h3 className="inline-block cursor-help text-base font-bold text-ink-900 transition-colors hover:text-brand-700">
                    {unitTab} Submissions in this Folder
                  </h3>
                </Tooltip>
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

                          <div className="flex flex-wrap items-center sm:flex-col sm:items-end gap-2 w-full sm:w-auto">
                            <StatusBadge doc={doc} audience="staff" db={db} />
                            {delayed && <DelayedBadge audience="staff" />}
                            <WaitingTime doc={doc} />

                            <Link
                              to={`/app/documents/${doc.id}`}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                            >
                              Inspect & Route <ArrowRight className="size-3 shrink-0" />
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
          {/* VIEW 1: CATEGORY FOLDERS vs CUSTOM FOLDERS */}
          {viewMode === 'folders' && (
            <div className="space-y-4">
              {/* Secondary Sub-Navigation for Folders: Official Types vs Custom Folders */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
                <div className="flex items-center gap-1.5 rounded-xl bg-ink-100/70 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setFolderSubTab('categories')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all',
                      folderSubTab === 'categories'
                        ? 'bg-white text-brand-950 shadow-2xs ring-1 ring-ink-200/50'
                        : 'text-ink-600 hover:text-ink-950',
                    )}
                  >
                    <Folder className="size-3.5" />
                    <span>Official Categories ({unitTypes.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFolderSubTab('custom')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all',
                      folderSubTab === 'custom'
                        ? 'bg-white text-brand-950 shadow-2xs ring-1 ring-ink-200/50'
                        : 'text-ink-600 hover:text-ink-950',
                    )}
                  >
                    <FolderOpen className="size-3.5" />
                    <span>Custom Repository Folders ({customFolders.length})</span>
                  </button>
                </div>

                {folderSubTab === 'custom' && user.role !== 'student' && (
                  <Button
                    size="sm"
                    icon={FolderPlus}
                    onClick={() => {
                      setNewFolderName('')
                      setNewFolderCategory('academic')
                      setNewFolderPurpose('')
                      setNewFolderDescription('')
                      setIsCreateFolderOpen(true)
                    }}
                  >
                    + Create Repository Folder
                  </Button>
                )}
              </div>

              {folderSubTab === 'categories' ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                  {unitTypes.map((t) => {
                    const typeDocs = unitDocs.filter((d) => d.typeId === t.id)
                    const toCheckCount = typeDocs.filter((d) => d.status === 'submitted').length
                    const inReviewCount = typeDocs.filter((d) => d.status === 'with_office').length
                    const readyCount = typeDocs.filter((d) => d.status === 'ready').length
                    const returnedCount = typeDocs.filter((d) => d.status === 'returned').length
                    const rejectedCount = typeDocs.filter((d) => d.status === 'rejected').length

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
                              {returnedCount > 0 && (
                                <Badge tone="warning" dot={false}>
                                  {returnedCount} Returned
                                </Badge>
                              )}
                              {rejectedCount > 0 && (
                                <Badge tone="danger" dot={false}>
                                  {rejectedCount} Rejected
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
              ) : (
                /* CUSTOM FOLDERS GRID (PB-58) */
                <div className="space-y-4">
                  {customFolders.length === 0 ? (
                    <Card className="p-8">
                      <EmptyState
                        icon={FolderOpen}
                        title="No custom repository folders yet"
                        action={
                          user.role !== 'student' ? (
                            <Button
                              icon={FolderPlus}
                              onClick={() => {
                                setNewFolderName('')
                                setNewFolderCategory('academic')
                                setNewFolderPurpose('')
                                setNewFolderDescription('')
                                setIsCreateFolderOpen(true)
                              }}
                            >
                              + Create First Repository Folder
                            </Button>
                          ) : undefined
                        }
                      >
                        Create custom folders to organize institutional documents by purpose, accreditation criteria, committee reviews, or specialized departments.
                      </EmptyState>
                    </Card>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                      {customFolders.map((f) => {
                        const folderDocs = allActiveDocs.filter((d) => d.folderId === f.id)
                        const catInfo = FOLDER_CATEGORY_LABELS[f.category] || { label: f.category, tone: 'brand' as const }
                        return (
                          <Card
                            key={f.id}
                            className="group flex flex-col justify-between overflow-hidden border-ink-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
                          >
                            <div className="p-5 sm:p-6">
                              <div className="flex items-start justify-between gap-3">
                                <div
                                  onClick={() => setSelectedCustomFolderId(f.id)}
                                  className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200/60 transition-transform group-hover:scale-105 group-hover:bg-brand-600 group-hover:text-white"
                                >
                                  <FolderOpen className="size-6" />
                                </div>

                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  <Badge tone={catInfo.tone} dot={false} className="capitalize text-3xs">
                                    {catInfo.label}
                                  </Badge>
                                  {f.isSystem && (
                                    <Badge tone="neutral" dot={false} className="text-3xs">
                                      System
                                    </Badge>
                                  )}
                                  <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
                                    {folderDocs.length === 1 ? '1 document' : `${folderDocs.length} documents`}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-4">
                                <h3
                                  onClick={() => setSelectedCustomFolderId(f.id)}
                                  className="cursor-pointer text-base font-bold text-ink-950 transition-colors group-hover:text-brand-800"
                                >
                                  {f.name}
                                </h3>
                                {f.description && (
                                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
                                    {f.description}
                                  </p>
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 text-2xs text-ink-500">
                                <span>
                                  Created by <strong>{f.createdByName}</strong> ({f.createdByRole})
                                </span>
                                <span>{formatDate(f.updatedAt)}</span>
                              </div>
                            </div>

                            {/* Folder Card Actions */}
                            <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-5 py-3">
                              <button
                                type="button"
                                onClick={() => setSelectedCustomFolderId(f.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
                              >
                                Open Folder <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                              </button>

                              <div className="flex items-center gap-2">
                                {canManageFolder(f) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditFolderName(f.name)
                                      setEditFolderCategory(f.category)
                                      setEditFolderPurpose(f.purpose || '')
                                      setEditFolderDescription(f.description || '')
                                      setEditingFolder(f)
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-2xs ring-1 ring-ink-200 hover:bg-ink-50"
                                  >
                                    <Edit3 className="size-3" /> Edit
                                  </button>
                                )}
                                {canDeleteFolder(f) && (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingFolder(f)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-danger-700 shadow-2xs ring-1 ring-danger-200 hover:bg-danger-50"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: FLAT TABLE SEARCH & EXPORT */}
          {viewMode === 'table' && (
            <Card>
              <div className="border-b border-ink-100 bg-ink-50/50 p-3.5">
                <Segmented<string>
                  label="Quick Status Queue"
                  value={filters.status || 'all'}
                  onChange={(val) => {
                    setFilters({ ...filters, status: val === 'all' ? '' : (val as Filters['status']) })
                  }}
                  options={[
                    { value: 'all', label: 'All Records', count: unitDocs.length },
                    {
                      value: 'submitted',
                      label: 'Verify Content',
                      count: unitDocs.filter((d) => d.status === 'submitted').length,
                    },
                    {
                      value: 'with_office',
                      label: 'In Review',
                      count: unitDocs.filter((d) => d.status === 'with_office').length,
                    },
                    {
                      value: 'ready',
                      label: 'Ready for Release',
                      count: unitDocs.filter((d) => d.status === 'ready').length,
                    },
                    {
                      value: 'returned',
                      label: 'Returned for Revision',
                      count: unitDocs.filter((d) => d.status === 'returned').length,
                    },
                    {
                      value: 'rejected',
                      label: 'Disapproved / Rejected',
                      count: unitDocs.filter((d) => d.status === 'rejected').length,
                    },
                  ]}
                />
              </div>

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

      {/* Walk-In Document Encoding Dialog */}
      <Dialog
        open={isWalkInOpen}
        onClose={() => setIsWalkInOpen(false)}
        size="xl"
        title="Encode Document Received in Person"
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
        <form className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Requester"
              required
              hint="Select the student, faculty member, or principal submitting the physical packet."
            >
              <Select
                value={requesterId}
                onChange={(e) => handleRequesterChange(e.target.value)}
                className="w-full"
              >
                {requesters.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} (
                    {u.role === 'student'
                      ? 'Student'
                      : u.role === 'ids_principal'
                        ? 'IDS Principal (Faculty)'
                        : u.role === 'chairperson'
                          ? `Chairperson (${u.department})`
                          : u.role === 'dean'
                            ? 'Dean'
                            : `Faculty - ${u.origin ?? 'CESS'}`}
                    )
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Document Type" required>
              <Select
                value={typeId}
                onChange={(e) => {
                  setTypeId(e.target.value)
                  setDocumentNumber('')
                  setWalkInErrors({})
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

          {selectedType && <DocumentNumberField
            value={documentNumber}
            required={selectedType.documentNumberRequired}
            disabled={walkInBusy}
            error={walkInErrors.documentNumber}
            onChange={(value) => {
              setDocumentNumber(value)
              if (walkInErrors.documentNumber) setWalkInErrors((previous) => ({ ...previous, documentNumber: undefined }))
            }}
          />}

          {isCustom && (
            <Field label="Custom document type" required error={walkInErrors.customTypeName}>
              <Input
                value={customTypeName}
                maxLength={CUSTOM_DOCUMENT_TYPE_LIMIT}
                onChange={(event) => {
                  setCustomTypeName(event.target.value)
                  if (walkInErrors.customTypeName) setWalkInErrors((previous) => ({ ...previous, customTypeName: undefined }))
                }}
              />
            </Field>
          )}

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

          <Field label="Description or Purpose" required={isCustom} optional={!isCustom} error={isCustom ? walkInErrors.description : undefined}>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (walkInErrors.description) setWalkInErrors((previous) => ({ ...previous, description: undefined }))
              }}
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

      {/* PB-58: Create Custom Repository Folder Dialog */}
      <Dialog
        open={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        title="Create Repository Folder"
        description="Establish a dedicated custom folder in the document repository to organize files by category, purpose, or institutional accreditation requirements."
        busy={createFolderBusy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsCreateFolderOpen(false)}
              disabled={createFolderBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              loading={createFolderBusy}
              icon={FolderPlus}
            >
              Create Folder
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateFolder} className="space-y-4">
          <Field label="Folder Name" required>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. AY 2026-2027 Accreditation Portfolios"
              required
            />
          </Field>

          <Field label="Folder Category" required>
            <Select
              value={newFolderCategory}
              onChange={(e) => setNewFolderCategory(e.target.value as FolderCategory)}
            >
              <option value="academic">Academic Curriculum</option>
              <option value="administrative">Administrative & HR</option>
              <option value="accreditation">Accreditation Quality</option>
              <option value="financial">Financial & Grants</option>
              <option value="general">General Repository</option>
            </Select>
          </Field>

          <Field label="Specific Purpose" optional hint="Specific committee, audit, or departmental purpose">
            <Input
              value={newFolderPurpose}
              onChange={(e) => setNewFolderPurpose(e.target.value)}
              placeholder="e.g. Institutional accreditation compliance and evaluation"
            />
          </Field>

          <Field label="Detailed Description" optional>
            <Textarea
              rows={3}
              value={newFolderDescription}
              onChange={(e) => setNewFolderDescription(e.target.value)}
              placeholder="Provide context regarding documents stored in this folder..."
            />
          </Field>
        </form>
      </Dialog>

      {/* PB-58: Rename / Edit Folder Dialog */}
      <Dialog
        open={editingFolder !== null}
        onClose={() => setEditingFolder(null)}
        title={`Rename / Edit Folder — ${editingFolder?.name}`}
        description="Modify folder metadata, category classification, or operational purpose."
        busy={editFolderBusy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setEditingFolder(null)}
              disabled={editFolderBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditFolder}
              loading={editFolderBusy}
              icon={Edit3}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditFolder} className="space-y-4">
          <Field label="Folder Name" required>
            <Input
              value={editFolderName}
              onChange={(e) => setEditFolderName(e.target.value)}
              required
            />
          </Field>

          <Field label="Folder Category" required>
            <Select
              value={editFolderCategory}
              onChange={(e) => setEditFolderCategory(e.target.value as FolderCategory)}
            >
              <option value="academic">Academic Curriculum</option>
              <option value="administrative">Administrative & HR</option>
              <option value="accreditation">Accreditation Quality</option>
              <option value="financial">Financial & Grants</option>
              <option value="general">General Repository</option>
            </Select>
          </Field>

          <Field label="Specific Purpose" optional>
            <Input
              value={editFolderPurpose}
              onChange={(e) => setEditFolderPurpose(e.target.value)}
            />
          </Field>

          <Field label="Detailed Description" optional>
            <Textarea
              rows={3}
              value={editFolderDescription}
              onChange={(e) => setEditFolderDescription(e.target.value)}
            />
          </Field>
        </form>
      </Dialog>

      {/* PB-58: Delete Folder Confirmation Dialog */}
      <Dialog
        open={deletingFolder !== null}
        onClose={() => setDeletingFolder(null)}
        title="Delete Repository Folder"
        description={`Are you sure you want to delete the folder "${deletingFolder?.name}"? Documents currently inside this folder will not be deleted; they will be safely unfiled back to the root repository.`}
        busy={deleteFolderBusy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeletingFolder(null)}
              disabled={deleteFolderBusy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteFolder}
              loading={deleteFolderBusy}
              icon={Trash2}
            >
              Delete Folder
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-danger-200 bg-danger-50/70 p-4 text-xs text-danger-900">
          <p className="font-bold">Permanent Folder Removal</p>
          <p className="mt-1">
            This action cannot be undone. System category folders are protected and cannot be deleted.
          </p>
        </div>
      </Dialog>

      {/* PB-58: File / Assign Document to Folder Dialog */}
      <Dialog
        open={isAssignDocOpen}
        onClose={() => setIsAssignDocOpen(false)}
        title={`File Document into "${selectedCustomFolder?.name}"`}
        description="Select an active document request from the repository to organize into this folder."
        busy={assignDocBusy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsAssignDocOpen(false)}
              disabled={assignDocBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignDocToFolder}
              loading={assignDocBusy}
              icon={FilePlus2}
              disabled={!assignDocId}
            >
              Assign to Folder
            </Button>
          </>
        }
      >
        <form onSubmit={handleAssignDocToFolder} className="space-y-4">
          <Field label="Select Document to File" required hint="Choose an active document currently not in this folder">
            <Select
              value={assignDocId}
              onChange={(e) => setAssignDocId(e.target.value)}
              required
            >
              <option value="">-- Choose a document from the registry --</option>
              {allActiveDocs
                .filter((d) => d.folderId !== selectedCustomFolder?.id)
                .map((d) => {
                  const req = userById(db, d.requesterId)
                  return (
                    <option key={d.id} value={d.id}>
                      {controlNumber(d)} — {d.title} ({req?.name ?? 'Requester'})
                    </option>
                  )
                })}
            </Select>
          </Field>
        </form>
      </Dialog>
    </div>
  )
}
