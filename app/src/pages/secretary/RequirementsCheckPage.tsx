import { CheckSquare, Info } from 'lucide-react'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { Callout, Card, EmptyState, PageHeader } from '../../components/ui'
import { secretaryQueues } from '../../data/selectors'
import { useDb } from '../../data/store'

export function RequirementsCheckPage() {
  const db = useDb()
  const { toCheck } = secretaryQueues(db)
  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, toCheck, 'oldest')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content & Completeness Verification Queue"
        title="Verify Submissions & Route"
        description="Every submission in this queue has already passed the automatic completeness check for required attachments. Verify that the content inside the forms and attachments is accurate before logging and routing (oldest first)."
      />

      <Callout tone="brand" icon={Info} title="Content Verification Guidelines (REQ-REQT-3, REQ-REQT-4)">
        Because the system automatically checks that all required forms are uploaded before a submission reaches you,
        focus on verifying that the information inside each document is complete and accurate. If content issues are
        found, return the submission with clear reasons. Otherwise, mark it Complete to log and route it automatically.
      </Callout>

      <Card>
        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          statuses={['submitted']}
          audience="all"
          searchLabel="Search submissions awaiting content verification…"
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
              icon={CheckSquare}
              title="All submissions have been verified"
            >
              There are currently no new document requests waiting for content verification.
              New submissions will appear here automatically.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
