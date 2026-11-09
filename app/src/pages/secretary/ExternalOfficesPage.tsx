import { Building2, Info } from 'lucide-react'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { Callout, Card, EmptyState, PageHeader, StatCard } from '../../components/ui'
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
        description="Monitor documents temporarily routed outside the college to the Human Resource Management Office (HRMO), the Registrar's Office, or Budget and Accounting. Record hand-offs and returns with transfer dates, reference numbers, and outcomes."
      />

      {/* Overview Stat Cards by External Office */}
      <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 min-[380px]:gap-3.5 sm:grid-cols-4">
        <StatCard
          label="Total at External Offices"
          value={external.length}
          hint="Under university inter-office processing"
          icon={Building2}
          tone="brand"
        />
        {db.externalOffices.slice(0, 3).map((ext, idx) => {
          const count = external.filter((d) => d.externalOffice === ext.id).length
          const tones: ('warning' | 'success' | 'neutral')[] = ['warning', 'success', 'neutral']
          return (
            <StatCard
              key={ext.id}
              label={ext.shortLabel || ext.label}
              value={count}
              hint={`Pending with ${ext.label}`}
              icon={Building2}
              tone={tones[idx % tones.length]}
            />
          )
        })}
      </div>

      <Callout tone="brand" icon={Info} title="External Office Transfer Policy">
        External university offices (HRMO, Registrar, Budget & Accounting) do not require system accounts. The College Secretary records document transfers, transfer dates, reference numbers, and return outcomes on their behalf so the location and turnaround times remain fully traceable.
      </Callout>

      <Card>
        <div className="border-b border-ink-100 p-4 sm:px-6 sm:py-4">
          <h2 className="text-base font-bold text-ink-950">
            Active External Transfers Queue
          </h2>
          <p className="text-xs text-ink-500">
            Select any document to view its transfer details, reference number, or record its return to the College Secretary.
          </p>
        </div>

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
