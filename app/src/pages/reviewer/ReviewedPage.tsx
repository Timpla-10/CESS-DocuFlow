import {
  History,
  FilePlus2,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Layers,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useUser } from '../../app/session'
import { DocumentList, FilterBar, useDocumentFilters } from '../../components/documents'
import { ButtonLink, Card, EmptyState, PageHeader, Segmented } from '../../components/ui'
import { OFFICE_LABEL } from '../../content/language'
import { reviewedBy, userById } from '../../data/selectors'
import { useDb } from '../../data/store'

type ReviewStatusFilter = 'all' | 'approved' | 'returned' | 'rejected'
type ScopeFilter = 'my_actions' | 'jurisdiction'

export function ReviewedPage() {
  const user = useUser()
  const db = useDb()
  const myReviewedDocs = reviewedBy(db, user)
  const officeName = OFFICE_LABEL[user.role as keyof typeof OFFICE_LABEL] || 'Reviewing Office'

  const [scope, setScope] = useState<ScopeFilter>('my_actions')
  const [statusTab, setStatusTab] = useState<ReviewStatusFilter>('all')

  // Base documents according to selected scope (PM-FEEDBACK-2)
  const baseDocs = useMemo(() => {
    if (scope === 'jurisdiction') {
      return db.documents.filter((d) => {
        const req = userById(db, d.requesterId)
        if (user.role === 'chairperson') {
          return (
            req?.department === user.department ||
            d.route.some((s) => s.office === 'chairperson')
          )
        }
        if (user.role === 'ids_principal') {
          return (
            d.origin === 'IDS' ||
            req?.department?.includes('IDS') ||
            d.route.some((s) => s.office === 'ids_principal')
          )
        }
        if (user.role === 'dean') {
          return true // Dean oversees all college documents
        }
        if (user.role === 'ovcaa' || user.role === 'chancellor') {
          return true
        }
        return false
      })
    }
    return myReviewedDocs
  }, [db, scope, user, myReviewedDocs])

  // Sub-filter by Status Tab
  const filteredByStatusTab = useMemo(() => {
    if (statusTab === 'returned') return baseDocs.filter((d) => d.status === 'returned')
    if (statusTab === 'rejected') return baseDocs.filter((d) => d.status === 'rejected')
    if (statusTab === 'approved') {
      return baseDocs.filter(
        (d) =>
          d.status === 'ready' ||
          d.status === 'released' ||
          (d.status === 'with_office' && d.history.some((h) => h.action === 'approved' || h.action === 'endorsed')),
      )
    }
    return baseDocs
  }, [baseDocs, statusTab])

  // Real-time counter metrics for status tabs
  const counts = useMemo(
    () => ({
      all: baseDocs.length,
      approved: baseDocs.filter(
        (d) =>
          d.status === 'ready' ||
          d.status === 'released' ||
          (d.status === 'with_office' && d.history.some((h) => h.action === 'approved' || h.action === 'endorsed')),
      ).length,
      returned: baseDocs.filter((d) => d.status === 'returned').length,
      rejected: baseDocs.filter((d) => d.status === 'rejected').length,
    }),
    [baseDocs],
  )

  const { filters, setFilters, result, active, clear } = useDocumentFilters(
    db,
    filteredByStatusTab,
    'newest',
  )

  const jurisdictionLabel =
    user.role === 'chairperson'
      ? `${user.department} Records`
      : user.role === 'ids_principal'
      ? 'IDS Unit Records'
      : user.role === 'dean'
      ? 'College-Wide Records'
      : 'Institutional Records'

  const canSubmit = user.role === 'ids_principal' || user.role === 'dean'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review History & Document Tracking"
        title={`Documents Acted On & Monitored by ${officeName}`}
        description={`Track the ongoing movement, review outcomes, and inspection trail of documents — including approved, returned, and rejected submissions.`}
        actions={
          canSubmit ? (
            <ButtonLink to="/app/requests/new" icon={FilePlus2} size="md">
              Submit Document Request
            </ButtonLink>
          ) : undefined
        }
      />

      <Card>
        {/* Workstation Controls: Scope Switcher & Status Queues */}
        <div className="border-b border-ink-100 bg-ink-50/50 p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-brand-700" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink-600">
                Tracking View Scope:
              </span>
            </div>
            <Segmented<ScopeFilter>
              label="Scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'my_actions', label: `Acted On by ${officeName}`, count: myReviewedDocs.length },
                { value: 'jurisdiction', label: jurisdictionLabel },
              ]}
            />
          </div>

          <div className="border-t border-ink-100/70 pt-3">
            <Segmented<ReviewStatusFilter>
              label="Filter by Status"
              value={statusTab}
              onChange={setStatusTab}
              options={[
                { value: 'all', label: 'All Documents', count: counts.all },
                { value: 'approved', label: 'Approved & Endorsed', count: counts.approved },
                { value: 'returned', label: 'Returned for Correction', count: counts.returned },
                { value: 'rejected', label: 'Disapproved / Rejected', count: counts.rejected },
              ]}
            />
          </div>
        </div>

        <FilterBar
          db={db}
          filters={filters}
          setFilters={setFilters}
          showOrigin
          audience="all"
          searchLabel="Search reviewed or tracked documents…"
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
              icon={
                statusTab === 'returned'
                  ? RotateCcw
                  : statusTab === 'rejected'
                  ? XCircle
                  : statusTab === 'approved'
                  ? CheckCircle2
                  : History
              }
              title={
                statusTab === 'returned'
                  ? 'No returned documents found'
                  : statusTab === 'rejected'
                  ? 'No disapproved or rejected documents'
                  : statusTab === 'approved'
                  ? 'No approved or endorsed documents in this view'
                  : 'No review history recorded yet'
              }
            >
              {statusTab === 'returned'
                ? 'There are currently no documents returned for correction in this tracking view.'
                : statusTab === 'rejected'
                ? 'No documents have been disapproved or rejected within this scope.'
                : statusTab === 'approved'
                ? 'When documents are endorsed or approved, they will appear here.'
                : 'When your office records endorsements, approvals, returns, or rejections, those documents will be listed here.'}
            </EmptyState>
          }
        />
      </Card>
    </div>
  )
}
