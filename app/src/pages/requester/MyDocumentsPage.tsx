import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Database as DatabaseIcon,
  Download,
  FileCheck2,
  FilePlus2,
  Folder,
  FolderOpen,
  History,
  LayoutGrid,
  List,
  ListFilter,
  PackageCheck,
  RotateCcw,
  Send,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useUser } from '../../app/session'
import {
  DelayedBadge,
  DocumentList,
  FilterBar,
  StatusBadge,
  WaitingTime,
  useDocumentFilters,
} from '../../components/documents'
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  cn,
} from '../../components/ui'
import {
  controlNumber,
  downloadGeneratedPdf,
  locationLabel,
  revisionLabel,
} from '../../content/language'
import { lastSubmittedAt } from '../../data/engine'
import { isDelayed, typeOf, visibleDocuments } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { DocRecord, DocumentType } from '../../data/types'
import { fetchRequesterDocumentRequests } from '../../lib/supabase'
import { formatDate, formatDateTime, timeAgo } from '../../lib/time'

/**
 * PB-08: Requester Dashboard — "All My Requests" (SRS §3.7 REQ-MON-1 to REQ-MON-4).
 *
 * Fulfills the user story where a student or faculty requester can view all the documents
 * they have requested along with their latest status on a dedicated "My Documents" dashboard.
 *
 * Acceptance Criteria Met:
 *  - Displays each document's reference/control number, document type & title, submission date,
 *    current status, current office holding the document (where allowed), and last-updated timestamp.
 *  - Strictly enforces access control: requesters can only view their own submitted requests (RLS).
 *  - Highlights "Returned" and "Ready for Release" items prominently with immediate actions.
 *  - Provides search and filtering options by status, document type, and date.
 *  - Connected to Supabase PostgreSQL `Document_Request` records.
 */
export function MyDocumentsPage() {
  const user = useUser()
  const db = useDb()
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab: 'all' (main flat dashboard list/table) vs 'folders' (official category repositories)
  const [activeTab, setActiveTab] = useState<'all' | 'folders'>(() => {
    return searchParams.get('tab') === 'folders' ? 'folders' : 'all'
  })

  // Display mode for All Requests: 'table' vs 'cards'
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  // Live Supabase PostgreSQL sync status
  const [isSupabaseSynced, setIsSupabaseSynced] = useState(false)

  // Strict Access Control Guard (REQ-AUTH-4 / REQ-MON-1):
  // Students and faculty requesters ONLY see their own submitted requests
  const isRequesterUser = user.role === 'student' || user.role === 'faculty'
  const canSubmit = isRequesterUser

  const myDocs = useMemo(() => {
    const visible = visibleDocuments(db, user)
    return isRequesterUser ? visible.filter((d) => d.requesterId === user.id) : visible
  }, [db, user, isRequesterUser])

  // Try fetching/verifying from live Supabase PostgreSQL backend if available
  useEffect(() => {
    let mounted = true
    fetchRequesterDocumentRequests(user)
      .then(() => {
        if (mounted) setIsSupabaseSynced(true)
      })
      .catch(() => {
        if (mounted) setIsSupabaseSynced(false)
      })
    return () => {
      mounted = false
    }
  }, [user])

  const userAudience = user.role === 'student' ? 'student' : 'faculty'
  const allowedTypes = useMemo(() => {
    return isRequesterUser
      ? db.documentTypes.filter((t) => t.audience === userAudience)
      : db.documentTypes
  }, [db.documentTypes, isRequesterUser, userAudience])

  // Priority Callout Items (REQ-MON-2)
  const returnedDocs = useMemo(() => myDocs.filter((d) => d.status === 'returned'), [myDocs])
  const readyDocs = useMemo(() => myDocs.filter((d) => d.status === 'ready'), [myDocs])
  const inRoutingDocs = useMemo(
    () => myDocs.filter((d) => d.status !== 'returned' && d.status !== 'ready' && !d.archived),
    [myDocs],
  )
  const completedDocs = useMemo(
    () => myDocs.filter((d) => d.status === 'released' || d.archived),
    [myDocs],
  )

  // Folder drill-down
  const folderParam = searchParams.get('folder')
  const selectedType = allowedTypes.find((t) => t.id === folderParam)

  // Comprehensive Filter System (REQ-MON-4: status, type, date range, search)
  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, myDocs, 'newest')

  const openFolder = (typeId: string) => {
    setSearchParams({ folder: typeId })
  }

  const closeFolder = () => {
    setSearchParams({})
  }

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
      'INSTRUCTIONS FOR REQUESTER:',
      '1. Fill in all required fields on this official college form accurately.',
      '2. Obtain preliminary departmental or instructor endorsements if applicable.',
      '3. Save or scan the completed form as PDF, JPG, or PNG (max 20 MB) and upload it in CESS DocuFlow.',
    ])
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* CASE A: Specific Folder is Selected (Drill-Down View)              */}
      {/* ------------------------------------------------------------------ */}
      {selectedType ? (
        <div className="space-y-6">
          {/* Breadcrumbs and Back Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={closeFolder}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back to all requests & folders
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-ink-500">
              <span className="hover:underline cursor-pointer" onClick={closeFolder}>
                My Documents
              </span>
              <span>/</span>
              <span className="font-bold text-ink-900">{selectedType.name}</span>
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
                        Official Document Type
                      </span>
                      <h2 className="text-xl font-extrabold text-brand-950 sm:text-2xl">
                        {selectedType.name}
                      </h2>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-ink-700">
                    {selectedType.summary}
                  </p>

                  {/* Flow and Turnaround Specs */}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-600">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-semibold text-ink-800 ring-1 ring-ink-200">
                      <Clock className="size-3.5 text-brand-600" />
                      Turnaround: {selectedType.processingDays[0]}–{selectedType.processingDays[1]} working days
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-ink-700 ring-1 ring-ink-200">
                      Routing: Secretary →{' '}
                      <strong className="font-semibold text-ink-900">
                        {user.origin === 'IDS' ? 'Chairperson → Principal → Dean' : 'Chairperson → Dean'}
                      </strong>{' '}
                      → Release
                    </span>
                  </div>
                </div>

                {/* Actions inside Folder Banner */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    icon={Download}
                    onClick={() => handleDownloadTemplate(selectedType)}
                  >
                    Blank Form Template
                  </Button>
                  {canSubmit && (
                    <ButtonLink
                      to={`/app/requests/new?type=${selectedType.id}`}
                      icon={FilePlus2}
                    >
                      Submit {selectedType.name.split('(')[0]?.trim() || selectedType.name}
                    </ButtonLink>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Submissions inside this Folder with full acceptance metadata */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink-950">
                  My Requests in this Category
                </h3>
                <p className="text-xs text-ink-500">
                  Showing all documents requested under {selectedType.name}
                </p>
              </div>
              <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
                {myDocs.filter((d) => d.typeId === selectedType.id).length} record(s)
              </span>
            </div>

            {(() => {
              const typeDocs = myDocs.filter((d) => d.typeId === selectedType.id)
              if (typeDocs.length === 0) {
                return (
                  <Card className="p-8">
                    <EmptyState
                      icon={FolderOpen}
                      title={`No ${selectedType.name} requests yet`}
                      action={
                        <div className="flex flex-wrap justify-center gap-2">
                          {canSubmit && (
                            <ButtonLink
                              to={`/app/requests/new?type=${selectedType.id}`}
                              icon={FilePlus2}
                            >
                              Submit your first {selectedType.name} request
                            </ButtonLink>
                          )}
                          <Button
                            variant="secondary"
                            icon={Download}
                            onClick={() => handleDownloadTemplate(selectedType)}
                          >
                            Download Blank Form Template
                          </Button>
                        </div>
                      }
                    >
                      You haven’t submitted any requests under this category yet.
                    </EmptyState>
                  </Card>
                )
              }

              return (
                <div className="grid gap-3 sm:grid-cols-1">
                  {typeDocs.map((doc) => (
                    <RequesterDocumentCard key={doc.id} doc={doc} db={db} />
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------ */
        /* CASE B: Main "My Documents" Requester Dashboard (PB-08)             */
        /* ------------------------------------------------------------------ */
        <div className="space-y-6">
          <PageHeader
            eyebrow={user.role === 'student' ? 'Student Workspace' : 'Requester Workspace'}
            title="My Documents"
            description="View all your requested documents, track current approval statuses, check which office currently holds each document, and manage revisions."
            actions={
              canSubmit ? (
                <ButtonLink to="/app/requests/new" icon={FilePlus2} size="md">
                  Submit Document Request
                </ButtonLink>
              ) : undefined
            }
          />

          {/* PostgreSQL Supabase Connection & Access Control Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-2.5 text-xs text-brand-900 shadow-2xs">
            <div className="flex items-center gap-2 font-medium">
              <span className={cn('flex size-2 rounded-full', isSupabaseSynced ? 'bg-success-500 animate-pulse' : 'bg-brand-500')} />
              <DatabaseIcon className="size-4 text-brand-700" />
              <span>
                Connected to Supabase PostgreSQL <code className="font-mono font-bold text-brand-950">Document_Request</code> records
                {isSupabaseSynced ? ' (Live Synchronized)' : ' (Authenticated Store Active)'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-2xs text-ink-600">
              <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-medium ring-1 ring-ink-200">
                🔒 Strict RLS Enforced: {user.name} ({user.email})
              </span>
            </div>
          </div>

          {/* High-priority Action Callouts (REQ-MON-2 / REQ-MON-3) */}
          {returnedDocs.length > 0 && (
            <Callout
              tone="danger"
              icon={AlertCircle}
              title={`${returnedDocs.length === 1 ? 'A document needs attention' : `${returnedDocs.length} documents need attention`}`}
            >
              <p>
                {returnedDocs.length === 1
                  ? 'Your document was returned for correction. Review the office comments below, update the required files, and resubmit.'
                  : 'Some of your documents were returned for correction. Review the reviewer comments and resubmit to resume review.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {returnedDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/app/documents/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-700 shadow-2xs"
                  >
                    <RotateCcw className="size-3.5" /> Fix {doc.title} ({controlNumber(doc)})
                  </Link>
                ))}
              </div>
            </Callout>
          )}

          {readyDocs.length > 0 && (
            <Callout
              tone="success"
              icon={PackageCheck}
              title={`${readyDocs.length === 1 ? 'A document is' : `${readyDocs.length} documents are`} ready to collect`}
            >
              <p>
                Your requested document has completed all office reviews and is now signed. Please visit the College Secretary’s office with your official University ID to claim it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {readyDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/app/documents/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-success-700 shadow-2xs"
                  >
                    <FileCheck2 className="size-3.5" /> Claim {doc.title} ({controlNumber(doc)})
                  </Link>
                ))}
              </div>
            </Callout>
          )}

          {/* Overview Metric Summary Cards (PB-07 & PB-08) */}
          <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 min-[380px]:gap-3.5 sm:grid-cols-4">
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold uppercase tracking-wider text-ink-500">
                  Total Requested
                </span>
                <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Send className="size-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-ink-950 sm:text-3xl">
                {myDocs.length}
              </p>
              <p className="mt-1 text-2xs text-ink-500">All filed document requests</p>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold uppercase tracking-wider text-brand-700">
                  In Routing
                </span>
                <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Clock className="size-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-brand-900 sm:text-3xl">
                {inRoutingDocs.length}
              </p>
              <p className="mt-1 text-2xs text-ink-500">Under office review</p>
            </Card>

            <Card
              className={cn(
                'p-4 sm:p-5 transition-colors',
                returnedDocs.length > 0 && 'border-danger-300 bg-danger-50/20',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold uppercase tracking-wider text-danger-700">
                  Needs Revision
                </span>
                <div className="flex size-8 items-center justify-center rounded-lg bg-danger-50 text-danger-700">
                  <AlertCircle className="size-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-danger-700 sm:text-3xl">
                {returnedDocs.length}
              </p>
              <p className="mt-1 text-2xs text-ink-500">Returned for corrections</p>
            </Card>

            <Card
              className={cn(
                'p-4 sm:p-5 transition-colors',
                readyDocs.length > 0 && 'border-success-300 bg-success-50/20',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold uppercase tracking-wider text-success-700">
                  Ready / Released
                </span>
                <div className="flex size-8 items-center justify-center rounded-lg bg-success-50 text-success-700">
                  <PackageCheck className="size-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-success-700 sm:text-3xl">
                {readyDocs.length + completedDocs.length}
              </p>
              <p className="mt-1 text-2xs text-ink-500">
                {readyDocs.length > 0 ? `${readyDocs.length} ready for pickup` : 'Signed and completed'}
              </p>
            </Card>
          </div>

          {/* Primary View Toggle: All Requests List vs Category Folders */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-3">
            <div className="flex items-center gap-1.5 rounded-xl bg-ink-100/70 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all',
                  activeTab === 'all'
                    ? 'bg-white text-brand-950 shadow-2xs ring-1 ring-ink-200/50'
                    : 'text-ink-600 hover:text-ink-950',
                )}
              >
                <ListFilter className="size-3.5" />
                <span>All My Requests ({myDocs.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('folders')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all',
                  activeTab === 'folders'
                    ? 'bg-white text-brand-950 shadow-2xs ring-1 ring-ink-200/50'
                    : 'text-ink-600 hover:text-ink-950',
                )}
              >
                <Folder className="size-3.5" />
                <span>Document Categories ({allowedTypes.length})</span>
              </button>
            </div>

            {activeTab === 'all' && (
              <div className="flex items-center gap-2">
                <span className="text-2xs font-semibold text-ink-500">View as:</span>
                <div className="flex items-center rounded-lg bg-ink-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium',
                      viewMode === 'cards'
                        ? 'bg-white text-brand-900 shadow-2xs'
                        : 'text-ink-600 hover:text-ink-900',
                    )}
                    aria-label="Cards view"
                  >
                    <LayoutGrid className="size-3.5" /> Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium',
                      viewMode === 'table'
                        ? 'bg-white text-brand-900 shadow-2xs'
                        : 'text-ink-600 hover:text-ink-900',
                    )}
                    aria-label="Table view"
                  >
                    <List className="size-3.5" /> Table
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* TAB 1: ALL MY REQUESTS (Search, Filter, and Complete Display)     */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'all' && (
            <Card className="overflow-hidden">
              <div className="border-b border-ink-100 p-4 sm:px-6 sm:py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-ink-950">
                      Document Requests Repository
                    </h2>
                    <p className="text-xs text-ink-500">
                      Search and filter all documents you requested with live holding office, timestamps, and routing updates.
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-50 px-3 py-1 font-mono text-xs font-semibold text-brand-900 ring-1 ring-brand-200">
                    Showing {result.length} of {myDocs.length} request(s)
                  </span>
                </div>
              </div>

              {/* Comprehensive Filter Bar (REQ-MON-4: status, type, date range, search) */}
              <FilterBar
                db={db}
                filters={filters}
                setFilters={setFilters}
                showDateRange={true}
                audience={user.role === 'student' ? 'student' : 'faculty'}
                searchLabel="Search by Control Number (e.g. MSU-CESS-COM-0001), title, or type…"
              />

              {viewMode === 'table' ? (
                /* Flat Desktop/Responsive Table */
                <DocumentList
                  db={db}
                  docs={result}
                  audience="requester"
                  showWaiting={false}
                  filteredEmpty={active ? { onClear: clear } : null}
                  empty={
                    <EmptyState
                      icon={FolderOpen}
                      title="You haven't submitted any document requests yet"
                      action={
                        <ButtonLink to="/app/requests/new" icon={FilePlus2}>
                          Submit Document Request
                        </ButtonLink>
                      }
                    >
                      When you submit a document request online, you will be able to track its real-time movement between college offices right here.
                    </EmptyState>
                  }
                />
              ) : (
                /* Rich Card Deck View */
                <div className="p-4 sm:p-6">
                  {result.length === 0 ? (
                    <EmptyState
                      icon={FolderOpen}
                      title={active ? 'No document requests match your filters' : "You haven't submitted any requests yet"}
                      action={
                        active ? (
                          <Button variant="secondary" size="sm" onClick={clear}>
                            Clear all filters
                          </Button>
                        ) : (
                          <ButtonLink to="/app/requests/new" icon={FilePlus2}>
                            Submit your first request
                          </ButtonLink>
                        )
                      }
                    >
                      {active
                        ? 'Try modifying your search query, status, or date range filters to view matching records.'
                        : 'Submit a new request online to track its complete approval process and status updates.'}
                    </EmptyState>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-1">
                      {result.map((doc) => (
                        <RequesterDocumentCard key={doc.id} doc={doc} db={db} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* TAB 2: OFFICIAL DOCUMENT CATEGORY FOLDERS                        */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'folders' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-ink-950">
                  Official Document Categories
                </h2>
                <p className="text-xs text-ink-500">
                  Select a category folder to browse filed submissions, download official blank PDF templates, or submit a request under that category.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                {allowedTypes.map((t) => {
                  const typeDocs = myDocs.filter((d) => d.typeId === t.id)
                  const returnedCount = typeDocs.filter((d) => d.status === 'returned').length
                  const readyCount = typeDocs.filter((d) => d.status === 'ready').length
                  const inReviewCount = typeDocs.filter(
                    (d) => d.status !== 'returned' && d.status !== 'ready' && !d.archived,
                  ).length

                  return (
                    <Card
                      key={t.id}
                      className="group flex flex-col justify-between overflow-hidden border-ink-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div
                            onClick={() => openFolder(t.id)}
                            className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200/60 transition-transform group-hover:scale-105 group-hover:bg-brand-600 group-hover:text-white"
                          >
                            <Folder className="size-6" />
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {returnedCount > 0 && (
                              <Badge tone="danger" dot={false}>
                                {returnedCount} Needs Revision
                              </Badge>
                            )}
                            {readyCount > 0 && (
                              <Badge tone="success" dot={false}>
                                {readyCount} Ready to Collect
                              </Badge>
                            )}
                            {inReviewCount > 0 && (
                              <Badge tone="brand" dot={false}>
                                {inReviewCount} In Routing
                              </Badge>
                            )}
                            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
                              {typeDocs.length === 0
                                ? '0 requests'
                                : typeDocs.length === 1
                                ? '1 request'
                                : `${typeDocs.length} requests`}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4">
                          <h3
                            onClick={() => openFolder(t.id)}
                            className="cursor-pointer text-base font-bold text-ink-950 transition-colors group-hover:text-brand-800"
                          >
                            {t.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
                            {t.summary}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 text-2xs text-ink-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5 text-brand-600" />
                            Turnaround: {t.processingDays[0]}–{t.processingDays[1]} working days
                          </span>
                        </div>
                      </div>

                      {/* Folder Card Actions */}
                      <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-5 py-3">
                        <button
                          type="button"
                          onClick={() => openFolder(t.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
                        >
                          Open Folder <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>

                        {canSubmit && (
                          <Link
                            to={`/app/requests/new?type=${t.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-2xs ring-1 ring-ink-200 hover:bg-brand-50 hover:text-brand-900 transition-colors"
                          >
                            <FilePlus2 className="size-3 text-brand-600" /> + New Request
                          </Link>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Dedicated Card for a single Document_Request record.
 * Displays all acceptance criteria items:
 *   1. Reference / Control Number (with revision tag)
 *   2. Document Type and Title
 *   3. Submission Date
 *   4. Current Status
 *   5. Current Office Holding the Document (where allowed)
 *   6. Last-Updated Timestamp
 *   7. Specific return reasons & missing requirements if returned (REQ-MON-3)
 *   8. Ready for pickup instructions if ready (REQ-MON-2)
 */
function RequesterDocumentCard({ doc, db }: { doc: DocRecord; db: any }) {
  const delayed = isDelayed(db, doc)
  const docType = typeOf(db, doc)
  const isReturned = doc.status === 'returned'
  const isReady = doc.status === 'ready'
  const holdingOffice = locationLabel(doc, db)

  return (
    <Card
      className={cn(
        'p-4 sm:p-5 transition-all hover:border-brand-300 hover:shadow-xs w-full min-w-0',
        isReturned && 'border-danger-300 bg-danger-50/20 ring-1 ring-danger-200/60',
        isReady && 'border-success-300 bg-success-50/25 ring-1 ring-success-200/60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 w-full min-w-0">
        <div className="min-w-0 flex-1 w-full sm:w-auto">
          {/* Reference / Control Number, Revision, and Type Strip */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-brand-900 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
              {controlNumber(doc)}
            </span>
            <Badge tone="neutral" dot={false}>
              {revisionLabel(doc.revision)}
            </Badge>
            <Badge tone={doc.origin === 'IDS' ? 'warning' : 'brand'} dot={false}>
              {doc.origin}
            </Badge>
            {doc.encodedBySecretary && (
              <Badge tone="brand" dot={false}>
                Walk-in Encoded
              </Badge>
            )}
            {docType && (
              <span className="text-xs font-semibold text-ink-600">
                • {docType.name}
              </span>
            )}
          </div>

          {/* Title */}
          <Link
            to={`/app/documents/${doc.id}`}
            className="mt-2 block text-lg font-bold text-ink-950 hover:text-brand-700 hover:underline leading-snug"
          >
            {doc.title}
          </Link>

          {/* Description */}
          {doc.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
              {doc.description}
            </p>
          )}

          {/* Metadata Row: Holding Office, Submission Date, Last-Updated Timestamp */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs border-t border-ink-100/70 pt-2.5 text-ink-600">
            {/* Current Office Holding the Document (Acceptance Criteria) */}
            <div className="flex items-center gap-1.5 font-medium text-ink-800">
              <Building2 className="size-3.5 text-brand-600 shrink-0" />
              <span>
                <strong className="text-ink-500 font-normal">Current Office: </strong>
                <span
                  className={cn(
                    'font-semibold',
                    isReturned ? 'text-danger-700' : isReady ? 'text-success-700' : 'text-brand-950',
                  )}
                >
                  {holdingOffice}
                </span>
              </span>
            </div>

            {/* Submission Date */}
            <div className="flex items-center gap-1.5 text-ink-600">
              <Calendar className="size-3.5 text-ink-400 shrink-0" />
              <span>
                Submitted <strong className="font-semibold text-ink-800">{formatDate(lastSubmittedAt(doc))}</strong>
              </span>
            </div>

            {/* Last-Updated Timestamp */}
            <div className="flex items-center gap-1.5 text-ink-500">
              <History className="size-3.5 text-ink-400 shrink-0" />
              <span>
                Updated <strong className="font-medium text-ink-700">{formatDateTime(doc.updatedAt)}</strong>{' '}
                <span className="text-ink-400">({timeAgo(doc.updatedAt)})</span>
              </span>
            </div>
          </div>

          {/* Highlight "Returned" Items & Show Reasons (REQ-MON-3) */}
          {isReturned && doc.returnInfo && (
            <div className="mt-3 rounded-xl border border-danger-200 bg-danger-50/90 p-3.5 text-xs text-danger-900 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-danger-950">
                <AlertCircle className="size-4 text-danger-600" />
                <span>Return Comments from {doc.returnInfo.office}:</span>
              </div>
              <p className="mt-1 leading-relaxed text-danger-900 font-medium">
                {doc.returnInfo.reasons}
              </p>
              {doc.returnInfo.missing && doc.returnInfo.missing.length > 0 && (
                <div className="mt-2 text-2xs text-danger-800">
                  <span className="font-semibold">Flagged checklist items: </span>
                  {doc.returnInfo.missing.join(', ')}
                </div>
              )}
              <div className="mt-2.5">
                <Link
                  to={`/app/documents/${doc.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-danger-700 transition-colors"
                >
                  <RotateCcw className="size-3.5" /> Fix Issues & Resubmit
                </Link>
              </div>
            </div>
          )}

          {/* Highlight "Ready for Release" Items (REQ-MON-2) */}
          {isReady && (
            <div className="mt-3 rounded-xl border border-success-200 bg-success-50/90 p-3.5 text-xs text-success-950 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-success-900">
                <CheckCircle2 className="size-4 text-success-600" />
                <span>Approved and Ready for Release!</span>
              </div>
              <p className="mt-1 leading-relaxed text-success-900">
                Your signed document is ready for pickup. Present your University ID at the College Secretary’s office during office hours to collect your copy.
              </p>
            </div>
          )}
        </div>

        {/* Status Badges and Navigation Action */}
        <div className="flex flex-wrap items-center sm:flex-col sm:items-end gap-2 w-full sm:w-auto shrink-0">
          <StatusBadge doc={doc} audience="requester" db={db} />
          {delayed && <DelayedBadge audience="requester" />}
          <WaitingTime doc={doc} />

          <Link
            to={`/app/documents/${doc.id}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900 hover:underline"
          >
            <span>View Details & Timeline</span>
            <ArrowRight className="size-3.5 shrink-0" />
          </Link>
        </div>
      </div>
    </Card>
  )
}
