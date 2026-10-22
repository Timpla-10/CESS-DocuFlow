import { History, FilePlus2 } from 'lucide-react'
import { useUser } from '../../app/session'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { ButtonLink, Card, EmptyState, PageHeader } from '../../components/ui'
import { OFFICE_LABEL } from '../../content/language'
import { reviewedBy } from '../../data/selectors'
import { useDb } from '../../data/store'

export function ReviewedPage() {
  const user = useUser()
  const db = useDb()
  const myReviewedDocs = reviewedBy(db, user)
  const officeName = OFFICE_LABEL[user.role as keyof typeof OFFICE_LABEL] || 'Reviewing Office'

  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, myReviewedDocs, 'newest')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review History"
        title={`Documents Acted On by ${officeName}`}
        description={`Track the ongoing movement and eventual outcome of documents previously endorsed, approved, or returned by your office.`}
        actions={
          <ButtonLink to="/app/requests/new" icon={FilePlus2} size="md">
            Submit Document Request
          </ButtonLink>
        }
      />

      <Card>
        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          audience="all"
          searchLabel="Search previously reviewed documents…"
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
              icon={History}
              title="No review history recorded yet"
            >
              When your office records endorsements, approvals, or returns, those documents will be listed here.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
