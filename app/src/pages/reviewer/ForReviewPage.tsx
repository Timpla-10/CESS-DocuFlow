import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FolderOpen,
  Inbox,
  RotateCcw,
  SearchX,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import {
  DelayedBadge,
  DocumentPreviewModal,
  FilterBar,
  StatusBadge,
  WaitingTime,
  useDocumentFilters,
} from '../../components/documents'
import { Field, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
} from '../../components/ui'
import {
  OFFICE_LABEL,
  ROLE_OFFICE,
  controlNumber,
  locationLabelForStaff,
  revisionLabel,
} from '../../content/language'
import { lastSubmittedAt, reviewOptions, type ReviewKind } from '../../data/engine'
import {
  daysWaiting,
  isDelayed,
  reviewInbox,
  reviewedBy,
  typeOf,
  userById,
} from '../../data/selectors'
import { api, useDb } from '../../data/store'
import type { DocRecord } from '../../data/types'
import { formatDate, plural } from '../../lib/time'

export function ForReviewPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()

  const inboxDocs = reviewInbox(db, user)
  const delayedDocs = inboxDocs.filter((d) => isDelayed(db, d))
  const onTrackDocs = inboxDocs.filter((d) => !isDelayed(db, d))
  const reviewedDocs = reviewedBy(db, user)
  const officeName = OFFICE_LABEL[user.role as keyof typeof OFFICE_LABEL] || 'Reviewing Office'
  const userOffice = ROLE_OFFICE[user.role]

  const { filters, setFilters, result, active, clear } = useDocumentFilters(db, inboxDocs, 'oldest')

  // PB-27: File viewing modal state
  const [previewDoc, setPreviewDoc] = useState<DocRecord | null>(null)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | undefined>()

  // PB-27: Allowed action controls dialog state
  const [actionDoc, setActionDoc] = useState<DocRecord | null>(null)
  const [actionKind, setActionKind] = useState<ReviewKind>('endorse')
  const [actionRemarks, setActionRemarks] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionErrors, setActionErrors] = useState<{ remarks?: string }>({})

  const handleOpenAction = (doc: DocRecord, initialKind?: ReviewKind) => {
    if (!userOffice) return
    const allowed = reviewOptions(db, doc, userOffice)
    const chosen =
      initialKind && allowed.some((o) => o.kind === initialKind)
        ? initialKind
        : allowed[0]?.kind ?? 'endorse'
    setActionDoc(doc)
    setActionKind(chosen)
    setActionRemarks('')
    setActionErrors({})
  }

  const handleActionSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!actionDoc) return
    setActionErrors({})

    if (actionKind === 'return' && !actionRemarks.trim()) {
      setActionErrors({ remarks: 'Please enter revision remarks explaining what needs to be changed.' })
      toast.error('Remarks Required', 'Please provide correction feedback before returning.')
      return
    }

    if (actionKind === 'reject' && !actionRemarks.trim()) {
      setActionErrors({ remarks: 'Please enter a reason for disapproving/rejecting this document.' })
      toast.error('Reason Required', 'Please provide the disapproval reason.')
      return
    }

    setActionBusy(true)
    try {
      await api.recordReview(user, actionDoc.id, {
        kind: actionKind,
        remarks: actionRemarks.trim(),
      })
      toast.success(
        actionKind === 'return'
          ? 'Document Returned for Correction'
          : actionKind === 'reject'
          ? 'Document Disapproved / Rejected'
          : actionKind === 'approve'
          ? 'Document Approved'
          : 'Document Endorsed',
        actionKind === 'return'
          ? 'The requester was notified with your correction remarks.'
          : actionKind === 'reject'
          ? 'The document has been officially disapproved. The requester was notified.'
          : 'Your decision has been recorded and the document routed to the next stage.',
      )
      setActionDoc(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Review action failed.'
      toast.error('Action Failed', msg)
    } finally {
      setActionBusy(false)
    }
  }

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
        description={`Review, inspect files, endorse, approve, return for correction, or disapprove document requests assigned to your office. Requests are prioritized by date submitted (oldest first).`}
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
              <button
                key={d.id}
                type="button"
                onClick={() => handleOpenAction(d)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-warning-500/20 px-2.5 py-1 text-xs font-bold text-brand-950 hover:bg-warning-500/30"
              >
                {d.title} ({locationLabelForStaff(d, db)} · Waiting {plural(daysWaiting(d), 'day')})
              </button>
            ))}
          </div>
        </Callout>
      )}

      {/* Role-Specific Metric Summary Cards (Accurate Pending Counts) */}
      <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 min-[380px]:gap-3.5 sm:grid-cols-4">
        <StatCard
          label="Awaiting Office Action"
          value={inboxDocs.length}
          hint="Assigned pending queue"
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Turnaround Delayed"
          value={delayedDocs.length}
          hint="Exceeds standard SLA"
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="On Track Pending"
          value={onTrackDocs.length}
          hint="Within standard days"
          icon={CheckCircle2}
          tone="brand"
        />
        <StatCard
          label="Actioned by Me"
          value={reviewedDocs.length}
          hint="Endorsed or approved"
          icon={FolderOpen}
          tone="success"
          to="/app/reviewed"
        />
      </div>

      <Card>
        <div className="border-b border-ink-100 p-4 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink-950">
                Pending Office Review Queue ({inboxDocs.length} assigned)
              </h2>
              <p className="text-xs text-ink-500">
                Inspect files and record your office decision directly from this dashboard.
              </p>
            </div>
            <Badge tone={inboxDocs.length > 0 ? 'warning' : 'neutral'} dot={false}>
              {inboxDocs.length} Action Needed
            </Badge>
          </div>
        </div>

        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          audience="all"
          searchLabel="Search pending documents by title, control number, or requester…"
        />

        {result.length === 0 ? (
          active ? (
            <EmptyState
              icon={SearchX}
              title="No documents match your filters"
              action={
                <button
                  type="button"
                  onClick={clear}
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  Clear search and filters
                </button>
              }
            >
              Try adjusting your search keywords or clear the active filters.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Your review inbox is clear"
            >
              There are no documents currently waiting for action from the {officeName}.
              Documents routed to you will appear here automatically.
            </EmptyState>
          )
        ) : (
          <div className="divide-y divide-ink-100">
            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th className="px-6 py-4 min-w-[280px]">Document</th>
                    <th className="px-6 py-4 min-w-[200px]">Requester</th>
                    <th className="px-6 py-4 min-w-[140px] whitespace-nowrap">Submitted</th>
                    <th className="px-6 py-4 min-w-[140px] whitespace-nowrap">Waiting</th>
                    <th className="px-6 py-4 min-w-[140px] whitespace-nowrap">Files</th>
                    <th className="px-6 py-4 min-w-[220px] text-right">Office Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {result.map((d) => {
                    const type = typeOf(db, d)
                    const req = userById(db, d.requesterId)
                    const delayed = isDelayed(db, d)
                    const allowedOpts = userOffice ? reviewOptions(db, d, userOffice) : []

                    return (
                      <tr
                        key={d.id}
                        className="group transition-colors hover:bg-brand-50/50"
                      >
                        <td className="min-w-[280px] max-w-md px-6 py-4.5">
                          <Link
                            to={`/app/documents/${d.id}`}
                            className="block font-semibold text-ink-950 hover:text-brand-700 leading-snug truncate"
                          >
                            {d.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                            <span>{type?.name}</span>
                            <span>·</span>
                            <span className="font-mono text-ink-700">{controlNumber(d)}</span>
                            <span>·</span>
                            <Badge tone="neutral" dot={false} className="text-2xs py-0">
                              {revisionLabel(d.revision)}
                            </Badge>
                          </div>
                        </td>

                        <td className="min-w-[200px] px-6 py-4.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={req?.name ?? '?'} size="sm" className="shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink-800 text-xs">{req?.name}</p>
                              <p className="truncate text-2xs text-ink-500">{req?.department}</p>
                            </div>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4.5 text-xs text-ink-700">
                          {formatDate(lastSubmittedAt(d))}
                        </td>

                        <td className="whitespace-nowrap px-6 py-4.5 text-xs">
                          <div className="space-y-1">
                            <WaitingTime doc={d} />
                            {delayed && <DelayedBadge audience="staff" />}
                          </div>
                        </td>

                        {/* PB-27: File Viewing button */}
                        <td className="whitespace-nowrap px-6 py-4.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={Eye}
                            onClick={() => {
                              setPreviewDoc(d)
                              setPreviewAttachmentId(d.attachments[0]?.id)
                            }}
                          >
                            Files ({d.attachments.length})
                          </Button>
                        </td>

                        {/* PB-27: Allowed Action Controls */}
                        <td className="whitespace-nowrap px-6 py-4.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              iconRight={ArrowRight}
                              onClick={() => handleOpenAction(d)}
                            >
                              Review & Decide
                            </Button>
                            {allowedOpts.some((o) => o.kind === 'return') && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                icon={RotateCcw}
                                onClick={() => handleOpenAction(d, 'return')}
                                title="Return to requester for corrections"
                              >
                                Return
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="divide-y divide-ink-100 md:hidden">
              {result.map((d) => {
                const type = typeOf(db, d)
                const req = userById(db, d.requesterId)
                const delayed = isDelayed(db, d)

                return (
                  <div key={d.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/app/documents/${d.id}`}
                          className="font-bold text-ink-950 text-sm hover:underline line-clamp-2"
                        >
                          {d.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {type?.name} · <span className="font-mono">{controlNumber(d)}</span>
                        </p>
                      </div>
                      <StatusBadge doc={d} audience="staff" db={db} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-ink-600 bg-ink-50/70 p-2.5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Avatar name={req?.name ?? '?'} size="sm" />
                        <div>
                          <span className="font-medium text-ink-800 block text-xs">{req?.name}</span>
                          <span className="text-2xs text-ink-500">{req?.department}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <WaitingTime doc={d} />
                        {delayed && <div className="mt-0.5"><DelayedBadge audience="staff" /></div>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={Eye}
                        onClick={() => {
                          setPreviewDoc(d)
                          setPreviewAttachmentId(d.attachments[0]?.id)
                        }}
                      >
                        Inspect Files ({d.attachments.length})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        iconRight={ArrowRight}
                        onClick={() => handleOpenAction(d)}
                        className="flex-1 justify-center"
                      >
                        Review & Decide
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {/* PB-27: Document File Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          db={db}
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          doc={previewDoc}
          initialAttachmentId={previewAttachmentId}
        />
      )}

      {/* PB-27: Allowed Review Action Controls Dialog */}
      {actionDoc && userOffice && (
        <Dialog
          open={!!actionDoc}
          onClose={() => setActionDoc(null)}
          size="lg"
          title={
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-950">Record Office Review Decision</h3>
                <p className="text-xs font-normal text-ink-500">
                  {controlNumber(actionDoc)} · {officeName}
                </p>
              </div>
            </div>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <Button
                variant="secondary"
                onClick={() => setActionDoc(null)}
                disabled={actionBusy}
              >
                Cancel
              </Button>
              <Button
                variant={
                  actionKind === 'return' || actionKind === 'reject'
                    ? 'danger'
                    : 'primary'
                }
                loading={actionBusy}
                loadingText="Recording Decision…"
                iconRight={Send}
                onClick={handleActionSubmit}
              >
                Confirm & Record Decision
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Document Context Card */}
            <div className="rounded-xl bg-ink-50/70 p-4 border border-ink-200 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-ink-950 text-sm">{actionDoc.title}</span>
                <span className="font-mono text-xs font-semibold text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                  {controlNumber(actionDoc)}
                </span>
              </div>
              <p className="text-ink-600">{actionDoc.description}</p>
              <div className="pt-2 border-t border-ink-200 flex flex-wrap items-center justify-between gap-2 text-2xs text-ink-500">
                <span>
                  Requester: <strong>{userById(db, actionDoc.requesterId)?.name}</strong> ({actionDoc.origin})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDoc(actionDoc)
                    setPreviewAttachmentId(actionDoc.attachments[0]?.id)
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                >
                  <Eye className="size-3" /> View {actionDoc.attachments.length} Attached File(s)
                </button>
              </div>
            </div>

            {/* Allowed Decisions Radio Group */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">
                Choose Allowed Office Action:
              </label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {reviewOptions(db, actionDoc, userOffice).map((opt) => {
                  const isSelected = actionKind === opt.kind
                  const isPositive = opt.kind === 'endorse' || opt.kind === 'approve' || opt.kind === 'endorse_higher'
                  const isReturn = opt.kind === 'return'

                  return (
                    <label
                      key={opt.kind}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                        isSelected
                          ? isPositive
                            ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-200'
                            : isReturn
                            ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-200'
                            : 'border-danger-500 bg-danger-50/40 ring-2 ring-danger-200'
                          : 'border-ink-200 bg-white hover:border-brand-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reviewKind"
                        value={opt.kind}
                        checked={isSelected}
                        onChange={() => setActionKind(opt.kind)}
                        className="mt-0.5 size-4 accent-brand-600"
                      />
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-ink-950">
                          {opt.kind === 'endorse'
                            ? `Endorse to Next Office (${opt.next ? OFFICE_LABEL[opt.next] : 'Next Office'})`
                            : opt.kind === 'endorse_higher'
                            ? `Endorse Higher (${opt.next ? OFFICE_LABEL[opt.next] : 'Higher Authority'})`
                            : opt.kind === 'approve'
                            ? 'Grant Official Approval'
                            : opt.kind === 'return'
                            ? 'Return to Requester for Correction'
                            : 'Disapprove & Reject Request'}
                        </span>
                        <span className="mt-0.5 block text-2xs text-ink-600">
                          {opt.kind === 'endorse' || opt.kind === 'endorse_higher'
                            ? 'Recommends approval and automatically routes document to next authority.'
                            : opt.kind === 'approve'
                            ? 'Final collegiate endorsement. Proceeds to document release desk.'
                            : opt.kind === 'return'
                            ? 'Unlocks submission for requester to edit details and replace files.'
                            : 'Formally closes and disapproves request.'}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Remarks Field */}
            <Field
              label={
                actionKind === 'return'
                  ? 'Correction Notes & Revision Instructions (Required)'
                  : actionKind === 'reject'
                  ? 'Reason for Disapproval (Required)'
                  : 'Official Review Remarks (Optional)'
              }
              required={actionKind === 'return' || actionKind === 'reject'}
              error={actionErrors.remarks}
              hint={
                actionKind === 'return'
                  ? 'Specify clearly what corrections, missing data, or updated forms the requester must provide.'
                  : actionKind === 'reject'
                  ? 'State the official administrative basis for disapproving this document.'
                  : 'Add any endorsement comments, conditions, or tracking references.'
              }
            >
              <Textarea
                rows={3}
                value={actionRemarks}
                onChange={(e) => {
                  setActionRemarks(e.target.value)
                  if (actionErrors.remarks) setActionErrors({})
                }}
                placeholder={
                  actionKind === 'return'
                    ? 'e.g. Please update the departmental endorsement signature and upload an itemized budget.'
                    : actionKind === 'reject'
                    ? 'e.g. Disapproved due to schedule conflicts with university academic calendar.'
                    : 'Enter optional review notes or leave blank...'
                }
              />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  )
}
