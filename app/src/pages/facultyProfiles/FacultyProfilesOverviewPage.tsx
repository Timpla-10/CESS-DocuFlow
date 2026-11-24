import { ArrowLeft, ArrowRight, FileText, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Field, Input, Select } from '../../components/form'
import { Avatar, Badge, Button, Card, EmptyState, Spinner, cn } from '../../components/ui'
import { FriendlyError } from '../../content/language'
import { canReviewAcademicUnit } from '../../data/academicScopes'
import { CREDENTIAL_CATEGORIES, listFacultyProfiles, type Credential, type FacultyProfileSummary, type ProfileEntry } from '../../data/facultyProfiles'
import { formatDateTime } from '../../lib/time'
import { CredentialPreview } from './CredentialPreview'

const OVERVIEW = '/app/faculty-profiles'

export function FacultyProfilesOverviewPage() {
  const user = useUser()
  const { ownerId } = useParams()
  const [profiles, setProfiles] = useState<FacultyProfileSummary[] | null>(null)
  const [failure, setFailure] = useState('')
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [unit, setUnit] = useState('')
  const [department, setDepartment] = useState('')
  const [category, setCategory] = useState('')
  const [preview, setPreview] = useState<{ ownerId: string; credential: Credential } | null>(null)
  const detailTitle = useRef<HTMLHeadingElement>(null)
  const overviewTitle = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let mounted = true
    listFacultyProfiles(user).then(
      (data) => { if (mounted) setProfiles(data) },
      (error) => { if (mounted) setFailure(error instanceof FriendlyError ? error.message : 'Could not load faculty profiles.') },
    )
    return () => { mounted = false }
  }, [user, retry])

  const loaded = profiles !== null
  useEffect(() => {
    if (loaded) (ownerId ? detailTitle : overviewTitle).current?.focus()
  }, [ownerId, loaded])

  const accessibleProfiles = (profiles ?? []).filter((profile) => canReviewAcademicUnit(user, profile.origin))
  const scoped = accessibleProfiles.filter((profile) => !unit || profile.origin === unit)
  const departments = [...new Set(scoped.map((profile) => profile.department).filter(Boolean))].sort()
  const selected = accessibleProfiles.find((profile) => profile.ownerId === ownerId)
  const query = search.trim().toLowerCase()
  const visible = scoped.filter((profile) => {
    if (department && profile.department !== department) return false
    if (category && !profile.credentials.some((credential) => credential.category === category)) return false
    return [profile.name, profile.title, profile.email, profile.department, profile.specialties,
      ...profile.education.flatMap((entry) => [entry.title, entry.institution]),
      ...profile.accomplishments.flatMap((entry) => [entry.title, entry.institution]),
      ...profile.credentials.flatMap((credential) => [credential.title, credential.category, credential.fileName])]
      .some((value) => value.toLowerCase().includes(query))
  })

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4 rounded-2xl border border-brand-200/70 bg-brand-50 p-4 sm:items-center sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><UsersRound className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <h1 ref={overviewTitle} tabIndex={-1} className="scroll-mt-20 text-xl font-extrabold text-brand-900 sm:text-2xl">Faculty Profile Overview</h1>
          <p className="mt-1 text-sm text-ink-600">{user.role === 'secretary' ? 'Browse faculty profiles and credentials for CESS and IDS.' : user.role === 'dean' ? 'Browse CESS faculty profiles and credentials.' : 'Browse IDS faculty profiles and credentials.'}</p>
        </div>
      </header>

      {failure ? <Card className="space-y-3 p-4"><p role="alert" className="text-sm text-danger-800">{failure}</p><Button variant="secondary" onClick={() => { setFailure(''); setRetry((value) => value + 1) }}>Try again</Button></Card> : !profiles ? (
        <Spinner label="Loading faculty profiles…" />
      ) : (
        <>
          <div className={cn('grid items-start gap-5', !!ownerId && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]')}>
            <Card className={cn('min-w-0', !!ownerId && 'hidden xl:block')}>
              <div className="grid gap-3 border-b border-ink-100 p-4 sm:grid-cols-2 sm:p-5">
                <Field label="Search faculty profiles" className="sm:col-span-2"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, expertise, degree, or credential" /></Field>
                {user.role === 'secretary' && <Field label="Unit"><Select value={unit} onChange={(event) => { setUnit(event.target.value); setDepartment('') }}><option value="">All units</option><option>CESS</option><option>IDS</option></Select></Field>}
                <Field label="Department"><Select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</Select></Field>
                <Field label="Credential category"><Select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All credential categories</option>{CREDENTIAL_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
              </div>
              {visible.length ? <>
                <p role="status" className="px-4 pt-3 text-sm text-ink-600 sm:px-5">{visible.length} {visible.length === 1 ? 'profile' : 'profiles'}</p>
                <ul className="divide-y divide-ink-100 px-2 py-2" aria-label="Faculty profiles">
                  {visible.map((profile) => <li key={profile.ownerId}>
                    <Link to={`${OVERVIEW}/${profile.ownerId}`} aria-current={profile.ownerId === ownerId ? 'page' : undefined} className={cn('flex min-w-0 items-start gap-3 rounded-lg p-3 hover:bg-brand-50', profile.ownerId === ownerId && 'bg-brand-50')}>
                      <Avatar name={profile.name} className="shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h2 className="wrap-anywhere text-sm font-bold">{profile.name}</h2>
                        <p className="wrap-anywhere text-sm text-ink-700">{profile.title}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600"><Badge tone="brand" dot={false}>{profile.origin}</Badge><span className="wrap-anywhere">{profile.department}</span><span>{profile.credentials.length} {profile.credentials.length === 1 ? 'credential' : 'credentials'}</span></div>
                      </div>
                      <ArrowRight className="mt-2 size-4 shrink-0 text-brand-600" aria-hidden />
                    </Link>
                  </li>)}
                </ul>
              </> : <EmptyState icon={UsersRound} title={accessibleProfiles.length ? 'No matching faculty profiles' : 'No faculty profiles available'}>{accessibleProfiles.length ? 'Try a different search or filter.' : 'Saved profiles in your unit will appear here.'}</EmptyState>}
            </Card>
            {ownerId && <div className="min-w-0 space-y-3">
              <Link to={OVERVIEW} className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4" aria-hidden />Back to faculty profiles</Link>
              <Card className="space-y-5 p-4 sm:p-6">
                <div>
                  <h2 ref={detailTitle} tabIndex={-1} className="scroll-mt-20 wrap-anywhere text-xl font-bold">{selected?.name ?? 'Faculty profile unavailable'}</h2>
                  {selected ? <p className="mt-1 wrap-anywhere text-sm text-ink-600">{selected.title} · {selected.department} · {selected.origin}</p> : <p className="mt-1 text-sm text-ink-600">This profile could not be found for your account.</p>}
                </div>
                {selected && <>
                  <dl className="grid gap-3 rounded-lg bg-ink-50 p-3 text-sm sm:grid-cols-2">
                    <div><dt className="font-semibold">Contact email</dt><dd className="wrap-anywhere text-ink-700">{selected.email || 'None provided'}</dd></div>
                    <div><dt className="font-semibold">Areas of expertise</dt><dd className="wrap-anywhere text-ink-700">{selected.specialties || 'None provided'}</dd></div>
                    {selected.biography && <div className="sm:col-span-2"><dt className="font-semibold">Professional biography</dt><dd className="whitespace-pre-wrap wrap-anywhere text-ink-700">{selected.biography}</dd></div>}
                  </dl>
                  <ProfileEntries title="Educational background" entries={selected.education} />
                  <ProfileEntries title="Accomplishments" entries={selected.accomplishments} />
                  <section className="space-y-2 border-t border-ink-100 pt-4">
                    <h3 className="text-sm font-bold">Credentials</h3>
                    {selected.credentials.length ? <ul className="divide-y divide-ink-100">
                      {selected.credentials.map((credential) => <li key={credential.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0"><p className="wrap-anywhere text-sm font-semibold">{credential.title}</p><p className="wrap-anywhere text-xs text-ink-600">{credential.category} · {credential.fileName}</p></div>
                        <Button icon={FileText} size="sm" variant="secondary" aria-label={`View ${credential.title}`} onClick={() => setPreview({ ownerId: selected.ownerId, credential })}>View credential</Button>
                      </li>)}
                    </ul> : <p className="text-sm text-ink-600">No credentials added.</p>}
                  </section>
                  <p className="text-xs text-ink-600">Updated <time dateTime={selected.updatedAt}>{formatDateTime(selected.updatedAt)}</time></p>
                </>}
              </Card>
            </div>}
          </div>
          {preview && selected?.ownerId === preview.ownerId && <CredentialPreview key={preview.credential.id} user={user} ownerId={preview.ownerId} credential={preview.credential} onClose={() => setPreview(null)} />}
        </>
      )}
    </div>
  )
}

function ProfileEntries({ title, entries }: { title: string; entries: ProfileEntry[] }) {
  return (
    <section className="space-y-2 border-t border-ink-100 pt-4">
      <h3 className="text-sm font-bold">{title}</h3>
      {entries.length ? <ul className="space-y-2.5">
        {entries.map((entry) => <li key={entry.id} className="wrap-anywhere text-sm"><p className="font-semibold">{entry.title}</p>{(entry.institution || entry.year) && <p className="text-xs text-ink-600">{[entry.institution, entry.year].filter(Boolean).join(' · ')}</p>}</li>)}
      </ul> : <p className="text-sm text-ink-600">No entries added.</p>}
    </section>
  )
}
