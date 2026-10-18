import { AlertCircle, FilePlus2, FolderOpen, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUser } from '../../app/session'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { ButtonLink, Callout, Card, EmptyState, PageHeader } from '../../components/ui'
import { visibleDocuments } from '../../data/selectors'
import { useDb } from '../../data/store'

export function MyDocumentsPage() {
  const user = useUser()
  const db = useDb()
  const myDocs = visibleDocuments(db, user)

  const returnedDocs = myDocs.filter((d) => d.status === 'returned')
  const readyDocs = myDocs.filter((d) => d.status === 'ready')

  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, myDocs, 'newest')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Requester Dashboard"
        title="My Document Requests"
        description="Track the progress of your submitted documents, review feedback, and find out when your signed documents are ready for pickup."
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
          title={`${returnedDocs.length === 1 ? 'A document needs' : `${returnedDocs.length} documents need`} your attention`}
        >
          <p>
            {returnedDocs.length === 1
              ? 'Your document was returned for correction. Please review the comments, update the required files, and resubmit.'
              : 'Some of your documents were returned for correction. Please review the comments and submit the corrected files.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {returnedDocs.map((doc) => (
              <Link
                key={doc.id}
                to={`/app/documents/${doc.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-700"
              >
                Fix {doc.title}
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

      {/* Main Document Table / List */}
      <Card>
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
              When you submit a document request online, you will be able to track its movement between college offices in real time right here.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
