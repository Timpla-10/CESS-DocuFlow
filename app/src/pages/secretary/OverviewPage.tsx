import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock,
  Inbox,
  Lock,
  PackageCheck,
  RotateCcw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../../app/session'
import { DocumentList } from '../../components/documents'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  PageHeader,
  PieChart,
  Segmented,
  StatCard,
  Tooltip,
} from '../../components/ui'
import { OFFICE_LABEL, controlNumber, locationLabelForStaff } from '../../content/language'
import { daysSince } from '../../data/engine'
import { daysWaiting, isDelayed, secretaryQueues, typeOf, userById } from '../../data/selectors'
import { api, useDb } from '../../data/store'
import type { DocRecord, OfficeId } from '../../data/types'
import { plural, timeAgo } from '../../lib/time'

export function OverviewPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const [currentTime] = useState(() => Date.now())

  const queues = secretaryQueues(db)
  const allDocs = db.documents
  const delayedDocs = allDocs.filter((d) => isDelayed(db, d))
  const returnedDocs = allDocs.filter((d) => d.status === 'returned')
  const rejectedDocs = allDocs.filter((d) => d.status === 'rejected')

  // PB-30: Aging (3+ days) and Overdue documents
  const agingDocs = allDocs
    .filter(
      (d) =>
        (d.status === 'with_office' || d.status === 'submitted') &&
        (isDelayed(db, d) || daysWaiting(d) >= 3),
    )
    .sort((a, b) => daysWaiting(b) - daysWaiting(a))

  const [activeQueueTab, setActiveQueueTab] = useState<
    'toCheck' | 'ready' | 'aging' | 'returned' | 'rejected'
  >('toCheck')

  const [batchBusy, setBatchBusy] = useState(false)
  const [sendingDocId, setSendingDocId] = useState<string | null>(null)

  // PB-30: Batch automated 3-day follow-up reminders
  const handleRunBatchFollowUps = async () => {
    setBatchBusy(true)
    try {
      const sentCount = await api.triggerReminders(user)
      if (sentCount > 0) {
        toast.success(
          '3-Day Follow-Ups Dispatched',
          `Dispatched ${sentCount} automated reminder(s) to holding offices and requesters. Anti-duplicate intervals are updated.`,
        )
      } else {
        toast.info(
          'All Reminders Up-to-Date',
          `No reminders needed at this time. All aging requests have already received updates within the ${db.settings.reminderEveryDays}-day anti-duplicate interval.`,
        )
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger follow-up reminders.'
      toast.error('Follow-Up Error', msg)
    } finally {
      setBatchBusy(false)
    }
  }

  // PB-30: Single document follow-up reminder with anti-duplicate validation
  const handleSendDocReminder = async (doc: DocRecord) => {
    setSendingDocId(doc.id)
    try {
      const officeName = await api.sendSingleReminder(user, doc.id)
      toast.success(
        'Follow-Up Sent',
        `3-day follow-up reminder sent to ${officeName} and requester for ${controlNumber(doc)}. Anti-duplicate protection locked for ${db.settings.reminderEveryDays} days.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not send reminder.'
      toast.error('Reminder Blocked', msg)
    } finally {
      setSendingDocId(null)
    }
  }

  // Distribution by holding office with official institutional gradients
  const offices: OfficeId[] = ['chairperson', 'ids_principal', 'dean', 'ovcaa', 'vcaf', 'chancellor']
  const officeGradients: Record<OfficeId, [string, string]> = {
    chairperson: ['#8B5CF6', '#581C87'], // Royal Violet (DSSH): Violet-500 -> Violet-900
    ids_principal: ['#FB7185', '#BE185D'], // Official IDS Warm Rose Pink: Rose-400 -> Pink-700
    dean: ['#C084FC', '#6B21A8'], // Dean Amethyst Purple: Purple-400 -> Purple-800
    ovcaa: ['#60A5FA', '#1D4ED8'], // University Azure Blue: Blue-400 -> Blue-700
    vcaf: ['#34D399', '#047857'], // University Emerald Green: Emerald-400 -> Emerald-700
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

      {/* Key Metric StatCards (PM-FEEDBACK-2) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Awaiting Verification"
          value={queues.toCheck.length}
          hint="Passed completeness check"
          icon={CheckSquare}
          tone={queues.toCheck.length > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="In Office Review"
          value={allDocs.filter((d) => d.status === 'with_office').length}
          hint="Under review across offices"
          icon={Inbox}
          tone="brand"
        />
        <StatCard
          label="Ready to Release"
          value={queues.ready.length}
          hint="Ready for requester pickup"
          icon={PackageCheck}
          tone={queues.ready.length > 0 ? 'success' : 'neutral'}
        />
        <StatCard
          label="Returned for Revision"
          value={returnedDocs.length}
          hint="With requester for corrections"
          icon={RotateCcw}
          tone={returnedDocs.length > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Disapproved / Rejected"
          value={rejectedDocs.length}
          hint="Officially closed records"
          icon={XCircle}
          tone={rejectedDocs.length > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* PB-30: Dedicated Secretary Monitoring View for Aging & Overdue Requests with 3-Day Follow-Ups */}
      <Card className="overflow-hidden border-2 border-amber-200 bg-amber-50/20">
        <div className="border-b border-amber-200 bg-amber-50/70 p-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
                <ShieldAlert className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-ink-950">
                    Aging & Overdue Requests Monitor (PB-30)
                  </h2>
                  <Badge tone={agingDocs.length > 0 ? 'warning' : 'success'} dot={false}>
                    {agingDocs.length} Aging / Overdue
                  </Badge>
                  <span className="text-2xs font-semibold text-ink-500 bg-white px-2 py-0.5 rounded border border-ink-200">
                    Throttled Every {db.settings.reminderEveryDays} Days
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-600">
                  Monitors requests that exceed standard turnaround times or have waited 3+ days at review offices. Dispatches automated follow-up reminders with anti-duplicate locks.
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              icon={Send}
              loading={batchBusy}
              onClick={handleRunBatchFollowUps}
              className="shadow-sm"
            >
              Run Automated 3-Day Follow-Ups
            </Button>
          </div>
        </div>

        {agingDocs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-center text-sm text-ink-500">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>All active documents are on-track and within standard turnaround times.</span>
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {agingDocs.slice(0, 5).map((d) => {
              const type = typeOf(db, d)
              const req = userById(db, d.requesterId)
              const overdue = isDelayed(db, d)
              const days = daysWaiting(d)
              const currentOfficeName = d.currentOffice ? OFFICE_LABEL[d.currentOffice] : 'Reviewing Office'

              const docReminders = db.notifications.filter((n) => n.docId === d.id && n.kind === 'reminder')
              const lastReminder = docReminders.length > 0 ? docReminders[docReminders.length - 1] : undefined
              const daysSinceLast = lastReminder ? daysSince(lastReminder.at, currentTime) : 999
              const isLocked = daysSinceLast < db.settings.reminderEveryDays

              return (
                <div key={d.id} className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 hover:bg-white/80 transition-colors">
                  <div className="min-w-0 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/app/documents/${d.id}`}
                        className="font-bold text-ink-950 text-sm hover:text-brand-700 truncate"
                      >
                        {d.title}
                      </Link>
                      <Badge tone={overdue ? 'danger' : 'warning'} dot={false}>
                        {overdue ? 'Turnaround Overdue' : 'Aging (3+ Days)'}
                      </Badge>
                      <span className="font-mono text-2xs text-ink-500 bg-white px-2 py-0.5 rounded border border-ink-200">
                        {controlNumber(d)}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
                      <span>Type: <strong className="text-ink-800">{type?.name}</strong></span>
                      <span>·</span>
                      <span>Holding: <strong className="text-brand-900">{currentOfficeName}</strong></span>
                      <span>·</span>
                      <span>Requester: <strong className="text-ink-800">{req?.name}</strong> ({d.origin})</span>
                      <span>·</span>
                      <span className="flex items-center gap-1 font-semibold text-danger-700">
                        <Clock className="size-3" /> Waiting {plural(days, 'day')} (SLA: {type ? `${type.processingDays[0]}–${type.processingDays[1]}d` : '3d'})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {lastReminder && isLocked ? (
                      <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-xs text-ink-700 ring-1 ring-inset ring-ink-200">
                        <Lock className="size-3.5 text-ink-500" />
                        <span>Follow-Up Sent {timeAgo(lastReminder.at)}</span>
                        <span className="text-2xs text-ink-500 font-medium">
                          (Next: in {db.settings.reminderEveryDays - daysSinceLast}d)
                        </span>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        icon={Send}
                        loading={sendingDocId === d.id}
                        onClick={() => handleSendDocReminder(d)}
                      >
                        Send 3-Day Follow-Up
                      </Button>
                    )}
                    <ButtonLink to={`/app/documents/${d.id}`} variant="ghost" size="sm">
                      Inspect
                    </ButtonLink>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

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
                <Segmented<'toCheck' | 'ready' | 'aging' | 'returned' | 'rejected'>
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
                      value: 'aging',
                      label: 'Aging & Overdue',
                      count: agingDocs.length,
                    },
                    {
                      value: 'returned',
                      label: 'Returned',
                      count: returnedDocs.length,
                    },
                    {
                      value: 'rejected',
                      label: 'Rejected',
                      count: rejectedDocs.length,
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
                      <Tooltip content="Submissions awaiting initial review and manual document verification before routing" placement="top">
                        <h3 className="inline-block cursor-help text-sm font-bold text-ink-900 transition-colors hover:text-brand-700">
                          Submissions Awaiting Content Verification
                        </h3>
                      </Tooltip>
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
                      <Tooltip content="Documents with final approval ready for physical requester release or counter pickup" placement="top">
                        <h3 className="inline-block cursor-help text-sm font-bold text-ink-900 transition-colors hover:text-brand-700">
                          Approved Documents Ready for Release
                        </h3>
                      </Tooltip>
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

            {/* TAB: Aging & Overdue Requests Monitor (PB-30) */}
            {activeQueueTab === 'aging' && (
              <div>
                <div className="border-b border-ink-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Tooltip content="Documents exceeding standard SLA or waiting 3+ days with review offices" placement="top">
                        <h3 className="inline-block cursor-help text-sm font-bold text-ink-900 transition-colors hover:text-brand-700">
                          Aging & Overdue Office Requests
                        </h3>
                      </Tooltip>
                      <p className="text-xs text-ink-500">
                        Review holding offices, waiting time, and dispatch 3-day follow-up reminders.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Send}
                      loading={batchBusy}
                      onClick={handleRunBatchFollowUps}
                    >
                      Batch 3-Day Follow-Ups
                    </Button>
                  </div>
                </div>

                {agingDocs.length === 0 ? (
                  <div className="py-12 text-center text-sm text-ink-500">
                    No documents are currently aging or overdue. All requests are progressing normally.
                  </div>
                ) : (
                  <div className="divide-y divide-ink-100">
                    {agingDocs.map((d) => {
                      const type = typeOf(db, d)
                      const req = userById(db, d.requesterId)
                      const overdue = isDelayed(db, d)
                      const days = daysWaiting(d)
                      const currentOfficeName = d.currentOffice ? OFFICE_LABEL[d.currentOffice] : 'Reviewing Office'

                      const docReminders = db.notifications.filter((n) => n.docId === d.id && n.kind === 'reminder')
                      const lastReminder = docReminders.length > 0 ? docReminders[docReminders.length - 1] : undefined
                      const daysSinceLast = lastReminder ? daysSince(lastReminder.at, currentTime) : 999
                      const isLocked = daysSinceLast < db.settings.reminderEveryDays

                      return (
                        <div key={d.id} className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 hover:bg-brand-50/40 transition-colors">
                          <div className="min-w-0 max-w-lg">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/app/documents/${d.id}`}
                                className="font-bold text-ink-950 text-sm hover:text-brand-700 truncate"
                              >
                                {d.title}
                              </Link>
                              <Badge tone={overdue ? 'danger' : 'warning'} dot={false}>
                                {overdue ? 'Overdue' : 'Aging (3+ Days)'}
                              </Badge>
                              <span className="font-mono text-2xs text-ink-500">
                                {controlNumber(d)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-600">
                              <span>{type?.name}</span>
                              <span>·</span>
                              <span>With <strong className="text-ink-900">{currentOfficeName}</strong></span>
                              <span>·</span>
                              <span>{req?.name} ({d.origin})</span>
                              <span>·</span>
                              <span className="font-medium text-danger-700">Waiting {plural(days, 'day')}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {lastReminder && isLocked ? (
                              <Badge tone="neutral" dot={false} className="gap-1 font-mono text-2xs">
                                <Lock className="size-3 text-ink-500" />
                                Follow-Up Sent {timeAgo(lastReminder.at)}
                              </Badge>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                icon={Send}
                                loading={sendingDocId === d.id}
                                onClick={() => handleSendDocReminder(d)}
                              >
                                Send 3-Day Follow-Up
                              </Button>
                            )}
                            <ButtonLink to={`/app/documents/${d.id}`} variant="ghost" size="sm">
                              Inspect
                            </ButtonLink>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Returned Submissions Awaiting Correction */}
            {activeQueueTab === 'returned' && (
              <div>
                <div className="border-b border-ink-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Tooltip content="Documents requiring requester corrections before resuming office routing" placement="top">
                        <h3 className="inline-block cursor-help text-sm font-bold text-ink-900 transition-colors hover:text-brand-700">
                          Submissions Returned to Requesters for Correction
                        </h3>
                      </Tooltip>
                      <p className="text-xs text-ink-500">
                        Documents returned by the Secretary or Reviewing Offices for file or content revisions.
                      </p>
                    </div>
                    <Link
                      to="/app/documents"
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      View in All Documents ({returnedDocs.length})
                    </Link>
                  </div>
                </div>

                <DocumentList
                  db={db}
                  docs={returnedDocs.slice(0, 6)}
                  audience="staff"
                  showRequester
                  showWaiting
                  empty={
                    <div className="py-12 text-center text-sm text-ink-500">
                      No documents are currently in returned status.
                    </div>
                  }
                />
              </div>
            )}

            {/* TAB: Disapproved / Rejected Records */}
            {activeQueueTab === 'rejected' && (
              <div>
                <div className="border-b border-ink-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Tooltip content="Submissions officially rejected by reviewing authorities and closed" placement="top">
                        <h3 className="inline-block cursor-help text-sm font-bold text-ink-900 transition-colors hover:text-brand-700">
                          Officially Disapproved & Rejected Records
                        </h3>
                      </Tooltip>
                      <p className="text-xs text-ink-500">
                        Documents officially disapproved and closed by Reviewing Authorities.
                      </p>
                    </div>
                    <Link
                      to="/app/documents"
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      View in All Documents ({rejectedDocs.length})
                    </Link>
                  </div>
                </div>

                <DocumentList
                  db={db}
                  docs={rejectedDocs.slice(0, 6)}
                  audience="staff"
                  showRequester
                  empty={
                    <div className="py-12 text-center text-sm text-ink-500">
                      No disapproved or rejected documents recorded.
                    </div>
                  }
                />
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
