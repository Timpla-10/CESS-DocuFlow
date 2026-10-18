import { PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { Card, EmptyState, PageHeader, Segmented } from '../../components/ui'
import { secretaryQueues } from '../../data/selectors'
import { useDb } from '../../data/store'

export function ReleasePage() {
  const db = useDb()
  const { toProcess, ready } = secretaryQueues(db)
  const [tab, setTab] = useState<'toProcess' | 'ready'>('ready')

  const docs = tab === 'ready' ? ready : toProcess
  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, docs, 'oldest')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Final Office Stage"
        title="Approved and Ready to Release"
        description="Release signed documents to requesters upon physical collection, or route approved documents to external university offices when necessary."
      />

      <Card>
        <div className="border-b border-ink-100 px-6 py-4.5">
          <Segmented
            label="Release Queues"
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            options={[
              { value: 'ready', label: 'Ready for Pickup', count: ready.length },
              { value: 'toProcess', label: 'Approved — Needs Processing', count: toProcess.length },
            ]}
          />
        </div>

        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          audience="all"
          searchLabel="Search approved or ready documents…"
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
              icon={PackageCheck}
              title={
                tab === 'ready'
                  ? 'No documents currently waiting for pickup'
                  : 'No approved documents pending final processing'
              }
            >
              {tab === 'ready'
                ? 'When approved documents are marked ready for release, they will appear here until collected by the requester.'
                : 'Documents that finish the review chain will appear here to be marked ready or transferred.'}
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
