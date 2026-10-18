import { Compass, Lock } from 'lucide-react'
import { homeFor } from '../app/nav'
import { useSession } from '../app/session'
import { ButtonLink, Card } from '../components/ui'

export function AccessDeniedPage() {
  const { user } = useSession()
  return (
    <Card className="mx-auto mt-10 max-w-lg animate-fade-up p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Lock className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-extrabold text-brand-900">This page isn’t available for your account</h1>
      <p className="mt-2 leading-relaxed text-ink-600">
        Your account doesn’t have access to this page. If you think you should be able to see it, please contact the College Secretary.
      </p>
      <ButtonLink to={user ? homeFor(user.role) : '/'} className="mt-6">
        Go to My Home Page
      </ButtonLink>
    </Card>
  )
}

export function NotFoundPage({ inApp }: { inApp?: boolean }) {
  const { user } = useSession()
  const body = (
    <Card className="mx-auto max-w-lg animate-fade-up p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Compass className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-extrabold text-brand-900">We couldn’t find that page</h1>
      <p className="mt-2 leading-relaxed text-ink-600">The link may be incorrect, or the page may have moved.</p>
      <ButtonLink to={user ? homeFor(user.role) : '/'} className="mt-6">
        {user ? 'Go to My Home Page' : 'Go to the Homepage'}
      </ButtonLink>
    </Card>
  )
  return inApp ? <div className="mt-10">{body}</div> : <div className="grid min-h-dvh place-items-center bg-canvas p-6">{body}</div>
}
