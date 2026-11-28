import { BarChart3, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { useUser } from '../../app/session'
import { Field, Select } from '../../components/form'
import { Badge, Card, EmptyState } from '../../components/ui'
import { FEEDBACK_RATINGS, FEEDBACK_RATING_LABELS, FEEDBACK_SERVICES, visibleServiceFeedback } from '../../data/serviceFeedback'
import { useDb } from '../../data/store'
import { formatDateTime } from '../../lib/time'

export function FeedbackResultsPage() {
  const user = useUser()
  const db = useDb()
  const [service, setService] = useState('')
  const [unit, setUnit] = useState('')
  const [rating, setRating] = useState('')
  const allowed = visibleServiceFeedback(db, user)
  const results = allowed.filter((item) => (!service || item.service === service) && (!unit || item.origin === unit) && (!rating || String(item.rating) === rating))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  const average = results.length ? (results.reduce((total, item) => total + item.rating, 0) / results.length).toFixed(1) : '—'

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4 rounded-2xl border border-brand-200/70 bg-brand-50 p-4 sm:items-center sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><BarChart3 className="size-5" aria-hidden /></span>
        <div className="min-w-0"><h1 className="text-xl font-extrabold text-brand-900 sm:text-2xl">Service Feedback Results</h1><p className="mt-1 text-sm text-ink-600">Review ratings and comments for {user.role === 'secretary' ? 'CESS and IDS services.' : user.role === 'dean' ? 'CESS services.' : 'IDS services.'}</p></div>
      </header>
      <Card className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        <Field label="Service"><Select value={service} onChange={(e) => setService(e.target.value)}><option value="">All services</option>{FEEDBACK_SERVICES.map((option) => <option key={option}>{option}</option>)}</Select></Field>
        <Field label="Rating"><Select value={rating} onChange={(e) => setRating(e.target.value)}><option value="">All ratings</option>{FEEDBACK_RATINGS.map((value) => <option key={value} value={value}>{value} · {FEEDBACK_RATING_LABELS[value]}</option>)}</Select></Field>
        {user.role === 'secretary' && <Field label="Unit"><Select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">All units</option><option>CESS</option><option>IDS</option></Select></Field>}
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4 sm:p-5"><dl><dt className="text-sm font-semibold text-ink-700">Evaluations</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-brand-900" role="status">{results.length}</dd></dl></Card>
        <Card className="p-4 sm:p-5"><dl><dt className="text-sm font-semibold text-ink-700">Average satisfaction</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-brand-900">{average}{results.length > 0 && <span className="ml-1 text-sm font-medium text-ink-600">out of 5</span>}</dd></dl></Card>
      </div>
      <Card>
        <h2 className="border-b border-ink-100 px-4 py-4 text-base font-bold sm:px-5">Submitted evaluations</h2>
        {results.length ? <ul className="divide-y divide-ink-100" aria-label="Submitted evaluations">
          {results.map((entry) => <li key={entry.id} className="space-y-2 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1"><h3 className="text-sm font-bold">{entry.service}</h3><p className="text-xs text-ink-600">{entry.origin} · <time dateTime={entry.submittedAt}>{formatDateTime(entry.submittedAt)}</time></p></div>
              <Badge tone={entry.rating > 3 ? 'success' : entry.rating < 3 ? 'warning' : 'neutral'} dot={false}>{entry.rating} · {FEEDBACK_RATING_LABELS[entry.rating]}</Badge>
            </div>
            {entry.comments ? <p className="whitespace-pre-wrap wrap-anywhere text-sm text-ink-800">{entry.comments}</p> : <p className="text-sm text-ink-600">No comments provided.</p>}
          </li>)}
        </ul> : <EmptyState icon={MessageSquare} title={allowed.length ? 'No matching evaluations' : 'No evaluations submitted'}>{allowed.length ? 'Choose another service, rating, or unit.' : 'Evaluations for your unit will appear here.'}</EmptyState>}
      </Card>
    </div>
  )
}
