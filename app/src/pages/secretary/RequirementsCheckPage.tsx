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
        eyebrow="Verification Queue"
        title="Verify Submissions & Route"
        description="Review incoming document requests for accuracy before logging and routing to reviewing offices."
      />

      <Callout tone="brand" icon={Info} title="Content Verification Guide">
        All required attachments are already checked and present. Verify that details and form contents are accurate.
        If any information needs correction, return the document with notes. Otherwise, mark Complete to route it.
      </Callout>

      <Card>
        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          statuses={['submitted']}
          audience="all"
          searchLabel="Search submissions awaiting verification…"
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
              title="No pending submissions"
            >
              All submissions have been verified. New requests will appear here automatically.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
