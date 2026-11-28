import { CheckCircle2, ClipboardCheck, MessageSquare, Send } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Field, Select, Textarea } from '../../components/form'
import { Button, ButtonLink, Card, EmptyState, cn } from '../../components/ui'
import { controlNumber } from '../../content/language'
import {
  FEEDBACK_COMMENT_LIMIT, FEEDBACK_RATING_LABELS, FEEDBACK_RATINGS, FEEDBACK_SERVICES,
  feedbackErrors, feedbackForDocument, type FeedbackInput, type FeedbackService,
} from '../../data/serviceFeedback'
import { api, useDb } from '../../data/store'
import { formatDateTime } from '../../lib/time'

export function ServiceFeedbackPage() {
  const [params] = useSearchParams()
  const documentId = params.get('document') || undefined
  return <FeedbackForm key={documentId ?? 'general-feedback'} documentId={documentId} />
}

function FeedbackForm({ documentId }: { documentId?: string }) {
  const user = useUser()
  const db = useDb()
  const form = useRef<HTMLFormElement>(null)
  const status = useRef<HTMLHeadingElement>(null)
  const ratingErrorId = useId()
  const [input, setInput] = useState<FeedbackInput>({ documentId, service: documentId ? 'Document requests' : '', rating: null, comments: '' })
  const [submittedAt, setSubmittedAt] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const doc = documentId ? db.documents.find((item) => item.id === documentId && item.requesterId === user.id && item.status === 'released') : undefined
  const previous = doc && feedbackForDocument(db, user.id, doc.id)
  const completedAt = submittedAt || previous?.submittedAt
  const errors = attempted ? feedbackErrors(input) : {}

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setAttempted(true)
    setSaveError('')
    if (Object.keys(feedbackErrors(input)).length > 0) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSaving(true)
    try {
      const saved = await api.submitServiceFeedback(user, input)
      setSubmittedAt(saved.submittedAt)
      requestAnimationFrame(() => status.current?.focus())
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not submit your evaluation. Try again.')
    } finally { setSaving(false) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-start gap-4 rounded-2xl border border-brand-200/70 bg-brand-50 p-4 sm:items-center sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><MessageSquare className="size-5" aria-hidden /></span>
        <div className="min-w-0"><h1 className="text-xl font-extrabold text-brand-900 sm:text-2xl">Service Feedback and Evaluation</h1><p className="mt-1 text-sm text-ink-600">Tell the college about a service you used.</p></div>
      </header>
      {documentId && !doc ? <Card><EmptyState icon={ClipboardCheck} title="Document evaluation unavailable" action={<ButtonLink to="/app/service-feedback" variant="secondary">Open service feedback</ButtonLink>}>You can evaluate your own released document requests.</EmptyState></Card> : completedAt ? (
        <Card className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
            <div><h2 ref={status} tabIndex={-1} className="text-lg font-bold">{submittedAt ? 'Evaluation submitted' : 'This request has been evaluated'}</h2><p className="mt-1 text-sm text-ink-600">Received <time dateTime={completedAt}>{formatDateTime(completedAt)}</time>.</p></div>
          </div>
          {doc ? <ButtonLink to={`/app/documents/${doc.id}`} variant="secondary">Back to document</ButtonLink> : <Button variant="secondary" onClick={() => {
            setInput({ service: '', rating: null, comments: '' }); setAttempted(false); setSubmittedAt('')
            requestAnimationFrame(() => form.current?.querySelector('select')?.focus())
          }}>Submit another evaluation</Button>}
        </Card>
      ) : (
        <Card className="p-4 sm:p-6">
          <form ref={form} onSubmit={submit} noValidate className="space-y-5">
            {doc ? <div className="rounded-lg bg-ink-50 p-3 text-sm"><p className="font-bold">Document requests</p><p className="mt-1 wrap-anywhere text-ink-700">{doc.title} · {controlNumber(doc)}</p></div> : (
              <Field label="Service used" required error={errors.service}>
                <Select required value={input.service} disabled={saving} onChange={(e) => setInput({ ...input, service: e.target.value as FeedbackService | '' })}>
                  <option value="">Choose a service</option>{FEEDBACK_SERVICES.map((service) => <option key={service}>{service}</option>)}
                </Select>
              </Field>
            )}
            <fieldset disabled={saving} className="min-w-0 space-y-2" aria-describedby={errors.rating ? ratingErrorId : undefined}>
              <legend className="mb-2 w-full text-sm font-semibold text-ink-800"><span>Overall satisfaction</span><span className="float-right text-xs text-brand-700">Required</span></legend>
              <div className="grid gap-2 sm:grid-cols-5">
                {FEEDBACK_RATINGS.map((rating) => (
                  <label key={rating} className={cn('flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-ink-200 p-2.5 text-sm focus-within:ring-2 focus-within:ring-brand-500 sm:flex-col', input.rating === rating && 'border-brand-500 bg-brand-50')}>
                    <input type="radio" name="satisfaction" value={rating} required checked={input.rating === rating} aria-invalid={!!errors.rating} aria-describedby={errors.rating ? ratingErrorId : undefined} className="mt-0.5 size-4 shrink-0 accent-brand-600" onChange={() => setInput({ ...input, rating })} />
                    <span className="min-w-0 text-ink-800"><strong className="mr-1.5">{rating}</strong>{FEEDBACK_RATING_LABELS[rating]}</span>
                  </label>
                ))}
              </div>
              {errors.rating && <p id={ratingErrorId} role="alert" className="text-sm font-medium text-danger-700">{errors.rating}</p>}
            </fieldset>
            <Field label="Comments or suggestions" optional error={errors.comments}><Textarea rows={5} maxLength={FEEDBACK_COMMENT_LIMIT} value={input.comments} disabled={saving} onChange={(e) => setInput({ ...input, comments: e.target.value })} placeholder="What worked well? What could improve?" /></Field>
            <p className="text-xs text-ink-600">Authorized college personnel can review your evaluation.</p>
            {saveError && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800">{saveError}</p>}
            <Button type="submit" icon={Send} loading={saving} loadingText="Submitting evaluation…" className="w-full sm:w-auto">Submit evaluation</Button>
          </form>
        </Card>
      )}
    </div>
  )
}
