import { Inbox } from 'lucide-react'
import { useUser } from '../../app/session'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { OFFICE_LABEL } from '../../content/language'
import { reviewInbox } from '../../data/selectors'
import { useDb } from '../../data/store'

export function ForReviewPage() {
  const user = useUser()
  const db = useDb()
  const inboxDocs = reviewInbox(db, user)
  const officeName = OFFICE_LABEL[user.role as keyof typeof OFFICE_LABEL] || 'Reviewing Office'

  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, inboxDocs, 'oldest')

  const eyebrow =
    user.role === 'chairperson'
      ? 'Department Workspace'
      : user.role === 'ovcaa'
      ? 'OVCAA Workspace'
      : user.role === 'chancellor'
      ? 'Chancellor Workspace'
      : user.role === 'dean'
      ? 'College Dean Workspace'
      : user.role === 'ids_principal'
      ? 'IDS Principal Workspace'
      : 'Review Inbox'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={`Documents Awaiting ${officeName} Action`}
        description={`Review, endorse, approve, return for correction, or disapprove document requests assigned to your office. Requests are prioritized by date submitted (oldest first).`}
      />

      <Card>
        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          audience="all"
          searchLabel="Search pending documents…"
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
              icon={Inbox}
              title="Your review inbox is clear"
            >
              There are no documents currently waiting for action from the {officeName}.
              Documents routed to you will appear here automatically.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
