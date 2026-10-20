import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  Inbox,
  PackageCheck,
  Route,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DocumentList } from '../../components/documents'
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  PageHeader,
  PieChart,
  Segmented,
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

  const [activeQueueTab, setActiveQueueTab] = useState<'toCheck' | 'ready' | 'ids'>('toCheck')

  // Distribution by holding office with official institutional gradients
  const offices: OfficeId[] = ['chairperson', 'ids_principal', 'dean', 'ovcaa', 'chancellor']
  const officeGradients: Record<OfficeId, [string, string]> = {
    chairperson: ['#8B5CF6', '#581C87'], // Royal Violet (DSSH): Violet-500 -> Violet-900
    ids_principal: ['#FB7185', '#BE185D'], // Official IDS Warm Rose Pink: Rose-400 -> Pink-700
    dean: ['#C084FC', '#6B21A8'], // Dean Amethyst Purple: Purple-400 -> Purple-800
    ovcaa: ['#60A5FA', '#1D4ED8'], // University Azure Blue: Blue-400 -> Blue-700
    chancellor: ['#FBBF24', '#B45309'], // Chancellor Amber Gold: Amber-400 -> Amber-700
    secretary: ['#A78BFA', '#4C1D95'],
  }
  const officeCounts = offices.map((off) => ({
    label: OFFICE_LABEL[off],
    value: allDocs.filter((d) => d.status === 'with_office' && d.currentOffice === off).length,
    color: officeGradients[off][0],
    gradient: officeGradients[off],
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="College Secretary Dashboard"
        title="Document Processing Overview"
        description="Track active document queues, verify submissions, and release signed documents."
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
          title={`${delayedDocs.length} ${delayedDocs.length === 1 ? 'document is delayed' : 'documents are delayed'}`}
        >
          <p>
            These documents have exceeded standard turnaround times. Automatic reminders are sent every {db.settings.reminderEveryDays} days.
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

      {/* Non-Clickable Key Metric StatCards (REQ-PM-FEEDBACK-3) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting Content Verification"
          value={queues.toCheck.length}
          hint="Passed completeness check"
          icon={CheckSquare}
          tone={queues.toCheck.length > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Currently In Review"
          value={allDocs.filter((d) => d.status === 'with_office').length}
          hint="Under review across offices"
          icon={Inbox}
          tone="brand"
        />
        <StatCard
          label="Approved & Ready to Release"
          value={queues.ready.length}
          hint="Ready for requester pickup"
          icon={PackageCheck}
          tone={queues.ready.length > 0 ? 'success' : 'neutral'}
        />
      </div>

      {/* Two Column Layout: Focused Task Center (Left) & Office Distribution (Right) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Unified Task Workstation */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            {/* Tab Header to eliminate vertical clutter */}
            <div className="border-b border-ink-100 bg-ink-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
                  Secretary Workstation Queues
                </span>
                <Segmented<'toCheck' | 'ready' | 'ids'>
                  label="Workstation Queue Tabs"
                  value={activeQueueTab}
                  onChange={setActiveQueueTab}
                  options={[
                    {
                      value: 'toCheck',
                      label: 'Verify Content',
                      count: queues.toCheck.length,
                    },
                    {
                      value: 'ready',
                      label: 'Ready for Release',
                      count: queues.ready.length,
                    },
                    {
                      value: 'ids',
                      label: 'IDS Hand-Offs',
                      count: idsDocs.length,
                    },
                  ]}
                />
              </div>
            </div>

            {/* TAB 1: Awaiting Content Verification */}
            {activeQueueTab === 'toCheck' && (
              <div>
                <div className="border-b border-ink-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-ink-900">
                        Submissions Awaiting Content Verification
                      </h3>
                      <p className="text-xs text-ink-500">
                        Automatic completeness check passed. Inspect attached document contents before logging and routing (oldest first).
                      </p>
                    </div>
                    <Link
                      to="/app/requirements-check"
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Open Full Queue ({queues.toCheck.length})
                    </Link>
                  </div>
                </div>

                <DocumentList
                  db={db}
                  docs={queues.toCheck.slice(0, 6)}
                  audience="staff"
                  showRequester
                  showWaiting
                  empty={
                    <div className="flex items-center justify-center gap-2 py-12 text-center text-sm text-ink-500">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                      <span>All submitted documents have been checked and routed.</span>
                    </div>
                  }
                />
              </div>
            )}

            {/* TAB 2: Ready for Collection & Release */}
            {activeQueueTab === 'ready' && (
              <div>
                <div className="border-b border-ink-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-ink-900">
                        Approved Documents Ready for Release
                      </h3>
                      <p className="text-xs text-ink-500">
                        Documents with final Dean approval awaiting requester collection at the counter.
                      </p>
                    </div>
                    <Link
                      to="/app/release"
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Open Release Desk ({queues.ready.length})
                    </Link>
                  </div>
                </div>

                <DocumentList
                  db={db}
                  docs={queues.ready.slice(0, 6)}
                  audience="staff"
                  showRequester
                  showWaiting
                  empty={
                    <div className="py-12 text-center text-sm text-ink-500">
                      No documents are currently waiting for release.
                    </div>
                  }
                />
              </div>
            )}

            {/* TAB 3: IDS Hand-offs Unified Trail */}
            {activeQueueTab === 'ids' && (
              <div>
                <div className="border-b border-ink-100 p-4">
                  <div className="flex items-center gap-2">
                    <Route className="size-4 text-brand-700" />
                    <div>
                      <h3 className="text-sm font-bold text-ink-900">
                        IDS Document Hand-Offs (Secretary ↔ Chairperson ↔ IDS Principal)
                      </h3>
                      <p className="text-xs text-ink-500">
                        Unified tracking of Integrated Developmental School documents and reviewer endorsements.
                      </p>
                    </div>
                  </div>
                </div>

                {idsDocs.length === 0 ? (
                  <div className="py-12 text-center text-sm text-ink-500">
                    No active IDS documents in routing.
                  </div>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {idsDocs.map((d) => {
                      const type = typeOf(db, d)
                      const req = userById(db, d.requesterId)
                      const handoffs = d.history.filter((h) =>
                        [
                          'submitted',
                          'checked_complete',
                          'routed',
                          'endorsed',
                          'approved',
                        ].includes(h.action),
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
                            <Badge tone="ids">
                              Now at: {locationLabelForStaff(d, db)} ({plural(daysWaiting(d), 'day')})
                            </Badge>
                          </div>

                          {/* Hand-off chain pill trail */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                            {handoffs.map((h, idx) => (
                              <span key={h.id} className="inline-flex items-center gap-1.5">
                                {idx > 0 && <ArrowRight className="size-3 text-ink-400" aria-hidden />}
                                <span
                                  className="rounded-md bg-ink-50 px-2 py-0.5 text-2xs font-medium text-ink-700 ring-1 ring-inset ring-ink-200"
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
              </div>
            )}
          </Card>
        </div>

        {/* Right Col: Office Distribution */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Documents by Office"
              description="Current distribution across reviewing bodies"
            />
            <div className="p-6">
              <PieChart
                items={officeCounts}
                emptyLabel="No documents currently under review."
                centerLabel="In Review"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
