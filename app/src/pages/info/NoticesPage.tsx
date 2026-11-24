import {
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  StatCard,
  cn,
} from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { Notice, NoticeAudience, NoticeStatus } from '../../data/types'
import { formatDate, formatDateTime, timeAgo } from '../../lib/time'

const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  all: 'All College Community',
  faculty: 'Faculty Members Only',
  students: 'Students Only',
  reviewers: 'Reviewing Offices & Evaluators',
  staff: 'Administrative Staff',
}

const AUDIENCE_TONES: Record<NoticeAudience, 'brand' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  all: 'brand',
  faculty: 'success',
  students: 'warning',
  reviewers: 'danger',
  staff: 'neutral',
}

export function NoticesPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()

  const canPublish = user.role === 'secretary' || user.role === 'dean'

  // Filter tab states
  const [publisherTab, setPublisherTab] = useState<'all' | 'published' | 'draft' | 'scheduled' | 'expired'>('all')
  const [recipientTab, setRecipientTab] = useState<'all' | 'notice' | 'minutes'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Create notice state
  const [isPostOpen, setIsPostOpen] = useState(false)
  const [kind, setKind] = useState<'notice' | 'minutes'>('notice')
  const [status, setStatus] = useState<NoticeStatus>('published')
  const [targetAudience, setTargetAudience] = useState<NoticeAudience>('all')
  const [publishDate, setPublishDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [formErrors, setFormErrors] = useState<{ title?: string; summary?: string }>({})

  // Edit notice state
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null)
  const [editKind, setEditKind] = useState<'notice' | 'minutes'>('notice')
  const [editStatus, setEditStatus] = useState<NoticeStatus>('published')
  const [editAudience, setEditAudience] = useState<NoticeAudience>('all')
  const [editPublishDate, setEditPublishDate] = useState('')
  const [editExpiryDate, setEditExpiryDate] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editFileName, setEditFileName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  // Delete notice state
  const [deletingNotice, setDeletingNotice] = useState<Notice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // View full notice modal
  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null)

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Audience helper for recipient permissions
  const matchesAudience = (noticeAudience: NoticeAudience | undefined): boolean => {
    const aud = noticeAudience || 'all'
    if (aud === 'all') return true
    if (aud === 'students' && user.role === 'student') return true
    if (aud === 'faculty' && user.role === 'faculty') return true
    if (
      aud === 'reviewers' &&
      ['chairperson', 'dean', 'ids_principal', 'ovcaa', 'vcaf', 'chancellor'].includes(user.role)
    )
      return true
    if (aud === 'staff' && ['secretary', 'admin', 'faculty'].includes(user.role)) return true
    return false
  }

  // Publisher views: categorize all notices
  const allNotices = db.notices
  const publishedCount = allNotices.filter((n) => (n.status ?? 'published') === 'published').length
  const draftCount = allNotices.filter((n) => n.status === 'draft').length
  const scheduledCount = allNotices.filter((n) => {
    const pub = (n.publishDate || n.postedAt).slice(0, 10)
    return (n.status ?? 'published') === 'published' && pub > todayStr
  }).length
  const expiredCount = allNotices.filter((n) => {
    if (!n.expiryDate) return false
    return n.expiryDate.slice(0, 10) < todayStr
  }).length

  // Filtered notices for display
  const displayedNotices = useMemo(() => {
    let list: Notice[] = []

    if (canPublish) {
      // Publisher View
      if (publisherTab === 'all') list = allNotices
      else if (publisherTab === 'published') {
        list = allNotices.filter((n) => (n.status ?? 'published') === 'published')
      } else if (publisherTab === 'draft') {
        list = allNotices.filter((n) => n.status === 'draft')
      } else if (publisherTab === 'scheduled') {
        list = allNotices.filter((n) => {
          const pub = (n.publishDate || n.postedAt).slice(0, 10)
          return (n.status ?? 'published') === 'published' && pub > todayStr
        })
      } else if (publisherTab === 'expired') {
        list = allNotices.filter((n) => n.expiryDate && n.expiryDate.slice(0, 10) < todayStr)
      }
    } else {
      // Recipient View: STRICT RULES
      // 1. MUST be published (never drafts)
      // 2. Publish date must be <= today
      // 3. Expiry date (if specified) must be >= today
      // 4. Target audience must match recipient's role
      list = allNotices.filter((n) => {
        const isPublished = (n.status ?? 'published') === 'published'
        if (!isPublished) return false

        const pubDateStr = (n.publishDate || n.postedAt).slice(0, 10)
        if (pubDateStr > todayStr) return false

        if (n.expiryDate && n.expiryDate.slice(0, 10) < todayStr) return false

        if (!matchesAudience(n.targetAudience)) return false

        if (recipientTab !== 'all' && n.kind !== recipientTab) return false

        return true
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.summary.toLowerCase().includes(q) ||
          n.postedBy.toLowerCase().includes(q) ||
          n.postedByOffice.toLowerCase().includes(q),
      )
    }

    return list
  }, [allNotices, canPublish, publisherTab, recipientTab, todayStr, searchQuery, user.role])

  // Handlers
  const handleOpenCreate = () => {
    setKind('notice')
    setStatus('published')
    setTargetAudience('all')
    setPublishDate(todayStr)
    setExpiryDate('')
    setTitle('')
    setSummary('')
    setContent('')
    setFileName('')
    setFormErrors({})
    setIsPostOpen(true)
  }

  const handleSaveNotice = async (e: FormEvent) => {
    e.preventDefault()
    setFormErrors({})

    const errs: { title?: string; summary?: string } = {}
    if (!title.trim()) errs.title = 'Please enter a title for this announcement.'
    if (!summary.trim()) errs.summary = 'Please provide a brief summary of this announcement.'

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      return
    }

    setIsPosting(true)
    try {
      await api.postNotice(user, {
        kind,
        status,
        targetAudience,
        publishDate,
        expiryDate: expiryDate || undefined,
        title: title.trim(),
        summary: summary.trim(),
        content: content.trim() || undefined,
        fileName: fileName.trim() || `${title.replace(/\s+/g, '_')}.pdf`,
      })

      if (status === 'draft') {
        toast.info(
          'Draft Saved',
          'Announcement saved as draft. It is hidden from recipients until published.',
        )
      } else {
        toast.success(
          kind === 'notice' ? 'Notice Published' : 'Minutes Published',
          `Announcement successfully released for: ${AUDIENCE_LABELS[targetAudience]}.`,
        )
      }

      setIsPostOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed.'
      toast.error('Unable to Save Announcement', msg)
    } finally {
      setIsPosting(false)
    }
  }

  const handleEditClick = (n: Notice) => {
    setEditingNotice(n)
    setEditKind(n.kind)
    setEditStatus(n.status || 'published')
    setEditAudience(n.targetAudience || 'all')
    setEditPublishDate((n.publishDate || n.postedAt).slice(0, 10))
    setEditExpiryDate(n.expiryDate ? n.expiryDate.slice(0, 10) : '')
    setEditTitle(n.title)
    setEditSummary(n.summary)
    setEditContent(n.content || '')
    setEditFileName(n.fileName)
  }

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingNotice) return
    if (!editTitle.trim()) {
      toast.error('Validation Error', 'Please enter a title for this announcement.')
      return
    }

    setIsUpdating(true)
    try {
      await api.updateNotice(user, editingNotice.id, {
        kind: editKind,
        status: editStatus,
        targetAudience: editAudience,
        publishDate: editPublishDate,
        expiryDate: editExpiryDate || undefined,
        title: editTitle.trim(),
        summary: editSummary.trim(),
        content: editContent.trim() || undefined,
        fileName: editFileName.trim() || editingNotice.fileName,
      })

      toast.success(
        editStatus === 'draft' ? 'Draft Updated' : 'Announcement Updated',
        'Changes saved successfully.',
      )
      setEditingNotice(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed.'
      toast.error('Unable to Update', msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const handlePublishNow = async (n: Notice) => {
    try {
      await api.publishNotice(user, n.id)
      toast.success(
        'Announcement Published',
        `"${n.title}" is now published and visible to ${AUDIENCE_LABELS[n.targetAudience || 'all']}.`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Publish failed.'
      toast.error('Unable to Publish', msg)
    }
  }

  const handleDelete = async () => {
    if (!deletingNotice) return
    setIsDeleting(true)
    try {
      await api.deleteNotice(user, deletingNotice.id)
      toast.success('Announcement Deleted', `Successfully removed "${deletingNotice.title}".`)
      setDeletingNotice(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed.'
      toast.error('Unable to Delete', msg)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleMarkAsRead = (n: Notice) => {
    api.markNoticeRead(user, n.id)
    toast.info('Marked as Read', `Marked "${n.title}" as read.`)
  }

  const handleDownload = (n: Notice) => {
    downloadGeneratedPdf(
      n.fileName || `${n.title.replace(/\s+/g, '_')}.pdf`,
      `${n.kind === 'notice' ? 'OFFICIAL COLLEGE NOTICE' : 'APPROVED MINUTES OF MEETING'}: ${n.title}`,
      [
        'MINDANAO STATE UNIVERSITY AT NAAWAN',
        'COLLEGE OF EDUCATION AND SOCIAL SCIENCES',
        'OFFICIAL COLLEGE ANNOUNCEMENT & CIRCULAR',
        '',
        `Category: ${n.kind === 'notice' ? 'Official College Notice' : 'Approved Minutes of Meeting'}`,
        `Title: ${n.title}`,
        `Target Audience: ${AUDIENCE_LABELS[n.targetAudience || 'all']}`,
        `Released By: ${n.postedBy} (${n.postedByOffice})`,
        `Effective Date: ${n.publishDate ? formatDate(n.publishDate) : formatDate(n.postedAt)}`,
        n.expiryDate ? `Validity End Date: ${formatDate(n.expiryDate)}` : 'Validity: Open-ended',
        '',
        'SUMMARY / AGENDA:',
        n.summary || 'Official announcement released through CESS DocuFlow.',
        '',
        ...(n.content ? ['DETAILED ANNOUNCEMENT BODY:', n.content, ''] : []),
        'INSTITUTIONAL RECORD CERTIFICATION:',
        'This electronic circular was published through the CESS DocuFlow Announcements system.',
      ],
    )
    toast.info('Document Downloaded', `Downloaded ${n.fileName || 'Announcement.pdf'}.`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="College Communications & Official Releases"
        title="Notices & Announcements"
        description="Official institutional circulars, notices of meetings, approved minutes, and announcements published by the College Secretary and Dean."
        actions={
          canPublish ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleOpenCreate} icon={Plus}>
                Draft or Publish Announcement
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Publisher Metrics */}
      {canPublish && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total Releases"
            value={allNotices.length}
            hint="All notices & minutes"
            icon={Megaphone}
            tone="brand"
          />
          <StatCard
            label="Published & Active"
            value={publishedCount}
            hint="Visible to designated audiences"
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard
            label="Draft Notices"
            value={draftCount}
            hint="Hidden from recipients"
            icon={FileText}
            tone={draftCount > 0 ? 'warning' : 'neutral'}
          />
          <StatCard
            label="Scheduled / Expired"
            value={scheduledCount + expiredCount}
            hint={`${scheduledCount} scheduled · ${expiredCount} expired`}
            icon={Calendar}
            tone="neutral"
          />
        </div>
      )}

      {/* Filter and Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
        {canPublish ? (
          <Segmented
            label="Notice Status Filter"
            value={publisherTab}
            onChange={(val) => setPublisherTab(val as typeof publisherTab)}
            options={[
              { value: 'all', label: `All (${allNotices.length})` },
              { value: 'published', label: `Published (${publishedCount})` },
              { value: 'draft', label: `Drafts (${draftCount})` },
              { value: 'scheduled', label: `Scheduled (${scheduledCount})` },
              { value: 'expired', label: `Expired (${expiredCount})` },
            ]}
          />
        ) : (
          <Segmented
            label="Notice Category Filter"
            value={recipientTab}
            onChange={(val) => setRecipientTab(val as typeof recipientTab)}
            options={[
              { value: 'all', label: `All Announcements (${displayedNotices.length})` },
              { value: 'notice', label: 'College Notices' },
              { value: 'minutes', label: 'Minutes of Meetings' },
            ]}
          />
        )}

        <div className="w-full sm:w-64">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search announcements..."
            className="text-xs"
          />
        </div>
      </div>

      {/* Announcements List */}
      {displayedNotices.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Megaphone}
            title={canPublish ? 'No announcements match filter' : 'No announcements for your role'}
          >
            {canPublish
              ? 'Try switching tabs or creating a new announcement.'
              : 'Official notices, meeting minutes, and circulars targeted to your academic program or office will appear here when published.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayedNotices.map((n) => {
            const isRead = n.readBy.includes(user.id)
            const isDraft = n.status === 'draft'
            const pubDateStr = (n.publishDate || n.postedAt).slice(0, 10)
            const isScheduled = (n.status ?? 'published') === 'published' && pubDateStr > todayStr
            const isExpired = n.expiryDate && n.expiryDate.slice(0, 10) < todayStr

            return (
              <Card
                key={n.id}
                className={cn(
                  'p-5 transition-all hover:shadow-card',
                  isDraft && 'border-dashed border-warning-300 bg-warning-50/20',
                  !isRead && !isDraft && 'ring-1 ring-brand-300 bg-brand-50/10',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 max-w-3xl space-y-2">
                    {/* Status & Audience Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={n.kind === 'notice' ? 'brand' : 'neutral'} dot={false}>
                        {n.kind === 'notice' ? 'College Notice' : 'Minutes of Meeting'}
                      </Badge>

                      {/* Status Badges for Publishers */}
                      {canPublish && (
                        <>
                          {isDraft && (
                            <Badge tone="warning" dot={false}>
                              Draft (Hidden from Recipients)
                            </Badge>
                          )}
                          {isScheduled && (
                            <Badge tone="brand" dot={false}>
                              Scheduled: {formatDate(n.publishDate || n.postedAt)}
                            </Badge>
                          )}
                          {isExpired && (
                            <Badge tone="danger" dot={false}>
                              Expired on {formatDate(n.expiryDate!)}
                            </Badge>
                          )}
                          {!isDraft && !isScheduled && !isExpired && (
                            <Badge tone="success" dot={false}>
                              Published & Live
                            </Badge>
                          )}
                        </>
                      )}

                      {/* Target Audience Badge */}
                      <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 text-2xs font-semibold text-ink-800 ring-1 ring-inset ring-ink-200">
                        <Users className="size-3 text-ink-500" />
                        Target: {AUDIENCE_LABELS[n.targetAudience || 'all']}
                      </span>

                      {/* Recipient Read/Unread Badge */}
                      {!canPublish && !isRead && (
                        <span className="inline-flex items-center gap-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                          New
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-ink-950">{n.title}</h3>

                    {/* Summary */}
                    {n.summary && (
                      <p className="text-xs leading-relaxed text-ink-700">{n.summary}</p>
                    )}

                    {/* Metadata & Validity Dates */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-500 pt-1">
                      <span>
                        Posted by <strong>{n.postedBy}</strong> ({n.postedByOffice})
                      </span>
                      <span>
                        Release Date: <strong>{formatDate(n.publishDate || n.postedAt)}</strong>
                      </span>
                      {n.expiryDate && (
                        <span className={cn(isExpired ? 'text-danger-700 font-semibold' : 'text-ink-600')}>
                          Valid Until: <strong>{formatDate(n.expiryDate)}</strong>
                        </span>
                      )}
                    </div>

                    {/* Attachment and Full View shortcuts */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      {n.fileName && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-700 ring-1 ring-ink-200">
                          <FileText className="size-3.5 text-brand-600" />
                          <span>{n.fileName}</span>
                          <button
                            type="button"
                            onClick={() => handleDownload(n)}
                            className="ml-1 text-brand-700 hover:underline inline-flex items-center gap-0.5"
                          >
                            <Download className="size-3" /> Download
                          </button>
                        </div>
                      )}

                      {n.content && (
                        <button
                          type="button"
                          onClick={() => setViewingNotice(n)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                        >
                          <Eye className="size-3.5" /> Read Full Announcement
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex flex-col items-end gap-2.5 sm:flex-row sm:items-center">
                    <span
                      className="text-2xs text-ink-400 whitespace-nowrap"
                      title={formatDateTime(n.postedAt)}
                    >
                      {timeAgo(n.publishDate || n.postedAt)}
                    </span>

                    {/* Publisher action controls */}
                    {canPublish && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isDraft && (
                          <button
                            type="button"
                            onClick={() => handlePublishNow(n)}
                            className="inline-flex items-center gap-1 rounded-lg bg-success-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-success-700 transition"
                            title="Publish announcement now"
                          >
                            <Send className="size-3.5" />
                            <span>Publish Now</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditClick(n)}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
                          title="Edit announcement"
                        >
                          <Pencil className="size-3.5 text-ink-500" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingNotice(n)}
                          className="inline-flex items-center gap-1 rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-semibold text-danger-700 shadow-2xs hover:bg-danger-50 transition"
                          title="Delete announcement"
                        >
                          <Trash2 className="size-3.5 text-danger-600" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}

                    {/* Recipient read status toggle */}
                    {!canPublish && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isRead ? (
                          <button
                            type="button"
                            onClick={() => handleMarkAsRead(n)}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 transition"
                          >
                            <CheckCircle2 className="size-3.5 text-brand-600" />
                            <span>Mark Read</span>
                          </button>
                        ) : (
                          <span className="text-2xs text-ink-400 flex items-center gap-1">
                            <CheckCircle2 className="size-3 text-emerald-600" /> Read
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / Publish Announcement Dialog */}
      <Dialog
        open={isPostOpen}
        onClose={() => setIsPostOpen(false)}
        size="lg"
        title="Draft or Publish Announcement"
        description="Draft or officially release institutional notices and meeting minutes with designated target audiences and active dates."
        busy={isPosting}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsPostOpen(false)}
              disabled={isPosting}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={(e) => {
                setStatus('draft')
                handleSaveNotice(e)
              }}
              loading={isPosting && status === 'draft'}
              icon={FileText}
            >
              Save as Draft
            </Button>
            <Button
              onClick={(e) => {
                setStatus('published')
                handleSaveNotice(e)
              }}
              loading={isPosting && status === 'published'}
              icon={Send}
            >
              Publish Announcement
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={handleSaveNotice}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="notice">Official College Notice</option>
                <option value="minutes">Approved Minutes of Meeting</option>
              </Select>
            </Field>

            <Field label="Target Audience" required hint="Only users in this group will see this announcement">
              <Select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as NoticeAudience)}
              >
                <option value="all">All College Community (Students, Faculty, Staff)</option>
                <option value="faculty">Faculty Members Only</option>
                <option value="students">Students Only</option>
                <option value="reviewers">Reviewing Offices & Evaluators</option>
                <option value="staff">Administrative Staff</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Effective Publish Date" required hint="Recipients will not see this before this date">
              <Input
                type="date"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                required
              />
            </Field>

            <Field label="Expiration Date (Optional)" hint="Leave empty for open-ended announcements">
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                min={publishDate}
              />
            </Field>
          </div>

          <Field label="Announcement Title" required error={formErrors.title}>
            <Input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (formErrors.title) setFormErrors((p) => ({ ...p, title: undefined }))
              }}
              placeholder="e.g. Schedule of Midterm Examination Grade Submissions..."
              required
            />
          </Field>

          <Field label="Summary / Agenda Overview" required error={formErrors.summary}>
            <Textarea
              rows={2}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value)
                if (formErrors.summary) setFormErrors((p) => ({ ...p, summary: undefined }))
              }}
              placeholder="Brief summary displayed on announcement feed..."
              required
            />
          </Field>

          <Field label="Detailed Body / Resolution Content (Optional)">
            <Textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Full text of the notice, resolution, or meeting agenda items..."
            />
          </Field>

          <Field label="Attached File Name (Optional)" hint="Official PDF file exported for this announcement">
            <Input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. Notice_FacultyMeeting_Oct23.pdf"
            />
          </Field>
        </form>
      </Dialog>

      {/* Edit Announcement Dialog */}
      <Dialog
        open={!!editingNotice}
        onClose={() => setEditingNotice(null)}
        size="lg"
        title="Edit Announcement"
        description="Update publishing status, audience routing, active dates, or announcement contents."
        busy={isUpdating}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingNotice(null)} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={isUpdating}>
              Save Changes
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={handleUpdate}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <Select
                value={editKind}
                onChange={(e) => setEditKind(e.target.value as typeof editKind)}
              >
                <option value="notice">Official College Notice</option>
                <option value="minutes">Approved Minutes of Meeting</option>
              </Select>
            </Field>

            <Field label="Publishing Status" required>
              <Select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as NoticeStatus)}
              >
                <option value="published">Published (Visible to audience)</option>
                <option value="draft">Draft (Hidden from recipients)</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Target Audience" required>
              <Select
                value={editAudience}
                onChange={(e) => setEditAudience(e.target.value as NoticeAudience)}
              >
                <option value="all">All College Community (Students, Faculty, Staff)</option>
                <option value="faculty">Faculty Members Only</option>
                <option value="students">Students Only</option>
                <option value="reviewers">Reviewing Offices & Evaluators</option>
                <option value="staff">Administrative Staff</option>
              </Select>
            </Field>

            <Field label="Effective Publish Date" required>
              <Input
                type="date"
                value={editPublishDate}
                onChange={(e) => setEditPublishDate(e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Expiration Date (Optional)">
            <Input
              type="date"
              value={editExpiryDate}
              onChange={(e) => setEditExpiryDate(e.target.value)}
            />
          </Field>

          <Field label="Announcement Title" required>
            <Input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </Field>

          <Field label="Summary / Agenda Overview" required>
            <Textarea
              rows={2}
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              required
            />
          </Field>

          <Field label="Detailed Body / Resolution Content (Optional)">
            <Textarea
              rows={4}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
          </Field>

          <Field label="Attachment File Name (Optional)">
            <Input
              type="text"
              value={editFileName}
              onChange={(e) => setEditFileName(e.target.value)}
            />
          </Field>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingNotice}
        onClose={() => setDeletingNotice(null)}
        size="sm"
        title="Delete Announcement?"
        description={
          deletingNotice
            ? `Are you sure you want to delete "${deletingNotice.title}"? This will permanently remove it from the college announcements repository.`
            : undefined
        }
        busy={isDeleting}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingNotice(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={isDeleting} icon={Trash2}>
              Delete Announcement
            </Button>
          </>
        }
      >
        <p className="text-xs text-ink-600">
          This action cannot be undone. All recorded read statuses and circular logs for this notice will be erased.
        </p>
      </Dialog>

      {/* Full Notice Content Inspection Dialog */}
      {viewingNotice && (
        <Dialog
          open={!!viewingNotice}
          onClose={() => setViewingNotice(null)}
          size="lg"
          title={viewingNotice.title}
          description={`Released by ${viewingNotice.postedBy} (${viewingNotice.postedByOffice}) · ${formatDate(viewingNotice.publishDate || viewingNotice.postedAt)}`}
          footer={
            <div className="flex w-full items-center justify-between">
              <Button
                variant="secondary"
                icon={Download}
                onClick={() => handleDownload(viewingNotice)}
              >
                Download PDF Copy
              </Button>
              <Button variant="primary" onClick={() => setViewingNotice(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={viewingNotice.kind === 'notice' ? 'brand' : 'neutral'} dot={false}>
                {viewingNotice.kind === 'notice' ? 'Official College Notice' : 'Approved Minutes of Meeting'}
              </Badge>
              <Badge tone={AUDIENCE_TONES[viewingNotice.targetAudience || 'all']} dot={false}>
                Target: {AUDIENCE_LABELS[viewingNotice.targetAudience || 'all']}
              </Badge>
              {viewingNotice.expiryDate && (
                <span className="text-2xs text-ink-500">
                  Valid Until: {formatDate(viewingNotice.expiryDate)}
                </span>
              )}
            </div>

            <div className="rounded-xl bg-ink-50 p-3.5 text-xs text-ink-800 leading-relaxed ring-1 ring-inset ring-ink-100">
              <p className="font-semibold text-ink-950 mb-1">Executive Summary:</p>
              <p>{viewingNotice.summary}</p>
            </div>

            {viewingNotice.content && (
              <div className="space-y-2 pt-2 border-t border-ink-100">
                <p className="font-bold text-ink-900 text-xs">Official Resolution & Full Body:</p>
                <div className="rounded-xl border border-ink-200 bg-white p-4 text-xs text-ink-800 leading-relaxed whitespace-pre-wrap font-sans">
                  {viewingNotice.content}
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
