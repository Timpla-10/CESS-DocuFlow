import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock, MessageCircle, MessagesSquare, Plus, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Field, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, ButtonLink, Card, EmptyState, cn } from '../../components/ui'
import { formatRoleTitle, type Tone } from '../../content/language'
import {
  CONSULTATION_STATUS_LABELS,
  CONSULTATION_TEXT_LIMIT,
  canReceiveConsultations,
  consultationTextError,
  visibleConsultations,
} from '../../data/consultations'
import { api, useDb } from '../../data/store'
import type { Consultation, ConsultationStatus, User } from '../../data/types'
import { formatDate, formatDateTime } from '../../lib/time'

const CONSULTATIONS_PATH = '/app/consultations'
const statuses = [
  { id: 'pending', tone: 'warning', icon: Clock },
  { id: 'responded', tone: 'brand', icon: MessageCircle },
  { id: 'completed', tone: 'success', icon: CheckCircle2 },
] as const satisfies ReadonlyArray<{ id: ConsultationStatus; tone: Tone; icon: typeof Clock }>

function ConsultationBadge({ status }: { status: ConsultationStatus }) {
  return <Badge tone={statuses.find((item) => item.id === status)?.tone}>{CONSULTATION_STATUS_LABELS[status]}</Badge>
}

function SaveError({ children }: { children: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-800 ring-1 ring-danger-100">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

export function ConsultationsPage() {
  const user = useUser()
  const db = useDb()
  const { requestId } = useParams()
  const [filter, setFilter] = useState<ConsultationStatus | 'all'>('all')
  const pageTitle = useRef<HTMLHeadingElement>(null)
  const isStudent = user.role === 'student'
  const isNew = requestId === 'new' && isStudent && user.active
  const requests = visibleConsultations(db, user).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const selected = requests.find((request) => request.id === requestId)
  const filtered = requests.filter((request) => filter === 'all' || request.status === filter)
  const recipients = db.users.filter(canReceiveConsultations).sort((a, b) => a.name.localeCompare(b.name))

  useEffect(() => {
    pageTitle.current?.focus()
  }, [requestId])

  const counterpart = (request: Consultation) => db.users.find((person) =>
    person.id === (isStudent ? request.assigneeId : request.studentId),
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-brand-200/70 bg-brand-50 px-4 py-5 sm:px-7 sm:py-6">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white sm:size-13">
            <MessagesSquare className="size-5 sm:size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 ref={requestId ? undefined : pageTitle} tabIndex={requestId ? undefined : -1} className="scroll-mt-20 text-xl font-extrabold text-brand-900 sm:text-2xl">Consultations</h1>
            <p className="mt-1 text-sm text-ink-600">
              {isStudent ? 'Request a consultation and follow replies from faculty or college personnel.' : 'Review student requests assigned to you and send updates.'}
            </p>
          </div>
        </div>
        {isStudent && user.active && !isNew && (
          <ButtonLink to={`${CONSULTATIONS_PATH}/new`} icon={Plus} className="w-full sm:w-auto">New consultation</ButtonLink>
        )}
      </header>

      <dl className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-3 sm:gap-4" aria-label="Consultation totals">
        {statuses.map(({ id, icon: Icon }) => (
          <Card key={id} className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4 sm:py-3.5">
            <dt className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-ink-700 sm:text-sm">
              <Icon className="hidden size-4 shrink-0 text-brand-600 sm:block" aria-hidden />
              <span className="wrap-anywhere">{CONSULTATION_STATUS_LABELS[id]}</span>
            </dt>
            <dd className="text-lg font-bold tabular-nums text-ink-950">{requests.filter((request) => request.status === id).length}</dd>
          </Card>
        ))}
      </dl>

      <div className={cn('grid items-start gap-5', (requestId || requests.length > 0) && 'lg:grid-cols-[minmax(17rem,1fr)_minmax(0,1.7fr)]')}>
        <Card className={cn('min-w-0', !!requestId && 'hidden lg:block')}>
          <section aria-labelledby="consultation-list-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-4 sm:px-5">
              <h2 id="consultation-list-title" className="text-base font-bold">{isStudent ? 'My requests' : 'Assigned requests'}</h2>
              {requests.length > 0 && (
                <Select aria-label="Filter by consultation status" className="w-auto max-w-full" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                  <option value="all">All statuses</option>
                  {statuses.map(({ id }) => <option key={id} value={id}>{CONSULTATION_STATUS_LABELS[id]}</option>)}
                </Select>
              )}
            </div>
            {filtered.length === 0 ? (
              <EmptyState icon={MessagesSquare} title={requests.length ? 'No matching requests' : 'No consultation requests'}>
                {requests.length ? 'Choose another status to see more requests.' : isStudent ? 'Your submitted requests and replies will appear here.' : 'New requests assigned to you will appear here.'}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-ink-100 p-1.5" aria-label="Consultation requests">
                {filtered.map((request) => (
                  <li key={request.id}>
                    <Link
                      to={`${CONSULTATIONS_PATH}/${request.id}`}
                      aria-current={request.id === selected?.id ? 'page' : undefined}
                      className={cn('flex min-w-0 items-center gap-3 rounded-lg p-3 hover:bg-brand-50', request.id === selected?.id && 'bg-brand-50 ring-1 ring-inset ring-brand-200')}
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="line-clamp-2 wrap-anywhere text-sm font-semibold text-ink-950">{request.purpose}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-600">
                          <span className="wrap-anywhere">{counterpart(request)?.name ?? 'Unavailable account'}</span>
                          <time dateTime={request.updatedAt}>{formatDate(request.updatedAt)}</time>
                        </div>
                        <ConsultationBadge status={request.status} />
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-brand-600" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>

        {requestId && (
          <section aria-labelledby="consultation-detail-title" className="min-w-0 space-y-4">
            <Link to={CONSULTATIONS_PATH} className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-brand-700 hover:underline">
              <ArrowLeft className="size-4" aria-hidden /> Back to consultations
            </Link>
            <Card className="min-w-0 p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 id="consultation-detail-title" ref={pageTitle} tabIndex={-1} className="scroll-mt-20 text-lg font-bold">
                  {isNew ? 'Request a consultation' : selected ? 'Consultation request' : 'Consultation unavailable'}
                </h2>
                {selected && <ConsultationBadge status={selected.status} />}
              </div>
              {isNew ? <NewConsultationForm user={user} recipients={recipients} /> : selected ? (
                <ConsultationDetails key={selected.id} user={user} request={selected} counterpart={counterpart(selected)} />
              ) : <p className="mt-2 text-sm text-ink-600">This request could not be found for your account.</p>}
            </Card>
          </section>
        )}
        {!requestId && requests.length > 0 && (
          <Card className="hidden lg:block">
            <EmptyState icon={MessageCircle} title="Choose a consultation">Select a request to see its purpose and updates.</EmptyState>
          </Card>
        )}
      </div>
    </div>
  )
}

function NewConsultationForm({ user, recipients }: { user: User; recipients: User[] }) {
  const navigate = useNavigate()
  const toast = useToast()
  const recipientInput = useRef<HTMLSelectElement>(null)
  const purposeInput = useRef<HTMLTextAreaElement>(null)
  const [assigneeId, setAssigneeId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const assigneeError = recipients.some((recipient) => recipient.id === assigneeId) ? undefined : 'Choose a recipient for your consultation.'
  const purposeError = consultationTextError(purpose, 'Describe the purpose of your consultation.')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    setSaveError('')
    if (assigneeError || purposeError) {
      if (assigneeError) recipientInput.current?.focus()
      else purposeInput.current?.focus()
      return
    }
    setBusy(true)
    try {
      const request = await api.submitConsultation(user, { assigneeId, purpose })
      toast.success('Consultation requested', 'You can follow its status and replies here.')
      navigate(`${CONSULTATIONS_PATH}/${request.id}`, { replace: true })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not submit your consultation. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (recipients.length === 0) {
    return <div className="mt-4"><SaveError>No faculty or personnel are available for consultations right now.</SaveError></div>
  }

  return (
    <form noValidate onSubmit={submit} className="mt-4 space-y-4">
      <Field label="Faculty or personnel" required error={attempted ? assigneeError : undefined}>
        <Select required ref={recipientInput} value={assigneeId} disabled={busy} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">Select a recipient</option>
          {recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} ({formatRoleTitle(recipient)})</option>)}
        </Select>
      </Field>
      <Field label="Purpose of consultation" required error={attempted ? purposeError : undefined}>
        <Textarea required ref={purposeInput} rows={5} maxLength={CONSULTATION_TEXT_LIMIT} disabled={busy} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Describe what you would like to discuss." />
      </Field>
      {saveError && <SaveError>{saveError}</SaveError>}
      <Button type="submit" icon={Send} loading={busy} loadingText="Submitting consultation…" className="w-full sm:w-auto">Submit consultation</Button>
    </form>
  )
}

function ConsultationDetails({ user, request, counterpart }: { user: User; request: Consultation; counterpart?: User }) {
  const isStudent = user.role === 'student'
  return (
    <div className="mt-4 space-y-6">
      <dl className="grid gap-3 rounded-xl bg-ink-50 px-4 py-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-ink-600">{isStudent ? 'Assigned to' : 'Requested by'}</dt>
          <dd className="mt-1 wrap-anywhere font-semibold text-ink-900">{counterpart?.name ?? 'Unavailable account'}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-600">Submitted</dt>
          <dd className="mt-1 font-semibold text-ink-900"><time dateTime={request.submittedAt}>{formatDateTime(request.submittedAt)}</time></dd>
        </div>
      </dl>
      <div>
        <h3 className="text-sm font-bold">Purpose of consultation</h3>
        <p className="mt-1.5 whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed text-ink-700">{request.purpose}</p>
      </div>
      <div className="border-t border-ink-100 pt-5">
        <h3 className="text-sm font-bold">Updates</h3>
        {request.updates.length ? (
          <ol className="mt-3 space-y-3 border-l-2 border-brand-100 pl-3">
            {request.updates.map((update) => (
              <li key={update.id} className="rounded-lg bg-brand-50 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ConsultationBadge status={update.status} />
                  <time dateTime={update.at} className="text-xs text-ink-600">{formatDateTime(update.at)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed text-ink-800">{update.message}</p>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-sm text-ink-600">No replies yet.</p>}
      </div>
      {!isStudent && request.status !== 'completed' && <ResponseForm user={user} requestId={request.id} />}
    </div>
  )
}

function ResponseForm({ user, requestId }: { user: User; requestId: string }) {
  const toast = useToast()
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'responded' | 'completed'>('responded')
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const messageError = consultationTextError(message, 'Enter a response for the student.')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    setSaveError('')
    if (messageError) {
      messageInput.current?.focus()
      return
    }
    setBusy(true)
    try {
      await api.respondToConsultation(user, requestId, { message, status })
      setMessage('')
      setAttempted(false)
      toast.success(status === 'completed' ? 'Consultation completed' : 'Response sent', 'The student can see the update in their request.')
      if (status === 'completed') document.getElementById('consultation-detail-title')?.focus()
      else requestAnimationFrame(() => messageInput.current?.focus())
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save your response. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4 rounded-xl border border-brand-200 p-3 sm:p-4" aria-label="Respond to consultation">
      <h3 className="text-sm font-bold">Respond to the student</h3>
      <Field label="Response" required error={attempted ? messageError : undefined}>
        <Textarea required ref={messageInput} rows={4} maxLength={CONSULTATION_TEXT_LIMIT} disabled={busy} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Include any next steps or meeting details." />
      </Field>
      <Field label="Status after sending">
        <Select value={status} disabled={busy} onChange={(event) => setStatus(event.target.value === 'completed' ? 'completed' : 'responded')}>
          <option value="responded">Responded</option>
          <option value="completed">Completed</option>
        </Select>
      </Field>
      {status === 'completed' && <p className="text-sm text-ink-600">Completing the request closes it to further updates.</p>}
      {saveError && <SaveError>{saveError}</SaveError>}
      <Button type="submit" icon={Send} loading={busy} loadingText="Sending response…" className="w-full sm:w-auto">Send response</Button>
    </form>
  )
}
