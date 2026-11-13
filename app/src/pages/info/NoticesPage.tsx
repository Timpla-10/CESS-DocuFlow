import {
  FileText,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { Notice } from '../../data/types'
import { formatDateTime, timeAgo } from '../../lib/time'

export function NoticesPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()

  const [isPostOpen, setIsPostOpen] = useState(false)
  const [kind, setKind] = useState<'notice' | 'minutes'>('notice')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [fileName, setFileName] = useState('')
  const [isPosting, setIsPosting] = useState(false)

  // Edit notice state
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null)
  const [editKind, setEditKind] = useState<'notice' | 'minutes'>('notice')
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editFileName, setEditFileName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  // Delete notice state
  const [deletingNotice, setDeletingNotice] = useState<Notice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const canPost = user.role === 'secretary' || user.role === 'dean'

  const handlePost = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Validation Error', 'Please enter a title for this announcement.')
      return
    }

    setIsPosting(true)
    try {
      await api.postNotice(user, {
        kind,
        title: title.trim(),
        summary: summary.trim(),
        fileName: fileName.trim() || `${title.replace(/\s+/g, '_')}.pdf`,
      })
      toast.success(
        kind === 'notice' ? 'Notice Published' : 'Minutes Published',
        'Your announcement was posted and email notifications sent to faculty.'
      )
      setIsPostOpen(false)
      setTitle('')
      setSummary('')
      setFileName('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Publish failed.'
      toast.error('Unable to Publish', msg)
    } finally {
      setIsPosting(false)
    }
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
        title: editTitle.trim(),
        summary: editSummary.trim(),
        fileName: editFileName.trim() || editingNotice.fileName,
      })
      toast.success(
        editKind === 'notice' ? 'Notice Updated' : 'Minutes Updated',
        'The announcement was successfully updated.'
      )
      setEditingNotice(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed.'
      toast.error('Unable to Update', msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingNotice) return
    setIsDeleting(true)
    try {
      await api.deleteNotice(user, deletingNotice.id)
      toast.success(
        'Announcement Deleted',
        `Successfully removed "${deletingNotice.title}".`
      )
      setDeletingNotice(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed.'
      toast.error('Unable to Delete', msg)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="College Announcements"
        title="Notices & Minutes of Meetings"
        description="Official college notices, meeting announcements, and approved minutes released for faculty and staff review."
        actions={
          canPost ? (
            <Button onClick={() => setIsPostOpen(true)} icon={Plus}>
              Publish Announcement
            </Button>
          ) : undefined
        }
      />

      {db.notices.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={Megaphone} title="No notices or minutes posted yet">
            Announcements and approved meeting minutes from the College Secretary and Dean will appear here.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {db.notices.map((n) => (
            <Card key={n.id} className="p-5 transition-all hover:shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <Badge tone={n.kind === 'notice' ? 'brand' : 'neutral'} dot={false}>
                      {n.kind === 'notice' ? 'College Notice' : 'Minutes of Meeting'}
                    </Badge>
                    <span className="text-xs text-ink-500">
                      Posted by {n.postedByOffice} ({n.postedBy})
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-ink-900">{n.title}</h3>
                  {n.summary && (
                    <p className="mt-1 text-sm leading-relaxed text-ink-700">{n.summary}</p>
                  )}
                  {n.fileName && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-700 ring-1 ring-ink-200">
                        <FileText className="size-3.5 text-brand-600" />
                        {n.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          downloadGeneratedPdf(
                            n.fileName,
                            `${n.kind === 'notice' ? 'OFFICIAL COLLEGE NOTICE' : 'APPROVED MINUTES OF MEETING'}: ${n.title}`,
                            [
                              `Category: ${n.kind === 'notice' ? 'Official College Notice' : 'Approved Minutes of Meeting'}`,
                              `Title: ${n.title}`,
                              `Released By: ${n.postedBy} (${n.postedByOffice})`,
                              `Released At: ${formatDateTime(n.postedAt)}`,
                              '',
                              'SUMMARY / DETAILS:',
                              n.summary || 'Official announcement released through CESS DocuFlow.',
                            ],
                          )
                          toast.info('Document Downloaded', `Downloaded ${n.fileName}.`)
                        }}
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        Download PDF
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2.5 sm:flex-row sm:items-center">
                  <span className="text-xs text-ink-500 whitespace-nowrap" title={formatDateTime(n.postedAt)}>
                    {timeAgo(n.postedAt)}
                  </span>
                  {canPost && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNotice(n)
                          setEditKind(n.kind)
                          setEditTitle(n.title)
                          setEditSummary(n.summary)
                          setEditFileName(n.fileName)
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 hover:text-brand-900 transition active:scale-95 cursor-pointer"
                        title="Edit announcement"
                      >
                        <Pencil className="size-3.5 text-ink-500" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingNotice(n)}
                        className="inline-flex items-center gap-1 rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-semibold text-danger-700 shadow-2xs hover:bg-danger-50 hover:border-danger-300 transition active:scale-95 cursor-pointer"
                        title="Delete announcement"
                      >
                        <Trash2 className="size-3.5 text-danger-600" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Publish Dialog */}
      <Dialog
        open={isPostOpen}
        onClose={() => setIsPostOpen(false)}
        size="lg"
        title="Publish Notice or Minutes"
        description="Share official college notices or approved meeting minutes. All active faculty members will receive an automated email alert."
        busy={isPosting}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsPostOpen(false)} disabled={isPosting}>
              Cancel
            </Button>
            <Button onClick={handlePost} loading={isPosting} icon={Send}>
              Publish Announcement
            </Button>
          </>
        }
      >
        <form className="space-y-5" onSubmit={handlePost}>
          <Field label="Category" required>
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="notice">Official College Notice</option>
              <option value="minutes">Approved Minutes of Meeting</option>
            </Select>
          </Field>

          <Field label="Announcement Title" required>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Faculty Meeting on Midterm Submissions..."
            />
          </Field>

          <Field label="Summary / Agenda Details" optional>
            <Textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Provide a brief summary of the agenda or key decisions..."
            />
          </Field>

          <Field label="Attachment File Name" optional hint="Simulation: specify file name for the attachment.">
            <Input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. Notice_FacultyMeeting_Oct23.pdf"
            />
          </Field>
        </form>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingNotice}
        onClose={() => setEditingNotice(null)}
        size="lg"
        title={editKind === 'notice' ? 'Edit College Notice' : 'Edit Minutes of Meeting'}
        description="Update the announcement details, summary, or attachment file name."
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
        <form className="space-y-5" onSubmit={handleUpdate}>
          <Field label="Category" required>
            <Select
              value={editKind}
              onChange={(e) => setEditKind(e.target.value as typeof editKind)}
            >
              <option value="notice">Official College Notice</option>
              <option value="minutes">Approved Minutes of Meeting</option>
            </Select>
          </Field>

          <Field label="Announcement Title" required>
            <Input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="e.g. Faculty Meeting on Midterm Submissions..."
            />
          </Field>

          <Field label="Summary / Agenda Details" optional>
            <Textarea
              rows={3}
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              placeholder="Provide a brief summary of the agenda or key decisions..."
            />
          </Field>

          <Field label="Attachment File Name" optional hint="Simulation: specify file name for the attachment.">
            <Input
              type="text"
              value={editFileName}
              onChange={(e) => setEditFileName(e.target.value)}
              placeholder="e.g. Notice_FacultyMeeting_Oct23.pdf"
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
            ? `Are you sure you want to delete "${deletingNotice.title}"? This will permanently remove it from the college announcements board.`
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
          This action cannot be undone. If this was a test announcement or posted by mistake, it is safe to delete.
        </p>
      </Dialog>
    </div>
  )
}
