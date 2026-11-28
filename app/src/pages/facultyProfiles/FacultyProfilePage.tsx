import { Award, BookOpen, FileText, Plus, Save, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, Spinner } from '../../components/ui'
import { FriendlyError } from '../../content/language'
import {
  CREDENTIAL_CATEGORIES, CREDENTIAL_FILE_LIMIT_MB, PROFILE_ENTRY_LIMIT, credentialFileError,
  facultyProfileErrors, loadFacultyProfile, newProfile, saveFacultyProfile,
  type Credential, type CredentialCategory, type FacultyProfile, type PendingCredential, type ProfileEntry,
} from '../../data/facultyProfiles'
import type { User } from '../../data/types'
import { formatDateTime } from '../../lib/time'
import { CredentialPreview } from './CredentialPreview'

export function FacultyProfilePage() {
  const user = useUser()
  return <FacultyProfileWorkspace key={user.id} user={user} />
}

function FacultyProfileWorkspace({ user }: { user: User }) {
  const [profile, setProfile] = useState<FacultyProfile | null>(null)
  const [failure, setFailure] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let mounted = true
    loadFacultyProfile(user).then(
      (saved) => { if (mounted) setProfile(saved ?? newProfile(user)) },
      (error) => { if (mounted) setFailure(error instanceof FriendlyError ? error.message : 'Could not load your profile.') },
    )
    return () => { mounted = false }
  }, [user, retry])

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4 rounded-2xl border border-brand-200/70 bg-brand-50 p-4 sm:items-center sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><UserRound className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-brand-900 sm:text-2xl">My Faculty Profile</h1>
          <p className="mt-1 text-sm text-ink-600">Maintain the details and credentials available to authorized college personnel.</p>
        </div>
      </header>
      {failure ? <Card className="space-y-3 p-4"><p role="alert" className="text-sm text-danger-800">{failure}</p><Button variant="secondary" onClick={() => { setFailure(''); setRetry((value) => value + 1) }}>Try again</Button></Card> :
        !profile ? <Spinner label="Loading your faculty profile…" /> : <ProfileEditor initial={profile} user={user} />}
    </div>
  )
}

function ProfileEditor({ initial, user }: { initial: FacultyProfile; user: User }) {
  const toast = useToast()
  const [draft, setDraft] = useState(initial)
  const [uploads, setUploads] = useState<PendingCredential[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [preview, setPreview] = useState<Credential | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedAt, setSavedAt] = useState(initial.updatedAt)
  const form = useRef<HTMLFormElement>(null)
  const errors = attempted ? facultyProfileErrors(draft) : {}
  const credentialCount = draft.credentials.length + uploads.length

  function setField<K extends keyof FacultyProfile>(field: K, value: FacultyProfile[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    setSaveError('')
    if (Object.keys(facultyProfileErrors(draft)).length > 0) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    try {
      const updated = await saveFacultyProfile(user, { ...draft, keep: draft.credentials.map((item) => item.id), uploads })
      setDraft(updated)
      setSavedAt(updated.updatedAt)
      setUploads([])
      setAttempted(false)
      toast.success('Faculty profile saved')
    } catch (error) {
      setSaveError(error instanceof FriendlyError ? error.message : 'Could not save your profile. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <form ref={form} onSubmit={save} noValidate className="space-y-5">
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          <Card className="space-y-4 p-4 sm:p-6">
            <h2 className="text-base font-bold">Personal and professional details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required error={errors.name}><Input required value={draft.name} maxLength={100} onChange={(e) => setField('name', e.target.value)} /></Field>
              <Field label="Professional title" required error={errors.title}><Input required value={draft.title} maxLength={120} onChange={(e) => setField('title', e.target.value)} /></Field>
              <Field label="Profile contact email" optional error={errors.email}><Input type="email" value={draft.email} maxLength={160} onChange={(e) => setField('email', e.target.value)} /></Field>
              <Field label="Areas of expertise" optional error={errors.specialties}><Input value={draft.specialties} maxLength={240} onChange={(e) => setField('specialties', e.target.value)} /></Field>
              <Field label="Professional biography" optional error={errors.biography} className="sm:col-span-2"><Textarea value={draft.biography} maxLength={1500} onChange={(e) => setField('biography', e.target.value)} /></Field>
            </div>
            <p className="text-sm text-ink-600"><strong>Department</strong> {user.department}</p>
          </Card>

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <EntryEditor group="education" entries={draft.education} errors={errors} onChange={(entries) => setField('education', entries)} />
            <EntryEditor group="accomplishments" entries={draft.accomplishments} errors={errors} onChange={(entries) => setField('accomplishments', entries)} />
          </div>

          <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-bold"><FileText className="size-4 text-brand-600" aria-hidden />Credentials</h2>
              <Button icon={Plus} variant="secondary" size="sm" disabled={credentialCount >= PROFILE_ENTRY_LIMIT} onClick={() => setShowUpload(true)}>Add credential</Button>
            </div>
            <p className="text-sm text-ink-600">Credential additions and removals take effect when you save the profile.</p>
            {!credentialCount && <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">No credentials added.</p>}
            {credentialCount > 0 && <ul className="divide-y divide-ink-100">
              {draft.credentials.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0"><p className="wrap-anywhere text-sm font-semibold">{item.title}</p><p className="wrap-anywhere text-xs text-ink-600">{item.category} · {item.fileName}</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" aria-label={`View ${item.title}`} onClick={() => setPreview(item)}>View</Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${item.title}`} onClick={() => setField('credentials', draft.credentials.filter((entry) => entry.id !== item.id))}>Remove</Button>
                </div>
              </li>)}
              {uploads.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0"><p className="wrap-anywhere text-sm font-semibold">{item.title}</p><p className="wrap-anywhere text-xs text-ink-600">{item.category} · {item.file.name}</p></div>
                <div className="flex flex-wrap items-center gap-2"><Badge tone="warning">Pending save</Badge><Button size="sm" variant="ghost" aria-label={`Remove ${item.title}`} onClick={() => setUploads((items) => items.filter((entry) => entry.id !== item.id))}>Remove</Button></div>
              </li>)}
            </ul>}
          </Card>
        </fieldset>
        {saveError && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800">{saveError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-sm text-ink-600" role="status">{savedAt ? `Last saved ${formatDateTime(savedAt)}` : 'Profile has not been saved yet.'}</p>
          <Button type="submit" icon={Save} loading={busy} loadingText="Saving profile…" className="w-full sm:w-auto">Save faculty profile</Button>
        </div>
      </form>
      {showUpload && <CredentialUpload onClose={() => setShowUpload(false)} onAdd={(item) => { setUploads((items) => [...items, item]); setShowUpload(false) }} />}
      {preview && <CredentialPreview key={preview.id} user={user} ownerId={user.id} credential={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

function EntryEditor({ group, entries, errors, onChange }: { group: 'education' | 'accomplishments'; entries: ProfileEntry[]; errors: Record<string, string>; onChange: (entries: ProfileEntry[]) => void }) {
  const education = group === 'education'
  const Icon = education ? BookOpen : Award
  const singular = education ? 'education entry' : 'accomplishment'
  const panel = useRef<HTMLDivElement>(null)

  function add() {
    const id = crypto.randomUUID()
    onChange([...entries, { id, title: '', institution: '', year: '' }])
    requestAnimationFrame(() => panel.current?.querySelector<HTMLInputElement>(`[name="entry-${id}"]`)?.focus())
  }

  function change(id: string, field: 'title' | 'institution' | 'year', value: string) {
    onChange(entries.map((entry) => entry.id === id ? { ...entry, [field]: value } : entry))
  }

  return (
    <Card className="p-4 sm:p-6">
      <div ref={panel} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold"><Icon className="size-4 text-brand-600" aria-hidden />{education ? 'Educational background' : 'Accomplishments'}</h2>
          <Button icon={Plus} data-add-entry variant="secondary" size="sm" disabled={entries.length >= PROFILE_ENTRY_LIMIT} onClick={add}>Add {singular}</Button>
        </div>
        {!entries.length && <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">{education ? 'Add degrees and other academic qualifications.' : 'Add awards, publications, and other professional accomplishments.'}</p>}
        {errors[group] && <p role="alert" className="text-sm text-danger-800">{errors[group]}</p>}
        {entries.map((entry, index) => (
          <fieldset key={entry.id} className="min-w-0 rounded-xl border border-ink-200 px-3 pb-3 sm:px-4">
            <legend className="px-1 text-sm font-semibold text-ink-700">{entry.title.trim() || `${education ? 'Education entry' : 'Accomplishment'} ${index + 1}`}</legend>
            <div className="grid gap-3">
              <Field label={education ? 'Degree or qualification' : 'Accomplishment title'} required error={errors[`${group}-${entry.id}-title`]}><Input name={`entry-${entry.id}`} maxLength={140} required value={entry.title} onChange={(e) => change(entry.id, 'title', e.target.value)} /></Field>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Field label={education ? 'Institution' : 'Organization'} optional error={errors[`${group}-${entry.id}-institution`]}><Input maxLength={140} value={entry.institution} onChange={(e) => change(entry.id, 'institution', e.target.value)} /></Field>
                <Field label="Year" optional error={errors[`${group}-${entry.id}-year`]}><Input inputMode="numeric" maxLength={4} value={entry.year} onChange={(e) => change(entry.id, 'year', e.target.value)} /></Field>
              </div>
              <Button variant="ghost" size="sm" icon={X} className="justify-self-start" aria-label={`Remove ${entry.title.trim() || `${singular} ${index + 1}`}`} onClick={() => {
                onChange(entries.filter((item) => item.id !== entry.id))
                requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('[data-add-entry]')?.focus())
              }}>Remove entry</Button>
            </div>
          </fieldset>
        ))}
      </div>
    </Card>
  )
}

function CredentialUpload({ onClose, onAdd }: { onClose: () => void; onAdd: (item: PendingCredential) => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<CredentialCategory>('Certificate')
  const [file, setFile] = useState<File | null>(null)
  const [attempted, setAttempted] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (!title.trim() || !file || credentialFileError(file)) {
      const form = event.currentTarget
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    onAdd({ id: crypto.randomUUID(), title: title.trim(), category, file })
  }
  return (
    <Dialog open onClose={onClose} title="Add credential" description={`Choose a PDF, PNG, or JPEG up to ${CREDENTIAL_FILE_LIMIT_MB} MB.`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="add-credential" icon={Plus}>Add to profile</Button></>}>
      <form id="add-credential" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Credential title" required error={attempted && !title.trim() ? 'Enter a credential title.' : undefined}><Input required maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Credential category" required><Select required value={category} onChange={(e) => setCategory(e.target.value as CredentialCategory)}>{CREDENTIAL_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Credential file" required error={file || attempted ? credentialFileError(file) : undefined}><Input type="file" required accept=".pdf,.png,.jpg,.jpeg" className="h-auto py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      </form>
    </Dialog>
  )
}
