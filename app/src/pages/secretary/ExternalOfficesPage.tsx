import { Building2, Info } from 'lucide-react'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { Callout, Card, EmptyState, PageHeader } from '../../components/ui'
import { secretaryQueues } from '../../data/selectors'
import { useDb } from '../../data/store'

export function ExternalOfficesPage() {
  const db = useDb()
  const { external } = secretaryQueues(db)
  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, external, 'oldest')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="University Inter-Office Coordination"
        title="Documents at External Offices"
        description="Monitor documents temporarily routed outside the college to the Human Resource Management Office (HRMO), the Registrar's Office, or Budget and Accounting."
      />

      <Callout tone="brand" icon={Info} title="External Office Policy">
        External university offices do not maintain system accounts. The College Secretary records document hand-offs
        and returns on their behalf so the location and waiting time of every document remain visible to stakeholders.
      </Callout>

      <Card>
        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          statuses={['with_external']}
          audience="all"
          searchLabel="Search external documents by title or control number…"
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
              icon={Building2}
              title="No documents currently at external offices"
            >
              When a document is sent to HRMO, the Registrar, or Budget & Accounting, it will be tracked here
              until you record its return.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
