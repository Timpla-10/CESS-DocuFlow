import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckSquare,
  ExternalLink,
  Inbox,
  PackageCheck,
  Route,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { DocumentList } from '../../components/documents'
import {
  Badge,
  BarList,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  PageHeader,
  StatCard,
} from '../../components/ui'
import { OFFICE_LABEL, controlNumber, locationLabelForStaff } from '../../content/language'
import { daysWaiting, isDelayed, secretaryQueues, typeOf, userById } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { OfficeId } from '../../data/types'
import { formatDateTime, plural } from '../../lib/time'

export function OverviewPage() {
  const db = useDb()
  const queues = secretaryQueues(db)
  const allDocs = db.documents
  const delayedDocs = allDocs.filter((d) => isDelayed(db, d))
  const idsDocs = allDocs.filter((d) => d.origin === 'IDS' && !d.archived)

  // Distribution by holding office
  const offices: OfficeId[] = ['chairperson', 'ids_principal', 'dean', 'ovcaa', 'chancellor']
  const officeCounts = offices.map((off) => ({
    label: OFFICE_LABEL[off],
    value: allDocs.filter((d) => d.status === 'with_office' && d.currentOffice === off).length,
  }))

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="College Secretary Dashboard"
        title="Document Processing Overview"
        description="Monitor active document queues, identify processing bottlenecks, track IDS hand-offs, and route documents efficiently across college and university offices."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/app/requirements-check" variant="primary">
              Verify Submissions ({queues.toCheck.length})
            </ButtonLink>
            <ButtonLink to="/app/release" variant="secondary">
              Ready for Release ({queues.ready.length})
            </ButtonLink>
          </div>
        }
      />

      {/* Delay Alert if any documents exceed standard turnaround (REQ-WFM-3, REQ-WFM-8) */}
      {delayedDocs.length > 0 && (
        <Callout
          tone="warning"
          icon={AlertTriangle}
          title={`${delayedDocs.length} ${delayedDocs.length === 1 ? 'document has' : 'documents have'} exceeded standard turnaround time (Delayed)`}
        >
          <p>
            These documents have waited longer than the upper limit of their standard processing times set under the CESS Manual of Operations.
            Follow-up reminders are automatically dispatched every {db.settings.reminderEveryDays} days.
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

      {/* Key Metric StatCards (REQ-WFM-1) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Needs Content Check"
          value={queues.toCheck.length}
          hint="Auto-checked submissions"
          icon={CheckSquare}
          tone={queues.toCheck.length > 0 ? 'warning' : 'neutral'}
          to="/app/requirements-check"
        />
        <StatCard
          label="Currently Under Review"
          value={allDocs.filter((d) => d.status === 'with_office').length}
          hint="With chairpersons, IDS, dean"
          icon={Inbox}
          tone="brand"
          to="/app/documents"
        />
        <StatCard
          label="At External Offices"
          value={queues.external.length}
          hint="HRMO, Registrar, Budget"
          icon={Building2}
          tone={queues.external.length > 0 ? 'brand' : 'neutral'}
          to="/app/external-offices"
        />
        <StatCard
          label="Ready for Pickup"
          value={queues.ready.length}
          hint="Awaiting student / faculty"
          icon={PackageCheck}
          tone={queues.ready.length > 0 ? 'success' : 'neutral'}
          to="/app/release"
        />
      </div>

      {/* Two Column Layout: Queues & Office Distribution */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Items Needing Attention */}
        <div className="space-y-6 lg:col-span-2">
          {/* Queue 1: Needs Content Verification */}
          <Card>
            <CardHeader
              title="Awaiting Content Verification"
              description="Automatic completeness check passed. Verify content correctness before routing (oldest first)."
              action={
                <Link to="/app/requirements-check" className="text-xs font-semibold text-brand-700 hover:underline">
                  View full queue ({queues.toCheck.length})
                </Link>
              }
            />
            <DocumentList
              db={db}
              docs={queues.toCheck.slice(0, 5)}
              audience="staff"
              showRequester
              showWaiting
              empty={
                <div className="py-8 text-center text-sm text-ink-500">
                  All submitted documents have been checked and routed.
                </div>
              }
            />
          </Card>

          {/* Queue 2: IDS Hand-Offs Unified View (REQ-WFM-6) */}
          <Card>
            <CardHeader
              icon={Route}
              title="IDS Document Hand-Offs (Secretary ↔ Chairperson ↔ IDS Principal)"
              description="Unified visibility of Integrated Development School (IDS) documents and their hand-offs between the College Secretary, Department Chairpersons, and the IDS Principal (REQ-WFM-6)."
            />
            {idsDocs.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-500">
                No active IDS documents in the workflow.
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {idsDocs.map((d) => {
                  const type = typeOf(db, d)
                  const req = userById(db, d.requesterId)
                  const handoffs = d.history.filter((h) =>
                    ['submitted', 'checked_complete', 'routed', 'endorsed', 'approved', 'sent_external'].includes(h.action),
                  )
                  return (
                    <li key={d.id} className="p-4 hover:bg-brand-50/40">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/app/documents/${d.id}`}
                            className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                          >
                            {d.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {type?.name} · <span className="font-mono">{controlNumber(d)}</span> · {req?.name}
                          </p>
                        </div>
                        <Badge tone="brand">
                          Now at: {locationLabelForStaff(d, db)} ({plural(daysWaiting(d), 'day')})
                        </Badge>
                      </div>

                      {/* Hand-off chain pill trail */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                        {handoffs.map((h, idx) => (
                          <span key={h.id} className="inline-flex items-center gap-1.5">
                            {idx > 0 && <ArrowRight className="size-3 text-ink-400" aria-hidden />}
                            <span
                              className="rounded-md bg-ink-50 px-2 py-0.5 font-medium text-ink-700 ring-1 ring-inset ring-ink-200"
                              title={formatDateTime(h.at)}
                            >
                              {h.office} ({h.action.replace('_', ' ')})
                            </span>
                          </span>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* Queue 3: Pending in External Offices */}
          <Card>
            <CardHeader
              title="Documents in External Offices"
              description="Transfers to HRMO, Registrar's Office, and Budget & Accounting needing follow-up."
              action={
                <Link to="/app/external-offices" className="text-xs font-semibold text-brand-700 hover:underline">
                  View all external ({queues.external.length})
                </Link>
              }
            />
            <DocumentList
              db={db}
              docs={queues.external.slice(0, 5)}
              audience="staff"
              showRequester
              showWaiting
              empty={
                <div className="py-8 text-center text-sm text-ink-500">
                  No documents are currently with external offices.
                </div>
              }
            />
          </Card>
        </div>

        {/* Right Col: Office Distribution & Follow-ups */}
        <div className="space-y-6">
          <Card className="p-5">
            <CardHeader
              title="Documents by Office"
              description="Current distribution across reviewing bodies"
            />
            <div className="mt-4">
              <BarList
                items={officeCounts}
                emptyLabel="No documents currently under review."
              />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Quick Shortcuts"
              description="Fast navigation for regular tasks"
            />
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  to="/app/documents"
                  className="flex items-center justify-between rounded-lg p-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-brand-50"
                >
                  <span>Encode Walk-In / Export Records</span>
                  <ExternalLink className="size-4 text-ink-400" />
                </Link>
              </li>
              <li>
                <Link
                  to="/app/notices"
                  className="flex items-center justify-between rounded-lg p-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-brand-50"
                >
                  <span>Post Notice or Minutes</span>
                  <ExternalLink className="size-4 text-ink-400" />
                </Link>
              </li>
              <li>
                <Link
                  to="/app/faculty-directory"
                  className="flex items-center justify-between rounded-lg p-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-brand-50"
                >
                  <span>Manage Faculty, Subjects & Syllabi</span>
                  <ExternalLink className="size-4 text-ink-400" />
                </Link>
              </li>
              <li>
                <Link
                  to="/app/email-log"
                  className="flex items-center justify-between rounded-lg p-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-brand-50"
                >
                  <span>View Notification Log</span>
                  <ExternalLink className="size-4 text-ink-400" />
                </Link>
              </li>
              <li>
                <Link
                  to="/app/settings"
                  className="flex items-center justify-between rounded-lg p-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-brand-50"
                >
                  <span>Routes, Templates & System Settings</span>
                  <ExternalLink className="size-4 text-ink-400" />
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
