import {
  AlertCircle,
  Clock,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  PackageCheck,
  RotateCcw,
  Send,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUser } from '../../app/session'
import {
  DocumentList,
  FilterBar,
  useDocumentFilters,
} from '../../components/documents'
import {
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  PageHeader,
} from '../../components/ui'
import { visibleDocuments } from '../../data/selectors'
import { useDb } from '../../data/store'
import { ForReviewPage } from '../reviewer/ForReviewPage'

export function DashboardPage() {
  const user = useUser()
  if (user.role === 'chairperson' || user.role === 'ovcaa' || user.role === 'chancellor') {
    return <ForReviewPage />
  }
  return <RequesterDashboard />
}

function RequesterDashboard() {
  const user = useUser()
  const db = useDb()

  const myDocs = visibleDocuments(db, user).filter((d) => d.requesterId === user.id)
  const returnedDocs = myDocs.filter((d) => d.status === 'returned')
  const readyDocs = myDocs.filter((d) => d.status === 'ready')
  const inRoutingDocs = myDocs.filter(
    (d) => d.status !== 'returned' && d.status !== 'ready' && !d.archived,
  )
  const completedDocs = myDocs.filter((d) => d.status === 'released' || d.archived)

  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, myDocs, 'newest')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={user.role === 'student' ? 'Student Workspace' : 'Requester Workspace'}
        title="Dashboard"
        description="Track the real-time routing progress, current reviewing office, and status of all your submitted documents."
        actions={
          <ButtonLink to="/app/requests/new" icon={FilePlus2} size="md">
            Submit Document Request
          </ButtonLink>
        }
      />

      {/* High-priority Action Callouts */}
      {returnedDocs.length > 0 && (
        <Callout
          tone="danger"
          icon={AlertCircle}
          title={`${returnedDocs.length === 1 ? 'A document needs attention' : `${returnedDocs.length} documents need attention`}`}
        >
          <p>
            {returnedDocs.length === 1
              ? 'Your document was returned for correction. Review the comments and resubmit.'
              : 'Some documents were returned for correction. Review the comments and resubmit.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {returnedDocs.map((doc) => (
              <Link
                key={doc.id}
                to={`/app/documents/${doc.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-700"
              >
                <RotateCcw className="size-3.5" /> Fix {doc.title}
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
            Please visit the College Secretary’s office with your university ID to receive your completed, signed document.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {readyDocs.map((doc) => (
              <Link
                key={doc.id}
                to={`/app/documents/${doc.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-success-700"
              >
                View {doc.title}
              </Link>
            ))}
          </div>
        </Callout>
      )}

      {/* Overview Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-ink-500">
              Total Submitted
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

        <Card className="p-4 sm:p-5">
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

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-success-700">
              Ready / Released
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-success-50 text-success-700">
              <FileCheck2 className="size-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-success-700 sm:text-3xl">
            {readyDocs.length + completedDocs.length}
          </p>
          <p className="mt-1 text-2xs text-ink-500">Ready to collect or signed</p>
        </Card>
      </div>

      {/* Main Flat Table with Search & Filters */}
      <Card>
        <div className="border-b border-ink-100 p-4 sm:px-6 sm:py-4">
          <h2 className="text-base font-bold text-ink-950">
            All Submitted Requests
          </h2>
          <p className="text-xs text-ink-500">
            Search, filter, and track where your documents currently are in the college routing pipeline.
          </p>
        </div>

        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          audience={user.role === 'student' ? 'student' : 'faculty'}
          searchLabel="Search by title, control number, or type…"
        />

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
              When you submit a document request online, you will be able to track its movement
              between college offices in real time right here.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
