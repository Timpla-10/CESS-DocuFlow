import {
  CheckCircle2,
  Mail,
  Search,
} from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Input } from '../../components/form'
import { Badge, Button, Card, EmptyState, PageHeader, Pagination } from '../../components/ui'
import { useDb } from '../../data/store'
import type { NotificationKind, NotificationLog } from '../../data/types'
import { formatDateTime, timeAgo } from '../../lib/time'

const KIND_LABEL: Record<NotificationKind, string> = {
  submitted: 'Submission Confirmation',
  returned: 'Return for Correction',
  ready: 'Ready for Pickup',
  reminder: 'Office Turnaround Reminder',
  update: 'Requester Progress Update',
  notice: 'Notice / Minutes Released',
  rejected: 'Disapproval / Rejection Notice',
}

export function EmailLogPage() {
  const db = useDb()

  const [search, setSearch] = useState('')
  const [inspecting, setInspecting] = useState<NotificationLog | null>(null)
  const [pageSize, setPageSize] = useState<number>(15)
  const [currentPage, setCurrentPage] = useState<number>(1)

  const notifications = db.notifications.filter((n) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      n.recipientLabel.toLowerCase().includes(q) ||
      n.recipientEmail.toLowerCase().includes(q) ||
      n.subject.toLowerCase().includes(q)
    )
  })

  // Pagination calculation
  const totalItems = notifications.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const validPage = Math.min(currentPage, totalPages)
  const startIndex = (validPage - 1) * pageSize
  const paginatedNotifications = notifications.slice(startIndex, startIndex + pageSize)

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setCurrentPage(1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communications Audit"
        title="Email Notifications Log"
        description="A complete audit record of automated emails dispatched to requesters and reviewing offices, including status updates, return reasons, and reminders."
      />

      <Card>
        {/* Search */}
        <div className="border-b border-ink-100 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              type="search"
              placeholder="Search by recipient or subject…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-4"
            />
          </div>
        </div>

        {/* Notification Table */}
        {notifications.length === 0 ? (
          <EmptyState icon={Mail} title="No notification records found">
            Try adjusting your search query.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th className="px-6 py-3.5 min-w-[200px]">Recipient</th>
                    <th className="px-5 py-3.5 min-w-[150px]">Category</th>
                    <th className="px-5 py-3.5 min-w-[140px]">Channel</th>
                    <th className="px-5 py-3.5 min-w-[240px]">Subject</th>
                    <th className="px-5 py-3.5 min-w-[130px] whitespace-nowrap">Sent At</th>
                    <th className="px-5 py-3.5 min-w-[140px]">Delivery Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {paginatedNotifications.map((n) => (
                    <tr key={n.id} className="hover:bg-brand-50/60">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink-900">{n.recipientLabel}</p>
                        <p className="mt-0.5 text-xs text-ink-500">{n.recipientEmail || 'Office Group'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="brand" dot={false}>
                          {KIND_LABEL[n.kind]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="neutral" dot={false}>
                          {n.channels && n.channels.length === 1
                            ? n.channels[0] === 'email'
                              ? 'Email Only'
                              : 'In-System Only'
                            : 'Email + In-System'}
                        </Badge>
                      </td>
                      <td className="max-w-[320px] truncate px-5 py-4 font-medium text-ink-800">
                        {n.subject}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-ink-600">
                        {timeAgo(n.at)}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success-700">
                          <CheckCircle2 className="size-3.5 shrink-0" /> Delivered
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspecting(n)}
                        >
                          View Email
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={validPage}
              totalItems={notifications.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
              itemLabel="logs"
            />
          </>
        )}
      </Card>

      {/* View Email Content Dialog */}
      <Dialog
        open={!!inspecting}
        onClose={() => setInspecting(null)}
        size="lg"
        title={inspecting?.subject || 'Email Preview'}
        description={`Dispatched to ${inspecting?.recipientEmail} on ${
          inspecting ? formatDateTime(inspecting.at) : ''
        }`}
        footer={
          <Button variant="secondary" onClick={() => setInspecting(null)}>
            Close Preview
          </Button>
        }
      >
        {inspecting && (
          <div className="space-y-5">
            <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-5">
              <div className="flex justify-between text-xs text-ink-600 pb-2.5 border-b border-ink-200">
                <span><strong>To:</strong> {inspecting.recipientLabel} &lt;{inspecting.recipientEmail}&gt;</span>
                <span><strong>Category:</strong> {KIND_LABEL[inspecting.kind]}</span>
              </div>
              <p className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-900">
                {inspecting.body}
              </p>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
