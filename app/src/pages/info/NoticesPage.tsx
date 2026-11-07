import {
  FileText,
  Megaphone,
  Plus,
  Send,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { api, useDb } from '../../data/store'
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

                <div className="text-right">
                  <span className="text-xs text-ink-500" title={formatDateTime(n.postedAt)}>
                    {timeAgo(n.postedAt)}
                  </span>
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
        <form className="space-y-5">
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
    </div>
  )
}
