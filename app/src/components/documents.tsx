import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDot,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Hourglass,
  Paperclip,
  RotateCcw,
  Search,
  SearchX,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DocumentPreviewModal } from './DocumentPreviewModal'
export { DocumentPreviewModal } from './DocumentPreviewModal'
import {
  OFFICE_HELP,
  OFFICE_LABEL,
  STATUS_FILTER_LABEL,
  controlNumber,
  downloadGeneratedPdf,
  historyTitle,
  historyTone,
  locationLabelForStaff,
  revisionLabel,
  statusView,
  type Tone,
} from '../content/language'
import { buildRoute, lastSubmittedAt } from '../data/engine'
import { byNewest, byOldest, daysWaiting, isDelayed, typeOf, userById } from '../data/selectors'
import type { Attachment, Database, DocRecord, HistoryEntry, OfficeId, RouteStep, Status } from '../data/types'
import { formatDate, formatDateTime, plural, timeAgo } from '../lib/time'
import { Input, Select } from './form'
import { Avatar, Badge, EmptyState, cn } from './ui'

/* ------------------------------------------------------------------------ */
/* Status                                                                    */
/* ------------------------------------------------------------------------ */

export function StatusBadge({ doc, audience, db }: { doc: DocRecord; audience: 'requester' | 'staff'; db?: Database }) {
  const v = statusView(doc, audience, db)
  return <Badge tone={v.tone}>{v.label}</Badge>
}

export function DelayedBadge({ audience }: { audience: 'requester' | 'staff' }) {
  return (
    <Badge tone="warning" dot={false} className="max-w-full gap-1.5 break-words">
      <Hourglass className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{audience === 'requester' ? 'Taking longer than usual' : 'Delayed'}</span>
    </Badge>
  )
}

/* ------------------------------------------------------------------------ */
/* Filters (REQ-REC-5, REQ-MON-4, REQ-WFM-5, REQ-ORD-2)                      */
/* ------------------------------------------------------------------------ */

export interface Filters {
  q: string
  status: '' | Status
  type: string
  origin: '' | 'CESS' | 'IDS'
  office: string
  dateFrom: string
  dateTo: string
  sort: 'oldest' | 'newest'
}

export function useDocumentFilters(db: Database, docs: DocRecord[], initialSort: Filters['sort'] = 'oldest') {
  const [filters, setFilters] = useState<Filters>({
    q: '',
    status: '',
    type: '',
    origin: '',
    office: '',
    dateFrom: '',
    dateTo: '',
    sort: initialSort,
  })
  const result = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const fromMs = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null
    const toMs = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null

    return docs
      .filter((d) => {
        if (filters.status && d.status !== filters.status) return false
        if (filters.type && d.typeId !== filters.type) return false
        if (filters.origin && d.origin !== filters.origin) return false
        if (filters.office) {
          if (filters.office.startsWith('ext:')) {
            const extId = filters.office.slice(4)
            if (d.status !== 'with_external' || d.externalOffice !== extId) return false
          } else {
            if (d.currentOffice !== filters.office) return false
          }
        }
        if (fromMs !== null || toMs !== null) {
          const subMs = new Date(lastSubmittedAt(d)).getTime()
          if (fromMs !== null && subMs < fromMs) return false
          if (toMs !== null && subMs > toMs) return false
        }
        if (!q) return true
        const req = userById(db, d.requesterId)
        const hay = [controlNumber(d), d.title, typeOf(db, d)?.name, req?.name].join(' ').toLowerCase()
        return hay.includes(q)
      })
      .sort(filters.sort === 'oldest' ? byOldest : byNewest)
  }, [db, docs, filters])
  const active = !!(
    filters.q ||
    filters.status ||
    filters.type ||
    filters.origin ||
    filters.office ||
    filters.dateFrom ||
    filters.dateTo
  )
  const clear = () =>
    setFilters((f) => ({ ...f, q: '', status: '', type: '', origin: '', office: '', dateFrom: '', dateTo: '' }))
  return { filters, setFilters, result, active, clear }
}

const ALL_INTERNAL_OFFICES: OfficeId[] = ['secretary', 'chairperson', 'ids_principal', 'dean', 'ovcaa', 'vcaf', 'chancellor']

export function FilterBar({
  db,
  filters,
  setFilters,
  showOrigin,
  showOffice,
  showDateRange = true,
  statuses,
  audience,
  searchLabel,
}: {
  db: Database
  filters: Filters
  setFilters: (f: Filters) => void
  showOrigin?: boolean
  showOffice?: boolean
  showDateRange?: boolean
  statuses?: Status[]
  audience: 'student' | 'faculty' | 'all'
  searchLabel: string
}) {
  const types = db.documentTypes.filter((t) => audience === 'all' || t.audience === audience)
  const statusList = statuses ?? (Object.keys(STATUS_FILTER_LABEL) as Status[])
  return (
    <div className="w-full min-w-0 space-y-3.5 border-b border-ink-100 p-3 sm:px-6 sm:py-5">
      <div className="flex w-full min-w-0 flex-wrap items-end gap-2.5 sm:gap-3.5">
        <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-[220px]">
          <label htmlFor="doc-search" className="mb-1 block text-xs font-semibold text-ink-600">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input
              id="doc-search"
              type="search"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder={searchLabel}
              className="w-full pl-10 pr-4"
            />
          </div>
        </div>
        {statusList.length > 1 && (
          <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v as Filters['status'] })}>
            <option value="">All statuses</option>
            {statusList.map((s) => (
              <option key={s} value={s}>
                {STATUS_FILTER_LABEL[s]}
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect label="Document type" value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })}>
          <option value="">All document types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </FilterSelect>
        {showOrigin && (
          <FilterSelect label="Origin / Unit" value={filters.origin} onChange={(v) => setFilters({ ...filters, origin: v as Filters['origin'] })}>
            <option value="">All Units</option>
            <option value="CESS">CESS</option>
            <option value="IDS">IDS</option>
          </FilterSelect>
        )}
        {showOffice && (
          <FilterSelect label="Holding office" value={filters.office} onChange={(v) => setFilters({ ...filters, office: v })}>
            <option value="">All offices</option>
            <optgroup label="College & Reviewing Offices">
              {ALL_INTERNAL_OFFICES.map((off) => (
                <option key={off} value={off}>
                  {OFFICE_LABEL[off]}
                </option>
              ))}
            </optgroup>
            {db.externalOffices.length > 0 && (
              <optgroup label="External Offices">
                {db.externalOffices.map((ext) => (
                  <option key={ext.id} value={`ext:${ext.id}`}>
                    {ext.shortLabel}
                  </option>
                ))}
              </optgroup>
            )}
          </FilterSelect>
        )}
        <FilterSelect label="Order by Date" value={filters.sort} onChange={(v) => setFilters({ ...filters, sort: v as Filters['sort'] })}>
          <option value="oldest">Oldest first (Default)</option>
          <option value="newest">Newest first</option>
        </FilterSelect>
      </div>

      {showDateRange && (
        <div className="flex w-full min-w-0 flex-wrap items-end gap-2.5 pt-1 sm:gap-3.5">
          <label className="block w-full min-w-0 sm:w-auto">
            <span className="mb-1 block text-xs font-semibold text-ink-600">Submitted from date</span>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="h-10 w-full min-w-0 text-sm sm:w-44"
            />
          </label>
          <label className="block w-full min-w-0 sm:w-auto">
            <span className="mb-1 block text-xs font-semibold text-ink-600">Submitted to date</span>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="h-10 w-full min-w-0 text-sm sm:w-44"
            />
          </label>
          {(filters.dateFrom || filters.dateTo || filters.office || filters.status || filters.type || filters.origin || filters.q) && (
            <button
              type="button"
              onClick={() =>
                setFilters({
                  ...filters,
                  q: '',
                  status: '',
                  type: '',
                  origin: '',
                  office: '',
                  dateFrom: '',
                  dateTo: '',
                })
              }
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-50/70 px-3.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="block w-full min-w-0 sm:w-auto">
      <span className="mb-1 block text-xs font-semibold text-ink-600">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full min-w-0 sm:min-w-[150px]">
        {children}
      </Select>
    </label>
  )
}

/** REQ-WFM-9: Export a list of records for a chosen period as CSV. */
export function exportDocumentsCsv(db: Database, docs: DocRecord[], filePrefix = 'CESS_DocuFlow_Records') {
  const headers = [
    'Control Number',
    'Revision',
    'Document Type',
    'Title',
    'Origin',
    'Requester',
    'Requester Email',
    'Submitted At',
    'Last Updated At',
    'Status',
    'Current Office / Location',
    'Days Waiting',
    'Delayed',
  ]
  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`
  const rows = docs.map((d) => {
    const t = typeOf(db, d)
    const req = userById(db, d.requesterId)
    const status = statusView(d, 'staff', db).label
    const loc = locationLabelForStaff(d, db)
    const waited = String(daysWaiting(d))
    const delayed = isDelayed(db, d) ? 'Yes' : 'No'
    return [
      controlNumber(d),
      `REV${String(d.revision).padStart(2, '0')}`,
      t?.name ?? d.typeId,
      d.title,
      d.origin,
      req?.name ?? '',
      req?.email ?? '',
      formatDateTime(d.submittedAt),
      formatDateTime(d.updatedAt),
      status,
      loc,
      waited,
      delayed,
    ]
      .map(escapeCsv)
      .join(',')
  })
  const csv = [headers.map(escapeCsv).join(','), ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const dateTag = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `${filePrefix}_${dateTag}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ------------------------------------------------------------------------ */
/* Document list                                                             */
/* ------------------------------------------------------------------------ */

export function DocumentList({
  db,
  docs,
  audience,
  empty,
  showRequester,
  showWaiting,
  filteredEmpty,
}: {
  db: Database
  docs: DocRecord[]
  audience: 'requester' | 'staff'
  empty: ReactNode
  showRequester?: boolean
  showWaiting?: boolean
  /** Shown when filters hide every result. */
  filteredEmpty?: { onClear: () => void } | null
}) {
  const navigate = useNavigate()
  if (docs.length === 0) {
    if (filteredEmpty)
      return (
        <EmptyState
          icon={SearchX}
          title="No documents match your search"
          action={
            <button type="button" onClick={filteredEmpty.onClear} className="text-sm font-semibold text-brand-700 hover:underline">
              Clear search and filters
            </button>
          }
        >
          Try a different word, or clear the filters to see everything again.
        </EmptyState>
      )
    return <>{empty}</>
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
              <th className="px-6 py-4 min-w-[280px]">Document</th>
              {showRequester && <th className="px-6 py-4 min-w-[220px]">Requester</th>}
              <th className="px-6 py-4 min-w-[150px] whitespace-nowrap">Submitted</th>
              <th className="px-6 py-4 min-w-[190px]">{audience === 'requester' ? 'Where it is now' : 'Currently with'}</th>
              <th className="px-6 py-4 min-w-[170px] whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {docs.map((d) => {
              const type = typeOf(db, d)
              const req = userById(db, d.requesterId)
              const delayed = isDelayed(db, d)
              const highlight = audience === 'requester' && (d.status === 'returned' || d.status === 'ready')
              return (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/app/documents/${d.id}`)}
                  className={cn(
                    'group cursor-pointer transition-colors hover:bg-brand-50/70',
                    highlight && d.status === 'returned' && 'bg-danger-50/40',
                    highlight && d.status === 'ready' && 'bg-success-50/50',
                  )}
                >
                  <td className="min-w-[280px] max-w-md lg:max-w-xl px-6 py-4.5">
                    <Link
                      to={`/app/documents/${d.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-semibold text-ink-900 group-hover:text-brand-700 leading-snug"
                    >
                      {d.title}
                    </Link>
                    <span className="mt-1 block truncate text-xs text-ink-500">
                      {type?.name} · <span className="font-mono">{controlNumber(d)}</span>
                      {d.encodedBySecretary && ' · Walk-in'}
                    </span>
                  </td>
                  {showRequester && (
                    <td className="min-w-[220px] px-6 py-4.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={req?.name ?? '?'} size="sm" className="shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink-800">{req?.name}</div>
                          <div className="mt-0.5 text-xs text-ink-500">
                            {req?.role === 'student' ? 'Student' : 'Faculty'}
                          </div>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="whitespace-nowrap min-w-[150px] px-6 py-4.5 text-ink-600">
                    <div className="font-medium text-ink-800">{formatDate(lastSubmittedAt(d))}</div>
                    <div className="mt-0.5 text-[11px] text-ink-400">Updated {timeAgo(d.updatedAt)}</div>
                  </td>
                  <td className="min-w-[190px] px-6 py-4.5">
                    <div className="font-medium text-ink-800">{audience === 'requester' && d.status === 'returned' ? 'With you' : locationLabelForStaff(d, db)}</div>
                    {showWaiting && (d.status === 'with_office' || d.status === 'with_external' || d.status === 'submitted') && (
                      <div className="mt-0.5 text-xs text-ink-500">Waiting {plural(daysWaiting(d), 'day')}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap min-w-[170px] px-6 py-4.5">
                    <div className="inline-flex flex-wrap items-center gap-1.5">
                      <StatusBadge doc={d} audience={audience} db={db} />
                      {delayed && <DelayedBadge audience={audience} />}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="w-full min-w-0 max-w-full divide-y divide-ink-100 overflow-hidden md:hidden">
        {docs.map((d) => {
          const type = typeOf(db, d)
          const req = userById(db, d.requesterId)
          return (
            <li key={d.id} className="w-full min-w-0 max-w-full overflow-hidden">
              <Link to={`/app/documents/${d.id}`} className="block w-full min-w-0 max-w-full px-3 py-3.5 hover:bg-brand-50/70 sm:px-4 sm:py-4">
                <div className="flex w-full min-w-0 items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1 break-words">
                    <p className="font-semibold text-ink-900 break-words">{d.title}</p>
                    <p className="mt-0.5 text-xs text-ink-500 break-words">
                      {type?.name}
                      {showRequester && req ? ` · ${req.name}` : ''}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-ink-400" aria-hidden />
                </div>
                <div className="mt-2 flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                  <StatusBadge doc={d} audience={audience} db={db} />
                  {isDelayed(db, d) && <DelayedBadge audience={audience} />}
                  <span className="min-w-0 break-words text-xs text-ink-500">Submitted {formatDate(lastSubmittedAt(d))}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Processing history tones & grouping helpers                               */
/* ------------------------------------------------------------------------ */

const dotTone: Record<Tone, string> = {
  brand: 'bg-brand-600',
  neutral: 'bg-ink-400',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  ids: 'bg-ids-400',
  dsee: 'bg-dsee-300',
  dssh: 'bg-dssh-600',
}

/**
 * Maps chronological history milestones to their corresponding reviewing office step.
 */
function groupHistoryByStep(steps: RouteStep[], history: HistoryEntry[]): Map<number, HistoryEntry[]> {
  const map = new Map<number, HistoryEntry[]>()
  for (let i = 0; i < steps.length; i++) {
    map.set(i, [])
  }

  // Count and index occurrences of reviewing offices (e.g. IDS Principal 1st & 2nd review)
  const officeStepIndices = new Map<string, number[]>()
  steps.forEach((s, idx) => {
    if (s.stage === 'review') {
      const officeName = OFFICE_LABEL[s.office]
      const list = officeStepIndices.get(officeName) ?? []
      list.push(idx)
      officeStepIndices.set(officeName, list)
    }
  })

  const officeUsage = new Map<string, number>()

  for (const entry of history) {
    let targetIndex = -1

    if (
      entry.action === 'submitted' ||
      entry.action === 'resubmitted' ||
      entry.action === 'checked_complete' ||
      entry.action === 'checked_incomplete'
    ) {
      targetIndex = 0
    } else if (entry.action === 'marked_ready' || entry.action === 'released') {
      targetIndex = steps.length - 1
    } else if (entry.action === 'sent_external' || entry.action === 'returned_external') {
      targetIndex = steps.length - 1
    } else if (entry.action === 'routed' && entry.office === OFFICE_LABEL.secretary) {
      targetIndex = 0
    } else {
      const matching = officeStepIndices.get(entry.office)
      if (matching && matching.length > 0) {
        if (matching.length === 1) {
          targetIndex = matching[0]
        } else {
          const used = officeUsage.get(entry.office) ?? 0
          targetIndex = matching[Math.min(used, matching.length - 1)]
          officeUsage.set(entry.office, used + 1)
        }
      } else {
        const idx = steps.findIndex(
          (s) => s.stage === 'review' && (OFFICE_LABEL[s.office] === entry.office || s.label?.includes(entry.office)),
        )
        targetIndex = idx >= 0 ? idx : steps.length - 1
      }
    }

    if (targetIndex >= 0 && targetIndex < steps.length) {
      map.get(targetIndex)!.push(entry)
    } else {
      map.get(0)!.push(entry)
    }
  }

  return map
}

/* ------------------------------------------------------------------------ */
/* Route progress with indented milestones                                  */
/* ------------------------------------------------------------------------ */

/**
 * Shows the offices the document passes through with all processing milestones
 * nested and indented directly beneath their corresponding reviewing stage.
 */
export function RouteProgress({ doc, db }: { doc: DocRecord; db?: Database }) {
  const type = db ? typeOf(db, doc) : undefined
  const requester = db ? userById(db, doc.requesterId) : undefined
  const steps = doc.route.length > 1 ? doc.route : buildRoute(doc.origin, type, requester?.role)
  const done = doc.status === 'released' || doc.status === 'ready'
  const historyByStep = useMemo(() => groupHistoryByStep(steps, doc.history), [steps, doc.history])

  const items = steps.map((s, i) => {
    const label =
      s.stage === 'check'
        ? 'Content & Completeness Check (College Secretary)'
        : s.stage === 'final'
          ? 'Release & Archive (College Secretary)'
          : s.label ?? OFFICE_LABEL[s.office]
    const help =
      s.stage === 'check'
        ? 'Automatic completeness check passed; the College Secretary verifies document content.'
        : s.stage === 'final'
          ? 'The College Secretary prepares and releases the signed document.'
          : OFFICE_HELP[s.office]
    let state: 'done' | 'current' | 'next' | 'returned' | 'rejected' = i < doc.routeIndex ? 'done' : i === doc.routeIndex ? 'current' : 'next'
    if (done) state = 'done'
    if (doc.status === 'returned' && i === doc.routeIndex) state = 'returned'
    if (doc.status === 'rejected' && i === doc.routeIndex) state = 'rejected'
    if (doc.status === 'with_external' && i === doc.routeIndex) state = 'current'
    return { key: `${s.office}-${i}`, label, help, state, milestones: historyByStep.get(i) ?? [] }
  })

  return (
    <ol className="relative grid gap-0" aria-label="Document route and history">
      {items.map((it, i) => {
        const last = i === items.length - 1
        return (
          <li key={it.key} className="relative flex gap-3.5 pb-6 last:pb-0">
            {!last && (
              <span
                className={cn(
                  'absolute left-[13px] top-7 bottom-0 w-0.5 rounded-full',
                  it.state === 'done' ? 'bg-brand-500' : 'bg-ink-200',
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-white shadow-xs',
                it.state === 'done' && 'bg-brand-600 text-white',
                it.state === 'current' && 'bg-white text-brand-700 ring-brand-100 outline-2 outline-brand-600',
                it.state === 'next' && 'bg-ink-100 text-ink-400',
                it.state === 'returned' && 'bg-danger-500 text-white',
                it.state === 'rejected' && 'bg-danger-600 text-white',
              )}
              aria-hidden
            >
              {it.state === 'done' ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : it.state === 'current' ? (
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
                </span>
              ) : it.state === 'returned' || it.state === 'rejected' ? (
                <AlertTriangle className="size-3.5" strokeWidth={2.5} />
              ) : (
                <CircleDot className="size-3.5" />
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn('text-sm font-semibold', it.state === 'next' ? 'text-ink-500' : 'text-ink-900')}>
                  {it.label}
                </p>
                {it.state === 'current' && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                    Now
                  </span>
                )}
                {it.state === 'returned' && (
                  <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-bold text-danger-700">
                    Returned here
                  </span>
                )}
                {it.state === 'rejected' && (
                  <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-bold text-danger-700">
                    Disapproved here
                  </span>
                )}
                {it.state === 'done' && (
                  <span className="text-xs font-medium text-brand-700">Completed</span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-snug text-ink-500">{it.help}</p>

              {/* Indented Milestones sub-timeline under this route step */}
              {(it.milestones.length > 0 || it.state === 'current') && (
                <div className="mt-3 ml-2 sm:ml-3 rounded-xl bg-ink-50/70 p-3.5 ring-1 ring-inset ring-ink-100">
                  <div className="relative">
                    {it.milestones.map((m, mIdx) => {
                      const isLast = mIdx === it.milestones.length - 1 && it.state !== 'current'
                      const isReturned = m.action === 'returned' || m.action === 'checked_incomplete' || m.action === 'rejected'
                      return (
                        <div key={m.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                          {/* Sub-timeline connecting line between milestones */}
                          {!isLast && (
                            <span
                              className={cn(
                                'absolute left-[9px] top-5 bottom-0 w-0.5 rounded-full',
                                isReturned ? 'bg-danger-200' : 'bg-brand-200',
                              )}
                              aria-hidden
                            />
                          )}

                          {/* Milestone checkmark / status node */}
                          <span
                            className={cn(
                              'relative z-10 grid size-5 shrink-0 place-items-center rounded-full ring-2 ring-white shadow-xs',
                              isReturned
                                ? 'bg-danger-600 text-white'
                                : 'bg-brand-600 text-white',
                            )}
                            aria-hidden
                          >
                            {isReturned ? (
                              <RotateCcw className="size-2.5" strokeWidth={3} />
                            ) : (
                              <Check className="size-2.5" strokeWidth={3} />
                            )}
                          </span>

                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                              <p className="text-xs font-bold text-ink-900 leading-tight">{historyTitle(m)}</p>
                              <time dateTime={m.at} className="text-[11px] font-medium text-ink-500 whitespace-nowrap" title={formatDateTime(m.at)}>
                                {formatDateTime(m.at)}
                              </time>
                            </div>
                            <p className="mt-0.5 text-[11px] text-ink-500">
                              Recorded by <span className="font-semibold text-ink-700">{m.actorName}</span>
                              {m.office !== 'Requester' ? ` · ${m.office}` : ''}
                              {m.revision > 0 ? (
                                <span className="ml-1.5 inline-block rounded bg-ink-200/80 px-1 py-0.2 text-[10px] font-semibold text-ink-700">
                                  {revisionLabel(m.revision)}
                                </span>
                              ) : null}
                            </p>
                            {m.remarks && (
                              <blockquote className="mt-1.5 rounded-lg bg-white p-2.5 text-xs leading-relaxed text-ink-700 shadow-xs ring-1 ring-inset ring-ink-200/70">
                                <span className="font-semibold text-ink-600">Remarks: </span>
                                {m.remarks}
                              </blockquote>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {/* If step is currently active awaiting action, show pulsing sub-node at end of sub-timeline */}
                    {it.state === 'current' && (
                      <div className={cn('relative flex gap-3', it.milestones.length > 0 && 'pt-2')}>
                        <span
                          className="relative z-10 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 ring-2 ring-brand-400 shadow-xs"
                          aria-hidden
                        >
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
                            <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
                          </span>
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-xs font-semibold text-brand-900">
                            Currently under review at this office
                          </p>
                          <p className="text-[11px] text-ink-500">
                            Awaiting recorded review decision or release action
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------------ */
/* Processing history (Flat chronological view)                              */
/* ------------------------------------------------------------------------ */

export function ProcessingHistory({ doc }: { doc: DocRecord }) {
  const entries = [...doc.history].reverse()
  return (
    <ol className="relative space-y-5 before:absolute before:left-[5px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-ink-200">
      {entries.map((e, i) => (
        <li key={e.id} className="relative pl-7" style={{ animationDelay: `${i * 30}ms` }}>
          <span className={cn('absolute left-0 top-1.5 size-[11px] rounded-full ring-4 ring-white', dotTone[historyTone(e)])} aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-semibold text-ink-900">{historyTitle(e)}</p>
            <time dateTime={e.at} className="text-xs text-ink-500" title={formatDateTime(e.at)}>
              {formatDateTime(e.at)}
            </time>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            Recorded by {e.actorName}
            {e.office !== 'Requester' ? ` · ${e.office}` : ''}
            {e.revision > 0 ? ` · ${revisionLabel(e.revision)}` : ''}
          </p>
          {e.remarks && (
            <blockquote className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm leading-relaxed text-ink-700 ring-1 ring-inset ring-ink-100">
              {e.remarks}
            </blockquote>
          )}
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------------ */
/* Attachments (REQ-REC-6, REQ-REL-4)                                        */
/* ------------------------------------------------------------------------ */

/** Object URLs for files attached in this browser session. */
export const sessionFiles = new Map<string, string>()

export function AttachmentList({ db, doc }: { db: Database; doc: DocRecord }) {
  const [selectedAttachId, setSelectedAttachId] = useState<string | undefined>()
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const type = typeOf(db, doc)
  const requester = userById(db, doc.requesterId)
  const byRev = new Map<number, Attachment[]>()
  for (const a of doc.attachments) byRev.set(a.revision, [...(byRev.get(a.revision) ?? []), a])
  const revs = [...byRev.keys()].sort((a, b) => b - a)
  if (doc.attachments.length === 0) return <p className="text-sm text-ink-500">No files are attached to this request.</p>

  const handleSampleDownload = (a: Attachment) => {
    const req = type?.requirements.find((r) => r.id === a.requirementId)
    downloadGeneratedPdf(a.name, `Audit E-Copy: ${a.name}`, [
      `Control Number: ${controlNumber(doc)}`,
      `Document Title: ${doc.title}`,
      `Document Type: ${type?.name ?? doc.typeId}`,
      `Origin: ${doc.origin}`,
      `Requester: ${requester?.name ?? 'Unknown'} (${requester?.department ?? ''})`,
      `Attachment Category: ${a.isSignedCopy ? 'Final Signed Release Copy' : (req?.label ?? 'Supporting Attachment')}`,
      `Uploaded By: ${a.uploadedBy}`,
      `Uploaded At: ${formatDateTime(a.uploadedAt)}`,
      `Revision: ${revisionLabel(a.revision)}`,
      '',
      'This official electronic copy was exported from CESS DocuFlow for review and institutional audit.',
    ])
  }

  return (
    <div className="space-y-5">
      {revs.map((rev) => (
        <div key={rev}>
          {revs.length > 1 && (
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
              {rev === doc.revision ? `Latest files (${revisionLabel(rev)})` : `Earlier files (${revisionLabel(rev)})`}
            </p>
          )}
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg ring-1 ring-ink-100">
            {byRev.get(rev)!.map((a) => {
              const req = type?.requirements.find((r) => r.id === a.requirementId)
              return (
                <li key={a.id} className="flex items-center gap-3 bg-white px-3 py-2.5">
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg',
                      a.isSignedCopy ? 'bg-success-50 text-success-600' : 'bg-brand-50 text-brand-600',
                    )}
                  >
                    {a.isSignedCopy ? <FileCheck2 className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink-900">{a.name}</p>
                      {a.isSignedCopy && (
                        <Badge tone="success" dot={false}>
                          Final Signed Copy
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-500">
                      {a.isSignedCopy ? 'Scanned signed document attached upon release' : (req ? req.label : 'Additional file')} · {formatSize(a.sizeKb)} · added {timeAgo(a.uploadedAt)} by {a.uploadedBy}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAttachId(a.id)
                        setIsPreviewOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 transition-colors"
                      title="Preview this document on screen"
                    >
                      <Eye className="size-3.5 text-brand-600" aria-hidden /> Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSampleDownload(a)}
                      className="inline-flex items-center gap-1 rounded-lg bg-ink-50 p-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                      title="Download PDF Copy"
                      aria-label={`Download ${a.name}`}
                    >
                      <Download className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {isPreviewOpen && (
        <DocumentPreviewModal
          open={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          doc={doc}
          db={db}
          initialAttachmentId={selectedAttachId}
        />
      )}
    </div>
  )
}

export function formatSize(kb: number) {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`
}

export function AttachmentCount({ doc }: { doc: DocRecord }) {
  const n = doc.attachments.filter((a) => a.revision === doc.revision).length
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-500">
      <Paperclip className="size-3.5" aria-hidden /> {plural(n, 'file')}
    </span>
  )
}

export function WaitingTime({ doc }: { doc: DocRecord }) {
  const d = daysWaiting(doc)
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-500">
      <Clock className="size-3.5" aria-hidden />
      {d === 0 ? 'Arrived today' : `Waiting ${plural(d, 'day')}`}
    </span>
  )
}
