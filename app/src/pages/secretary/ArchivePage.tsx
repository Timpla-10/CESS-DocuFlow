import {
  Archive,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Files,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DocumentPreviewModal,
  exportDocumentsCsv,
  formatSize,
} from '../../components/documents'
import { Input, Select } from '../../components/form'
import { useToast } from '../../components/Toast'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  cn,
} from '../../components/ui'
import {
  controlNumber,
  downloadGeneratedPdf,
  revisionLabel,
} from '../../content/language'
import { lastSubmittedAt } from '../../data/engine'
import { typeOf, userById } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { Database, DocRecord, DocumentType } from '../../data/types'
import { formatDate, formatDateTime, plural, timeAgo } from '../../lib/time'

type ArchiveLayoutMode = 'grid' | 'list'
type ArchiveGroupMode = 'folders' | 'all'
type ArchiveSortMode = 'newest' | 'oldest' | 'alpha'
type FolderFilterMode = 'all' | 'populated'

const VIEW_MODE_STORAGE_KEY = 'cess_docuflow_archive_view_mode'

function getInitialViewMode(): ArchiveLayoutMode {
  try {
    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (saved === 'grid' || saved === 'list') return saved
  } catch {
    // Ignore storage errors
  }
  return 'grid'
}

function docTotalSizeKb(doc: DocRecord): number {
  return doc.attachments.reduce((acc, a) => acc + a.sizeKb, 0)
}

function docReleasedAt(doc: DocRecord): string {
  return doc.release?.at ?? doc.updatedAt
}

export function ArchivePage() {
  const db = useDb()
  const toast = useToast()

  // Core Explorer State
  const [viewMode, setViewModeState] = useState<ArchiveLayoutMode>(getInitialViewMode)
  const [groupMode, setGroupMode] = useState<ArchiveGroupMode>('folders')
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [folderFilter, setFolderFilter] = useState<FolderFilterMode>('all')
  const [previewDoc, setPreviewDoc] = useState<DocRecord | null>(null)

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [originFilter, setOriginFilter] = useState<'' | 'CESS' | 'IDS'>('')
  const [recordStatusFilter, setRecordStatusFilter] = useState<'all' | 'released' | 'rejected'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<ArchiveSortMode>('newest')

  const setViewMode = (mode: ArchiveLayoutMode) => {
    setViewModeState(mode)
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    } catch {
      // Ignore storage errors
    }
  }

  const archivedDocs = useMemo(
    () =>
      db.documents.filter((d) => {
        if (recordStatusFilter === 'released') return d.status === 'released' || (d.archived && d.status !== 'rejected')
        if (recordStatusFilter === 'rejected') return d.status === 'rejected'
        return d.archived || d.status === 'rejected' || d.status === 'released'
      }),
    [db.documents, recordStatusFilter],
  )

  const hasSearchOrFilter = !!(
    searchQuery.trim() ||
    originFilter ||
    dateFrom ||
    dateTo
  )

  // Filter and sort archived documents
  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null

    return archivedDocs
      .filter((d) => {
        if (selectedTypeId && d.typeId !== selectedTypeId) return false
        if (originFilter && d.origin !== originFilter) return false
        if (fromMs !== null || toMs !== null) {
          const releasedMs = new Date(docReleasedAt(d)).getTime()
          const submittedMs = new Date(lastSubmittedAt(d)).getTime()
          const matchRelease =
            (fromMs === null || releasedMs >= fromMs) &&
            (toMs === null || releasedMs <= toMs)
          const matchSub =
            (fromMs === null || submittedMs >= fromMs) &&
            (toMs === null || submittedMs <= toMs)
          if (!matchRelease && !matchSub) return false
        }
        if (!q) return true
        const req = userById(db, d.requesterId)
        const docType = typeOf(db, d)
        const hay = [
          controlNumber(d),
          d.title,
          d.description,
          docType?.name,
          req?.name,
          req?.department,
          d.release?.receivedBy,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        if (sortOrder === 'alpha') {
          return a.title.localeCompare(b.title)
        }
        const aTime = new Date(docReleasedAt(a)).getTime()
        const bTime = new Date(docReleasedAt(b)).getTime()
        return sortOrder === 'newest' ? bTime - aTime : aTime - bTime
      })
  }, [archivedDocs, selectedTypeId, originFilter, dateFrom, dateTo, searchQuery, sortOrder, db])

  // Build Category Folder summaries
  const categoryFolders = useMemo(() => {
    const folders = db.documentTypes.map((docType) => {
      const docsInFolder = archivedDocs
        .filter((d) => d.typeId === docType.id)
        .filter((d) => (!originFilter ? true : d.origin === originFilter))
        .sort(
          (a, b) =>
            new Date(docReleasedAt(b)).getTime() -
            new Date(docReleasedAt(a)).getTime(),
        )
      const totalSizeKb = docsInFolder.reduce((sum, d) => sum + docTotalSizeKb(d), 0)
      const latestDoc = docsInFolder[0] ?? null
      return {
        docType,
        docs: docsInFolder,
        count: docsInFolder.length,
        totalSizeKb,
        latestReleasedAt: latestDoc ? docReleasedAt(latestDoc) : null,
      }
    })

    // Sort populated folders first (by count desc, then latest release), then alphabetical
    return folders.sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1
      if (a.count === 0 && b.count > 0) return 1
      if (a.count !== b.count) return b.count - a.count
      if (a.latestReleasedAt && b.latestReleasedAt) {
        return (
          new Date(b.latestReleasedAt).getTime() -
          new Date(a.latestReleasedAt).getTime()
        )
      }
      return a.docType.name.localeCompare(b.docType.name)
    })
  }, [db.documentTypes, archivedDocs, originFilter])

  const populatedFolderCount = useMemo(
    () => categoryFolders.filter((f) => f.count > 0).length,
    [categoryFolders],
  )

  const visibleFolders = useMemo(
    () =>
      folderFilter === 'populated'
        ? categoryFolders.filter((f) => f.count > 0)
        : categoryFolders,
    [categoryFolders, folderFilter],
  )

  const selectedFolder = useMemo(
    () =>
      selectedTypeId
        ? categoryFolders.find((f) => f.docType.id === selectedTypeId) ?? null
        : null,
    [categoryFolders, selectedTypeId],
  )

  const totalVaultSizeKb = useMemo(
    () => archivedDocs.reduce((sum, d) => sum + docTotalSizeKb(d), 0),
    [archivedDocs],
  )

  const signedRecordsCount = useMemo(
    () =>
      archivedDocs.filter((d) => d.attachments.some((a) => a.isSignedCopy)).length,
    [archivedDocs],
  )

  const clearAllFilters = () => {
    setSearchQuery('')
    setOriginFilter('')
    setRecordStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSortOrder('newest')
  }

  const handleDownloadDoc = (doc: DocRecord) => {
    const docType = typeOf(db, doc)
    const requester = userById(db, doc.requesterId)
    const signedAttachment =
      doc.attachments.find((a) => a.isSignedCopy) ?? doc.attachments[0]

    const fileName = signedAttachment
      ? signedAttachment.name
      : `${controlNumber(doc)}_Archived_Copy.pdf`

    downloadGeneratedPdf(fileName, `Official Archived Record: ${doc.title}`, [
      `Control Number: ${controlNumber(doc)}`,
      `Document Title: ${doc.title}`,
      `Document Category: ${docType?.name ?? doc.typeId}`,
      `Unit of Origin: ${doc.origin}`,
      `Requester: ${requester?.name ?? 'Unknown'} (${requester?.department ?? ''})`,
      `Submitted Date: ${formatDateTime(doc.submittedAt)}`,
      `Released Date: ${formatDateTime(docReleasedAt(doc))}`,
      `Claimed / Received By: ${doc.release?.receivedBy ?? requester?.name ?? 'Requester'}`,
      `Release Recorded By: ${doc.release?.recordedBy ?? 'College Secretary'}`,
      `Signed Copy File: ${signedAttachment?.name ?? 'Standard Electronic Filing'}`,
      `Revision: ${revisionLabel(doc.revision)}`,
      '',
      'CERTIFICATION OF INSTITUTIONAL ARCHIVE:',
      'This document has completed all required college reviews and is permanently',
      'retained in the CESS DocuFlow Archive Vault for compliance and audit.',
    ])

    toast.info('Archived PDF Downloaded', `Downloaded ${fileName}.`)
  }

  // Determine whether we are showing the Root Folders view or a Flat/Drilldown file view
  const showRootFoldersView =
    groupMode === 'folders' && !selectedTypeId && !hasSearchOrFilter

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance & Audit Vault"
        title="College Document Archive"
        description="Completed and released documents permanently retained for institutional auditing, accreditation compliance, and academic records."
        actions={
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              exportDocumentsCsv(db, filteredDocs, 'CESS_DocuFlow_Archived_Records')
              toast.info(
                'Archive Exported',
                `Exported ${filteredDocs.length} archived record(s) to CSV.`,
              )
            }}
          >
            Export Archive ({filteredDocs.length})
          </Button>
        }
      />

      {/* Vault Quick Metrics Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <Archive className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-500">Retained Records</p>
            <p className="text-xl font-extrabold tracking-tight text-ink-900 tabular-nums">
              {archivedDocs.length}{' '}
              <span className="text-xs font-medium text-ink-500">files</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-100/70 text-warning-700 ring-1 ring-inset ring-amber-200">
            <FolderOpen className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-500">Category Folders</p>
            <p className="text-xl font-extrabold tracking-tight text-ink-900 tabular-nums">
              {populatedFolderCount}{' '}
              <span className="text-xs font-medium text-ink-500">
                of {categoryFolders.length} active
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-50 text-success-600 ring-1 ring-inset ring-success-100">
            <FileCheck2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-500">Signed Release Scans</p>
            <p className="text-xl font-extrabold tracking-tight text-ink-900 tabular-nums">
              {signedRecordsCount}{' '}
              <span className="text-xs font-medium text-success-700">verified</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-dsee-50 text-dsee-700 ring-1 ring-inset ring-dsee-200">
            <HardDrive className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-500">Vault Storage Used</p>
            <p className="text-xl font-extrabold tracking-tight text-ink-900 tabular-nums">
              {formatSize(totalVaultSizeKb)}{' '}
              <span className="text-xs font-medium text-ink-500">permanent</span>
            </p>
          </div>
        </div>
      </div>

      <Callout
        tone="brand"
        icon={ShieldCheck}
        title="Archived Records are Permanent and Viewable In-App"
      >
        Documents in the archive cannot be altered or hard-deleted. Browse by category
        folder like a digital filing cabinet, switch between Grid and List views, or click
        any file tile to inspect its signed release scan in the{' '}
        <span className="font-semibold text-brand-900">In-App Document Previewer</span>{' '}
        without downloading.
      </Callout>

      {/* Main File Explorer Container */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-100">
        {/* Top Explorer Navigation & View Mode Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/50 px-5 py-3.5 sm:px-6">
          {/* Left: Breadcrumb Navigation */}
          <nav aria-label="Archive folder breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => {
                setSelectedTypeId(null)
                setGroupMode('folders')
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition-colors',
                !selectedTypeId && groupMode === 'folders'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-ink-700 hover:bg-ink-100 hover:text-brand-800',
              )}
            >
              <Home className="size-3.5 shrink-0" aria-hidden />
              <span>Archive Vault</span>
            </button>

            {selectedFolder && (
              <>
                <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden />
                <span className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 font-bold text-brand-900 ring-1 ring-inset ring-brand-200">
                  <FolderOpen className="size-4 shrink-0 text-warning-600" aria-hidden />
                  <span className="truncate max-w-[220px] sm:max-w-xs">
                    {selectedFolder.docType.name}
                  </span>
                  <span className="rounded-full bg-brand-100 px-2 py-0.2 text-xs font-extrabold text-brand-800">
                    {selectedFolder.count}
                  </span>
                </span>
              </>
            )}

            {!selectedFolder && groupMode === 'all' && (
              <>
                <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden />
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 font-bold text-brand-900 ring-1 ring-inset ring-brand-200">
                  <Files className="size-4 shrink-0 text-brand-700" aria-hidden />
                  <span>All Archived Files (Flat View)</span>
                </span>
              </>
            )}

            {!selectedFolder && hasSearchOrFilter && (
              <>
                <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden />
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100/80 px-3 py-1.5 text-xs font-bold text-warning-700 ring-1 ring-inset ring-amber-300">
                  <Search className="size-3.5 shrink-0" aria-hidden />
                  <span>Filtered Results ({filteredDocs.length})</span>
                </span>
              </>
            )}
          </nav>

          {/* Right: Organization Mode Switcher + Grid/List View Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Folder Explorer vs Flat All Files Switcher */}
            <div
              role="group"
              aria-label="Archive organization mode"
              className="inline-flex items-center rounded-xl bg-ink-100/80 p-1 ring-1 ring-inset ring-ink-200/70"
            >
              <button
                type="button"
                onClick={() => {
                  setGroupMode('folders')
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  groupMode === 'folders'
                    ? 'bg-white text-brand-800 shadow-xs ring-1 ring-ink-200'
                    : 'text-ink-600 hover:text-ink-900',
                )}
              >
                <Folder className="size-3.5" aria-hidden />
                <span>Folders</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTypeId(null)
                  setGroupMode('all')
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  groupMode === 'all' && !selectedTypeId
                    ? 'bg-white text-brand-800 shadow-xs ring-1 ring-ink-200'
                    : 'text-ink-600 hover:text-ink-900',
                )}
              >
                <Files className="size-3.5" aria-hidden />
                <span>View All Files</span>
              </button>
            </div>

            {/* Grid vs List Segmented Toggle */}
            <div
              role="group"
              aria-label="File layout view mode"
              className="inline-flex items-center rounded-xl bg-ink-100/80 p-1 ring-1 ring-inset ring-ink-200/70"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  viewMode === 'grid'
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-ink-600 hover:text-ink-900',
                )}
                title="Grid View (Google Drive tile layout)"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid className="size-3.5" aria-hidden />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  viewMode === 'list'
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-ink-600 hover:text-ink-900',
                )}
                title="List View (High-density audit table)"
                aria-pressed={viewMode === 'list'}
              >
                <List className="size-3.5" aria-hidden />
                <span>List</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="space-y-3.5 border-b border-ink-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-end gap-3.5">
            {/* Global Search Input */}
            <div className="relative min-w-[240px] flex-1">
              <label
                htmlFor="archive-search"
                className="mb-1 block text-xs font-semibold text-ink-600"
              >
                Search Vault
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                  aria-hidden
                />
                <Input
                  id="archive-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, control number, requester, or recipient…"
                  className="pl-10 pr-4"
                />
              </div>
            </div>

            {/* Category / Folder Quick Select */}
            <label className="block min-w-[200px]">
              <span className="mb-1 block text-xs font-semibold text-ink-600">
                Category Folder
              </span>
              <Select
                value={selectedTypeId ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedTypeId(val ? val : null)
                }}
                className="h-10"
              >
                <option value="">All category folders ({db.documentTypes.length})</option>
                {categoryFolders.map((f) => (
                  <option key={f.docType.id} value={f.docType.id}>
                    {f.docType.name} ({f.count})
                  </option>
                ))}
              </Select>
            </label>

            {/* Origin / Unit Filter */}
            <label className="block min-w-[130px]">
              <span className="mb-1 block text-xs font-semibold text-ink-600">
                Origin / Unit
              </span>
              <Select
                value={originFilter}
                onChange={(e) =>
                  setOriginFilter(e.target.value as '' | 'CESS' | 'IDS')
                }
                className="h-10"
              >
                <option value="">All Units</option>
                <option value="CESS">CESS</option>
                <option value="IDS">IDS</option>
              </Select>
            </label>

            {/* Record Outcome Filter (PM-FEEDBACK-2) */}
            <label className="block min-w-[150px]">
              <span className="mb-1 block text-xs font-semibold text-ink-600">
                Record Outcome
              </span>
              <Select
                value={recordStatusFilter}
                onChange={(e) =>
                  setRecordStatusFilter(e.target.value as 'all' | 'released' | 'rejected')
                }
                className="h-10"
              >
                <option value="all">All Vault Records</option>
                <option value="released">Released & Audited</option>
                <option value="rejected">Disapproved / Rejected</option>
              </Select>
            </label>

            {/* Sort Order */}
            <label className="block min-w-[165px]">
              <span className="mb-1 block text-xs font-semibold text-ink-600">
                Sort Order
              </span>
              <Select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as ArchiveSortMode)}
                className="h-10"
              >
                <option value="newest">Newest released first</option>
                <option value="oldest">Oldest released first</option>
                <option value="alpha">Alphabetical (A–Z)</option>
              </Select>
            </label>
          </div>

          {/* Date Range Filter Row */}
          <div className="flex flex-wrap items-end justify-between gap-3 pt-0.5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink-600">
                  Released / Submitted from
                </span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-10 text-sm sm:w-44"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink-600">
                  Released / Submitted to
                </span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-10 text-sm sm:w-44"
                />
              </label>

              {(hasSearchOrFilter || selectedTypeId) && (
                <button
                  type="button"
                  onClick={() => {
                    clearAllFilters()
                    setSelectedTypeId(null)
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 transition-colors"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reset all filters
                </button>
              )}
            </div>

            <p className="text-xs font-medium text-ink-500">
              Showing{' '}
              <span className="font-bold text-ink-900">{filteredDocs.length}</span> of{' '}
              <span className="font-bold text-ink-900">{archivedDocs.length}</span>{' '}
              permanently archived records
            </p>
          </div>
        </div>

        {/* ================================================================ */}
        {/* 1. INSIDE FOLDER VIEW (DRILL-DOWN BANNER & FILES)                */}
        {/* ================================================================ */}
        {selectedFolder && (
          <div className="p-5 sm:p-6 space-y-6">
            {/* Folder Metadata & Retention Policy Banner */}
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-brand-50/70 p-5 ring-1 ring-inset ring-brand-200">
              <div className="flex min-w-0 items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-warning-700 ring-1 ring-inset ring-amber-300 shadow-xs">
                  <FolderOpen className="size-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold text-brand-900">
                      {selectedFolder.docType.name}
                    </h2>
                    <Badge
                      tone={selectedFolder.docType.audience === 'student' ? 'brand' : 'dssh'}
                      dot={false}
                    >
                      {selectedFolder.docType.audience === 'student'
                        ? 'Student Filing'
                        : 'Faculty Filing'}
                    </Badge>
                    <Badge tone="success" dot={false}>
                      Permanent Retention
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-600 max-w-2xl">
                    {selectedFolder.docType.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-medium text-ink-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Files className="size-3.5 text-brand-600" aria-hidden />
                      <strong className="text-ink-900">
                        {plural(filteredDocs.length, 'archived record')}
                      </strong>{' '}
                      in folder
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <HardDrive className="size-3.5 text-brand-600" aria-hidden />
                      Total size:{' '}
                      <strong className="text-ink-900">
                        {formatSize(selectedFolder.totalSizeKb)}
                      </strong>
                    </span>
                    {selectedFolder.latestReleasedAt && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5 text-brand-600" aria-hidden />
                        Last release:{' '}
                        <strong className="text-ink-900">
                          {formatDate(selectedFolder.latestReleasedAt)}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedTypeId(null)}
              >
                Back to All Folders
              </Button>
            </div>

            {/* Files inside the selected folder */}
            <ArchiveFilesSection
              db={db}
              docs={filteredDocs}
              viewMode={viewMode}
              showFolderBadge={false}
              onPreview={(doc) => setPreviewDoc(doc)}
              onDownload={handleDownloadDoc}
              onClearFilters={
                hasSearchOrFilter ? clearAllFilters : () => setSelectedTypeId(null)
              }
              emptyTitle={`No archived records in "${selectedFolder.docType.name}"`}
              emptyMessage={
                hasSearchOrFilter
                  ? 'No files in this folder match your current search or date filters.'
                  : 'Completed and released documents of this category will automatically be filed into this folder.'
              }
            />
          </div>
        )}

        {/* ================================================================ */}
        {/* 2. ROOT ARCHIVE VIEW (CATEGORY FOLDERS + RECENT RELEASES)        */}
        {/* ================================================================ */}
        {showRootFoldersView && (
          <div className="p-5 sm:p-6 space-y-8">
            {/* Top-Level Category Folders Section */}
            <section aria-labelledby="archive-folders-heading">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2
                    id="archive-folders-heading"
                    className="text-sm font-extrabold uppercase tracking-wider text-ink-700"
                  >
                    Category Folders ({visibleFolders.length})
                  </h2>
                  <p className="text-xs text-ink-500">
                    Click any institutional folder to browse archived records by document
                    type
                  </p>
                </div>

                {/* Filter Pill: All Categories vs Populated Only */}
                <div className="inline-flex items-center rounded-lg bg-ink-50 p-0.5 ring-1 ring-inset ring-ink-200">
                  <button
                    type="button"
                    onClick={() => setFolderFilter('all')}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                      folderFilter === 'all'
                        ? 'bg-white text-brand-800 shadow-xs ring-1 ring-ink-200'
                        : 'text-ink-600 hover:text-ink-900',
                    )}
                  >
                    All Categories ({categoryFolders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFolderFilter('populated')}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                      folderFilter === 'populated'
                        ? 'bg-white text-brand-800 shadow-xs ring-1 ring-ink-200'
                        : 'text-ink-600 hover:text-ink-900',
                    )}
                  >
                    With Records ({populatedFolderCount})
                  </button>
                </div>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleFolders.map((folder) => {
                    const hasRecords = folder.count > 0
                    return (
                      <button
                        key={folder.docType.id}
                        type="button"
                        onClick={() => setSelectedTypeId(folder.docType.id)}
                        className={cn(
                          'group flex flex-col justify-between rounded-xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised',
                          hasRecords
                            ? 'bg-white ring-1 ring-ink-200 hover:ring-brand-400'
                            : 'bg-ink-50/50 ring-1 ring-ink-100 hover:bg-white hover:ring-ink-300',
                        )}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                'grid size-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105',
                                hasRecords
                                  ? 'bg-amber-100 text-warning-700 ring-1 ring-inset ring-amber-300'
                                  : 'bg-ink-100 text-ink-500',
                              )}
                            >
                              {hasRecords ? (
                                <FolderOpen className="size-5" aria-hidden />
                              ) : (
                                <Folder className="size-5" aria-hidden />
                              )}
                            </span>

                            <span
                              className={cn(
                                'inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums',
                                hasRecords
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-ink-100 text-ink-500',
                              )}
                            >
                              {plural(folder.count, 'file')}
                            </span>
                          </div>

                          <h3 className="mt-3 line-clamp-1 text-sm font-bold text-ink-900 group-hover:text-brand-700">
                            {folder.docType.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">
                            {folder.docType.summary}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-2.5 text-[11px] text-ink-500">
                          <span className="font-medium">
                            {folder.latestReleasedAt
                              ? `Released ${formatDate(folder.latestReleasedAt)}`
                              : 'Empty folder'}
                          </span>
                          {folder.totalSizeKb > 0 && (
                            <span className="font-mono font-semibold text-ink-600">
                              {formatSize(folder.totalSizeKb)}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl ring-1 ring-ink-100">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                        <th className="px-4 py-3.5 min-w-[280px]">Category Folder</th>
                        <th className="px-4 py-3.5 min-w-[130px]">Filing Type</th>
                        <th className="px-4 py-3.5 min-w-[120px]">Archived Records</th>
                        <th className="px-4 py-3.5 min-w-[110px]">Vault Storage</th>
                        <th className="px-4 py-3.5 min-w-[160px]">Last Release</th>
                        <th className="px-4 py-3.5 text-right min-w-[130px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 bg-white">
                      {visibleFolders.map((folder) => {
                        const hasRecords = folder.count > 0
                        return (
                          <tr
                            key={folder.docType.id}
                            onClick={() => setSelectedTypeId(folder.docType.id)}
                            className="group cursor-pointer transition-colors hover:bg-brand-50/60"
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    'grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
                                    hasRecords
                                      ? 'bg-amber-100 text-warning-700 ring-amber-300'
                                      : 'bg-ink-100 text-ink-500 ring-ink-200',
                                  )}
                                >
                                  {hasRecords ? (
                                    <FolderOpen className="size-4" aria-hidden />
                                  ) : (
                                    <Folder className="size-4" aria-hidden />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-bold text-ink-900 group-hover:text-brand-700">
                                    {folder.docType.name}
                                  </div>
                                  <div className="line-clamp-1 text-xs text-ink-500">
                                    {folder.docType.summary}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge
                                tone={folder.docType.audience === 'student' ? 'brand' : 'dssh'}
                                dot={false}
                              >
                                {folder.docType.audience === 'student' ? 'Student' : 'Faculty'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums',
                                  hasRecords
                                    ? 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200'
                                    : 'text-ink-400',
                                )}
                              >
                                {plural(folder.count, 'file')}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs text-ink-600">
                              {folder.totalSizeKb > 0 ? formatSize(folder.totalSizeKb) : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-ink-600">
                              {folder.latestReleasedAt ? formatDate(folder.latestReleasedAt) : 'No releases'}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedTypeId(folder.docType.id)
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-ink-200 hover:bg-brand-600 hover:text-white transition-colors"
                              >
                                <span>Open Folder</span>
                                <ChevronRight className="size-3.5" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Sub-section: Recent Releases / Pinned Audits */}
            <section
              aria-labelledby="recent-releases-heading"
              className="border-t border-ink-100 pt-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="recent-releases-heading"
                    className="text-sm font-extrabold uppercase tracking-wider text-ink-700"
                  >
                    Recent Releases &amp; Pinned Audits ({filteredDocs.length})
                  </h2>
                  <p className="text-xs text-ink-500">
                    Click any document card or row to launch the In-App Document Previewer
                  </p>
                </div>
              </div>

              <ArchiveFilesSection
                db={db}
                docs={filteredDocs}
                viewMode={viewMode}
                showFolderBadge
                onPreview={(doc) => setPreviewDoc(doc)}
                onDownload={handleDownloadDoc}
                onFolderClick={(typeId) => setSelectedTypeId(typeId)}
                emptyTitle="No archived documents yet"
                emptyMessage="When documents are officially released to requesters, they will be preserved here in read-only form."
              />
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* 3. FLAT ALL-FILES VIEW OR ACTIVE SEARCH RESULTS                  */}
        {/* ================================================================ */}
        {!selectedFolder && !showRootFoldersView && (
          <div className="p-5 sm:p-6 space-y-4">
            {hasSearchOrFilter && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50/70 px-4 py-3 ring-1 ring-inset ring-brand-200">
                <div className="flex items-center gap-2 text-xs text-brand-900">
                  <Search className="size-4 text-brand-700 shrink-0" aria-hidden />
                  <span>
                    Showing <strong>{filteredDocs.length}</strong> matching archived
                    record(s) across all category folders.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-bold text-brand-700 hover:underline"
                >
                  Clear search &amp; return to folders
                </button>
              </div>
            )}

            <ArchiveFilesSection
              db={db}
              docs={filteredDocs}
              viewMode={viewMode}
              showFolderBadge
              onPreview={(doc) => setPreviewDoc(doc)}
              onDownload={handleDownloadDoc}
              onFolderClick={(typeId) => setSelectedTypeId(typeId)}
              onClearFilters={hasSearchOrFilter ? clearAllFilters : undefined}
              emptyTitle={
                hasSearchOrFilter
                  ? 'No archived documents match your search'
                  : 'No archived documents yet'
              }
              emptyMessage={
                hasSearchOrFilter
                  ? 'Try a different keyword, unit filter, or date range to see matching institutional records.'
                  : 'When documents are officially released to requesters, they will be preserved here in read-only form.'
              }
            />
          </div>
        )}
      </div>

      {/* Direct 1-Click In-App Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          doc={previewDoc}
          db={db}
          initialAttachmentId={
            previewDoc.attachments.find((a) => a.isSignedCopy)?.id ??
            previewDoc.attachments[0]?.id
          }
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-component: Grid vs. List Archive File Renderer                         */
/* -------------------------------------------------------------------------- */

function ArchiveFilesSection({
  db,
  docs,
  viewMode,
  showFolderBadge,
  onPreview,
  onDownload,
  onFolderClick,
  onClearFilters,
  emptyTitle,
  emptyMessage,
}: {
  db: Database
  docs: DocRecord[]
  viewMode: ArchiveLayoutMode
  showFolderBadge?: boolean
  onPreview: (doc: DocRecord) => void
  onDownload: (doc: DocRecord) => void
  onFolderClick?: (typeId: string) => void
  onClearFilters?: () => void
  emptyTitle: string
  emptyMessage: string
}) {
  if (docs.length === 0) {
    return (
      <EmptyState
        icon={onClearFilters ? SearchX : Archive}
        title={emptyTitle}
        action={
          onClearFilters ? (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              Reset filters
            </Button>
          ) : undefined
        }
      >
        {emptyMessage}
      </EmptyState>
    )
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc) => (
          <ArchiveGridCard
            key={doc.id}
            db={db}
            doc={doc}
            showFolderBadge={showFolderBadge}
            onPreview={() => onPreview(doc)}
            onDownload={() => onDownload(doc)}
            onFolderClick={onFolderClick}
          />
        ))}
      </div>
    )
  }

  return (
    <ArchiveListTable
      db={db}
      docs={docs}
      showFolderBadge={showFolderBadge}
      onPreview={onPreview}
      onDownload={onDownload}
      onFolderClick={onFolderClick}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Grid View Card (Google Drive File Card Style)                              */
/* -------------------------------------------------------------------------- */

function ArchiveGridCard({
  db,
  doc,
  showFolderBadge,
  onPreview,
  onDownload,
  onFolderClick,
}: {
  db: Database
  doc: DocRecord
  showFolderBadge?: boolean
  onPreview: () => void
  onDownload: () => void
  onFolderClick?: (typeId: string) => void
}) {
  const docType: DocumentType | undefined = typeOf(db, doc)
  const requester = userById(db, doc.requesterId)
  const signedCopy = doc.attachments.find((a) => a.isSignedCopy)
  const primaryFile = signedCopy ?? doc.attachments[0]
  const totalKb = docTotalSizeKb(doc)
  const releasedAt = docReleasedAt(doc)

  return (
    <div
      onClick={onPreview}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPreview()
        }
      }}
      className="group flex cursor-pointer flex-col justify-between rounded-xl bg-white p-4 shadow-card ring-1 ring-ink-200/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised hover:ring-brand-400"
    >
      <div>
        {/* Card Header: File Type Icon + Category Badge + Unit Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset transition-colors',
                signedCopy
                  ? 'bg-success-50 text-success-600 ring-success-100 group-hover:bg-success-100/70'
                  : 'bg-brand-50 text-brand-700 ring-brand-100 group-hover:bg-brand-100/70',
              )}
            >
              {signedCopy ? (
                <FileCheck2 className="size-5" aria-hidden />
              ) : (
                <FileText className="size-5" aria-hidden />
              )}
            </span>

            <div className="min-w-0">
              {showFolderBadge && docType ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFolderClick?.(doc.typeId)
                  }}
                  className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-md bg-amber-100/70 px-2 py-0.5 text-[11px] font-bold text-warning-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-200/70 transition-colors"
                  title={`Open folder: ${docType.name}`}
                >
                  <Folder className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{docType.name}</span>
                </button>
              ) : (
                <span className="block truncate text-xs font-bold text-brand-800">
                  {docType?.name ?? doc.typeId}
                </span>
              )}
              <span className="mt-0.5 block font-mono text-[11px] font-semibold text-ink-500">
                {controlNumber(doc)}
              </span>
            </div>
          </div>

          <Badge tone={doc.origin === 'IDS' ? 'ids' : 'brand'} dot={false}>
            {doc.origin}
          </Badge>
        </div>

        {/* Document Title & Mini File Preview Strip */}
        <div className="mt-3.5">
          <Link
            to={`/app/documents/${doc.id}`}
            onClick={(e) => e.stopPropagation()}
            title={doc.title}
            className="line-clamp-2 text-sm font-bold text-ink-900 group-hover:text-brand-700 hover:underline leading-snug"
          >
            {doc.title}
          </Link>

          {/* Attached Signed Scan Pill */}
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-ink-50/80 px-3 py-2 text-xs ring-1 ring-inset ring-ink-100">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2
                className="size-3.5 shrink-0 text-success-600"
                aria-hidden
              />
              <span className="truncate font-medium text-ink-700">
                {primaryFile ? primaryFile.name : 'Official Record Sheet'}
              </span>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-ink-500">
              {formatSize(totalKb)}
            </span>
          </div>
        </div>
      </div>

      {/* Card Footer: Requester + Release Date + Action Bar */}
      <div className="mt-4 pt-3 border-t border-ink-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={requester?.name ?? '?'} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ink-800">
                {requester?.name ?? 'Unknown'}
              </p>
              <p className="truncate text-[11px] text-ink-500">
                {requester?.role === 'student' ? 'Student' : 'Faculty'}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-700">
              <Calendar className="size-3 text-ink-400" aria-hidden />
              {formatDate(releasedAt)}
            </span>
            <p className="text-[10px] text-ink-500">
              Released {timeAgo(releasedAt)}
            </p>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPreview()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors"
              title="Preview signed document in-app"
            >
              <Eye className="size-3.5" aria-hidden />
              <span>Preview</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDownload()
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-100 hover:text-ink-900 transition-colors"
              title="Download official PDF copy"
            >
              <Download className="size-3.5" aria-hidden />
              <span>PDF</span>
            </button>
          </div>

          <Link
            to={`/app/documents/${doc.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
          >
            <span>Audit Trail</span>
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* List View Table (Windows Explorer Details / Google Drive List Mode)        */
/* -------------------------------------------------------------------------- */

function ArchiveListTable({
  db,
  docs,
  showFolderBadge,
  onPreview,
  onDownload,
  onFolderClick,
}: {
  db: Database
  docs: DocRecord[]
  showFolderBadge?: boolean
  onPreview: (doc: DocRecord) => void
  onDownload: (doc: DocRecord) => void
  onFolderClick?: (typeId: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-ink-100">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
            <th className="px-4 py-3.5 min-w-[280px]">Name &amp; Control No.</th>
            {showFolderBadge && (
              <th className="px-4 py-3.5 min-w-[180px]">Category Folder</th>
            )}
            <th className="px-4 py-3.5 min-w-[90px]">Unit</th>
            <th className="px-4 py-3.5 min-w-[190px]">Requester</th>
            <th className="px-4 py-3.5 min-w-[150px] whitespace-nowrap">
              Released Date
            </th>
            <th className="px-4 py-3.5 min-w-[90px] whitespace-nowrap">Size</th>
            <th className="px-4 py-3.5 text-right min-w-[190px]">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white">
          {docs.map((doc) => {
            const docType = typeOf(db, doc)
            const requester = userById(db, doc.requesterId)
            const signedCopy = doc.attachments.find((a) => a.isSignedCopy)
            const totalKb = docTotalSizeKb(doc)
            const releasedAt = docReleasedAt(doc)

            return (
              <tr
                key={doc.id}
                onClick={() => onPreview(doc)}
                className="group cursor-pointer transition-colors hover:bg-brand-50/60"
              >
                {/* Name & Control Number */}
                <td className="px-4 py-3.5 max-w-md">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
                        signedCopy
                          ? 'bg-success-50 text-success-600 ring-success-100'
                          : 'bg-brand-50 text-brand-700 ring-brand-100',
                      )}
                    >
                      {signedCopy ? (
                        <FileCheck2 className="size-4" aria-hidden />
                      ) : (
                        <FileText className="size-4" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0">
                      <Link
                        to={`/app/documents/${doc.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={doc.title}
                        className="block truncate font-semibold text-ink-900 group-hover:text-brand-700 hover:underline"
                      >
                        {doc.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                        <span className="font-mono font-medium">
                          {controlNumber(doc)}
                        </span>
                        {signedCopy && (
                          <span className="rounded bg-success-50 px-1.5 py-0.2 text-[10px] font-bold text-success-700 ring-1 ring-inset ring-success-100">
                            Signed Copy
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Category Folder */}
                {showFolderBadge && (
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onFolderClick?.(doc.typeId)
                      }}
                      className="inline-flex max-w-[200px] items-center gap-1.5 truncate rounded-lg bg-amber-100/60 px-2.5 py-1 text-xs font-semibold text-warning-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-200/70 transition-colors"
                    >
                      <Folder className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{docType?.name ?? doc.typeId}</span>
                    </button>
                  </td>
                )}

                {/* Unit */}
                <td className="px-4 py-3.5">
                  <Badge tone={doc.origin === 'IDS' ? 'ids' : 'brand'} dot={false}>
                    {doc.origin}
                  </Badge>
                </td>

                {/* Requester */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={requester?.name ?? '?'} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink-800">
                        {requester?.name ?? 'Unknown'}
                      </p>
                      <p className="truncate text-[11px] text-ink-500">
                        {requester?.role === 'student' ? 'Student' : 'Faculty'}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Released Date */}
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="text-xs font-semibold text-ink-800">
                    {formatDate(releasedAt)}
                  </div>
                  <div className="text-[11px] text-ink-500">
                    {doc.release?.receivedBy
                      ? `Claimed by ${doc.release.receivedBy}`
                      : `Updated ${timeAgo(releasedAt)}`}
                  </div>
                </td>

                {/* File Size */}
                <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-ink-600">
                  {formatSize(totalKb)}
                </td>

                {/* Actions */}
                <td className="px-4 py-3.5 whitespace-nowrap text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPreview(doc)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-600 hover:text-white transition-colors"
                      title="In-App Quick Preview"
                    >
                      <Eye className="size-3.5" aria-hidden />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDownload(doc)
                      }}
                      className="inline-flex items-center rounded-lg bg-ink-50 p-1.5 text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                      title="Download PDF Copy"
                      aria-label={`Download ${doc.title}`}
                    >
                      <Download className="size-3.5" aria-hidden />
                    </button>

                    <Link
                      to={`/app/documents/${doc.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
                      title="View Full Audit Record"
                    >
                      <span>Record</span>
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
