import { AlertTriangle, CheckCircle2, Clock, FolderOpen, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUser } from '../../app/session'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { Callout, Card, EmptyState, PageHeader, StatCard } from '../../components/ui'
import { OFFICE_LABEL, locationLabelForStaff } from '../../content/language'
import { daysWaiting, isDelayed, reviewInbox, reviewedBy, visibleDocuments } from '../../data/selectors'
import { useDb } from '../../data/store'
import { plural } from '../../lib/time'

export function ForReviewPage() {
  const user = useUser()
  const db = useDb()
  const inboxDocs = reviewInbox(db, user)
  const delayedDocs = inboxDocs.filter((d) => isDelayed(db, d))
  const reviewedDocs = reviewedBy(db, user)
  const pipelineDocs = visibleDocuments(db, user)
  const officeName = OFFICE_LABEL[user.role as keyof typeof OFFICE_LABEL] || 'Reviewing Office'

  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, inboxDocs, 'oldest')

  const eyebrow =
    user.role === 'chairperson'
      ? 'Department Workspace'
      : user.role === 'ovcaa'
      ? 'OVCAA Workspace'
      : user.role === 'vcaf'
      ? 'VCAF Workspace'
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

      {/* Turnaround / Delay Alert */}
      {delayedDocs.length > 0 && (
        <Callout
          tone="warning"
          icon={AlertTriangle}
          title={`${delayedDocs.length} ${delayedDocs.length === 1 ? 'document requires urgent action' : 'documents require urgent action'}`}
        >
          <p>
            {delayedDocs.length === 1
              ? 'A document waiting for your office action has exceeded standard processing turnaround time.'
              : 'Some documents waiting for your office action have exceeded standard processing turnaround time.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {delayedDocs.map((d) => (
              <Link
                key={d.id}
                to={`/app/documents/${d.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-warning-500/20 px-2.5 py-1 text-xs font-bold text-brand-950 hover:bg-warning-500/30"
              >
                {d.title} ({locationLabelForStaff(d, db)} · Waiting {plural(daysWaiting(d), 'day')})
              </Link>
            ))}
          </div>
        </Callout>
      )}

      {/* Role-Specific Metric Summary Cards */}
      <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 min-[380px]:gap-3.5 sm:grid-cols-4">
        <StatCard
          label="Awaiting Action"
          value={inboxDocs.length}
          hint="Requires office decision"
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Turnaround Delayed"
          value={delayedDocs.length}
          hint="Exceeds standard days"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Actioned by Me"
          value={reviewedDocs.length}
          hint="Endorsed or approved"
          icon={CheckCircle2}
          tone="success"
          to="/app/reviewed"
        />
        <StatCard
          label="Office Pipeline"
          value={pipelineDocs.length}
          hint="Total route documents"
          icon={FolderOpen}
          tone="brand"
          to="/app/my-documents"
        />
      </div>

      <Card>
        <div className="border-b border-ink-100 p-4 sm:px-6 sm:py-4">
          <h2 className="text-base font-bold text-ink-950">
            Pending Office Review Queue
          </h2>
          <p className="text-xs text-ink-500">
            Select a document to inspect attachments, route history, and record your office decision.
          </p>
        </div>

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
