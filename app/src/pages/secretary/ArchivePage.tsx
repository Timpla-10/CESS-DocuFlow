import { Archive, Download, ShieldCheck } from 'lucide-react'
import { DocumentList, FilterBar, exportDocumentsCsv, useDocumentFilters } from '../../components/documents'
import { useToast } from '../../components/Toast'
import { Button, Callout, Card, EmptyState, PageHeader } from '../../components/ui'
import { useDb } from '../../data/store'

export function ArchivePage() {
  const db = useDb()
  const toast = useToast()
  const archivedDocs = db.documents.filter((d) => d.archived)
  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, archivedDocs, 'newest')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance & Audit"
        title="College Document Archive"
        description="Completed and released documents permanently retained for institutional auditing, accreditation compliance, and academic records (REQ-REL-3)."
        actions={
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              exportDocumentsCsv(db, result, 'CESS_DocuFlow_Archived_Records')
              toast.info('Archive Exported', `Exported ${result.length} archived record(s) to CSV.`)
            }}
          >
            Export Archive ({result.length})
          </Button>
        }
      />

      <Callout tone="brand" icon={ShieldCheck} title="Archived Records are Permanent and Viewable In-App">
        Documents in the archive cannot be altered or hard-deleted. You can search, filter by date range, inspect
        full document contents and attached files in the In-App Previewer without downloading, and review complete
        processing histories and final signed release scans for institutional audit.
      </Callout>

      <Card>
        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          statuses={['released']}
          audience="all"
          searchLabel="Search archived documents…"
        />

        <DocumentList
          db={db}
          docs={result}
          audience="staff"
          showRequester
          filteredEmpty={active ? { onClear: clear } : null}
          empty={
            <EmptyState
              icon={Archive}
              title="No archived documents yet"
            >
              When documents are officially released to requesters, they will be preserved here in read-only form.
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
