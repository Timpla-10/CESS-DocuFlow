import { AlertCircle, ClipboardList, Download, FileText, Plus, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui'
import { FriendlyError } from '../../content/language'
import {
  CLASS_RECORD_CATEGORIES,
  CLASS_RECORD_FILE_LIMIT,
  CLASS_RECORD_TERMS,
  classRecordErrors,
  classRecordFileError,
  listClassRecords,
  retrieveClassRecord,
  uploadClassRecord,
  type ClassRecord,
  type ClassRecordFields,
} from '../../data/classRecords'
import type { User } from '../../data/types'
import { formatDateTime } from '../../lib/time'

function displayError(error: unknown, fallback: string): string {
  return error instanceof FriendlyError ? error.message : fallback
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-800">
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {message}
    </p>
  )
}

export function ClassRecordsPage() {
  const user = useUser()
  return <ClassRecordsWorkspace key={user.id} user={user} />
}

function ClassRecordsWorkspace({ user }: { user: User }) {
  const [records, setRecords] = useState<ClassRecord[] | null>(null)
  const [listError, setListError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [year, setYear] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState<ClassRecord | null>(null)

  useEffect(() => {
    let mounted = true
    listClassRecords(user).then(
      (entries) => { if (mounted) setRecords(entries) },
      (error) => { if (mounted) setListError(displayError(error, 'Could not open class record storage. Try again.')) },
    )
    return () => { mounted = false }
  }, [user, refresh])

  const needle = query.trim().toLowerCase()
  const visible = (records ?? []).filter((record) => (
    (!category || record.category === category) && (!year || record.academicYear === year) &&
    [record.course, record.section, record.ownerName, record.fileName].some((value) => value.toLowerCase().includes(needle))
  ))
  const years = [...new Set((records ?? []).map((record) => record.academicYear))].sort().reverse()

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200/70 bg-brand-50 p-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white sm:size-13">
            <ClipboardList className="size-5 sm:size-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-brand-900 sm:text-2xl">Faculty Class Records</h1>
            <p className="mt-1 text-sm text-ink-600">{user.role === 'faculty' ? 'Upload and find your records by course, term, and category.' : 'Find class records within the scope of your office.'}</p>
          </div>
        </div>
        {user.role === 'faculty' && <Button icon={Plus} onClick={() => setUploadOpen(true)} className="w-full sm:w-auto">Upload class record</Button>}
      </header>

      <Card>
        <div className="grid gap-3 border-b border-ink-100 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:p-5">
          <Field label="Search records"><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Course, section, faculty, or file name" /></Field>
          <Field label="Category">
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {CLASS_RECORD_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="Academic year">
            <Select value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="">All academic years</option>
              {years.map((value) => <option key={value}>{value}</option>)}
            </Select>
          </Field>
        </div>
        {listError ? (
          <div className="space-y-3 p-4 sm:p-5">
            <ErrorMessage message={listError} />
            <Button variant="secondary" onClick={() => { setListError(''); setRefresh((value) => value + 1) }}>Try again</Button>
          </div>
        ) : !records ? <Spinner label="Loading class records…" /> : visible.length === 0 ? (
          <EmptyState icon={FileText} title={records.length ? 'No matching class records' : 'No class records yet'}>
            {records.length ? 'Try a different search or filter.' : user.role === 'faculty' ? 'Your uploaded files will appear here.' : 'Class records available to your office will appear here.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-ink-100" aria-label="Class records">
            {visible.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
                  <div className="min-w-0 space-y-1.5">
                    <h2 className="wrap-anywhere text-sm font-bold">{record.course} · {record.section}</h2>
                    <p className="wrap-anywhere text-sm text-ink-600">{record.fileName}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-600">
                      <Badge tone="brand" dot={false}>{record.category}</Badge>
                      <span>{record.academicYear} · {record.term}</span>
                      {user.role !== 'faculty' && <span className="wrap-anywhere">{record.ownerName}</span>}
                    </div>
                  </div>
                </div>
                <Button variant="secondary" size="sm" aria-label={`View ${record.fileName}`} onClick={() => setSelected(record)}>View record</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {uploadOpen && <UploadDialog user={user} onClose={() => setUploadOpen(false)} onSaved={(record) => {
        setRecords((previous) => [record, ...(previous ?? [])])
        setUploadOpen(false)
        setQuery('')
        setCategory('')
        setYear('')
        setListError('')
        setRefresh((value) => value + 1)
      }} />}
      {selected && <RecordDialog key={selected.id} user={user} record={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function UploadDialog({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (record: ClassRecord) => void }) {
  const toast = useToast()
  const [fields, setFields] = useState<ClassRecordFields>({ course: '', section: '', academicYear: '', category: 'Attendance', term: 'First semester' })
  const [file, setFile] = useState<File | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const errors = classRecordErrors(fields)
  const fileError = classRecordFileError(file)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    setSaveError('')
    if (Object.keys(errors).length || fileError) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    if (!file) return
    setBusy(true)
    try {
      const record = await uploadClassRecord(user, fields, file)
      toast.success('Class record uploaded', record.fileName)
      onSaved(record)
    } catch (error) {
      setSaveError(displayError(error, 'Could not save the class record. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title="Upload class record" busy={busy} footer={(
      <>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" form="class-record-upload" icon={Upload} loading={busy} loadingText="Uploading…">Upload record</Button>
      </>
    )}>
      <form id="class-record-upload" ref={form} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Course code or title" required error={attempted ? errors.course : undefined}>
          <Input required maxLength={80} disabled={busy} value={fields.course} onChange={(event) => setFields({ ...fields, course: event.target.value })} />
        </Field>
        <Field label="Section" required error={attempted ? errors.section : undefined}>
          <Input required maxLength={40} disabled={busy} value={fields.section} onChange={(event) => setFields({ ...fields, section: event.target.value })} />
        </Field>
        <Field label="Academic year" required error={attempted ? errors.academicYear : undefined}>
          <Input required maxLength={9} disabled={busy} placeholder="YYYY-YYYY" value={fields.academicYear} onChange={(event) => setFields({ ...fields, academicYear: event.target.value })} />
        </Field>
        <Field label="Term" required error={attempted ? errors.term : undefined}>
          <Select required disabled={busy} value={fields.term} onChange={(event) => setFields({ ...fields, term: event.target.value as ClassRecordFields['term'] })}>
            {CLASS_RECORD_TERMS.map((value) => <option key={value}>{value}</option>)}
          </Select>
        </Field>
        <Field label="Category" required error={attempted ? errors.category : undefined}>
          <Select required disabled={busy} value={fields.category} onChange={(event) => setFields({ ...fields, category: event.target.value as ClassRecordFields['category'] })}>
            {CLASS_RECORD_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
          </Select>
        </Field>
        <Field label="Class record file" required error={attempted || file ? fileError : undefined} className="sm:col-span-2">
          <Input type="file" accept=".pdf,.csv,.xlsx" required disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="h-auto py-2" />
        </Field>
        <p className="text-xs text-ink-600 sm:col-span-2">PDF, CSV, or Excel (.xlsx), up to {CLASS_RECORD_FILE_LIMIT} MB.</p>
        {saveError && <div className="sm:col-span-2"><ErrorMessage message={saveError} /></div>}
      </form>
    </Dialog>
  )
}

function RecordDialog({ user, record, onClose }: { user: User; record: ClassRecord; onClose: () => void }) {
  const [preview, setPreview] = useState<{ text: string; truncated: boolean } | { url: string } | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (record.format === 'xlsx') return
    let active = true
    let url: string | undefined
    async function load() {
      try {
        const file = await retrieveClassRecord(user, record.id)
        if (record.format === 'csv') {
          const maxPreviewBytes = 32000
          const text = await file.slice(0, maxPreviewBytes).text()
          if (active) setPreview({ text, truncated: file.size > maxPreviewBytes })
        } else if (active) {
          url = URL.createObjectURL(file.slice(0, file.size, 'application/pdf'))
          setPreview({ url })
        }
      } catch (error) {
        if (active) setPreviewError(displayError(error, 'Could not load the preview.'))
      }
    }
    void load()
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [user, record])

  async function download() {
    setDownloadError('')
    setDownloading(true)
    try {
      const file = await retrieveClassRecord(user, record.id)
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = record.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (error) {
      setDownloadError(displayError(error, 'Could not download the file. Try again.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open onClose={onClose} size="lg" title={<span className="wrap-anywhere">{record.fileName}</span>} footer={(
      <>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button icon={Download} onClick={download} loading={downloading} loadingText="Preparing download…">Download original file</Button>
      </>
    )}>
      <div className="space-y-4">
        <dl className="grid gap-3 rounded-lg bg-ink-50 p-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-ink-600">Course and section</dt><dd className="wrap-anywhere font-semibold">{record.course} · {record.section}</dd></div>
          <div><dt className="text-xs text-ink-600">Academic period</dt><dd>{record.academicYear} · {record.term}</dd></div>
          <div><dt className="text-xs text-ink-600">Category</dt><dd>{record.category}</dd></div>
          <div><dt className="text-xs text-ink-600">Uploaded by</dt><dd className="wrap-anywhere">{record.ownerName} · <time dateTime={record.uploadedAt}>{formatDateTime(record.uploadedAt)}</time></dd></div>
        </dl>
        {downloadError && <ErrorMessage message={downloadError} />}
        {previewError ? <ErrorMessage message={previewError} /> : record.format === 'xlsx' ? (
          <p className="text-sm text-ink-600">Download the Excel file to view the workbook.</p>
        ) : !preview ? <Spinner label="Loading file preview…" /> : 'text' in preview ? (
          <>
            <pre className="max-h-80 overflow-auto rounded-lg border border-ink-200 bg-white p-3 text-xs" tabIndex={0} aria-label="CSV file preview">{preview.text}</pre>
            {preview.truncated && <p className="text-xs text-ink-600">Download the original to view the remaining rows.</p>}
          </>
        ) : <object type="application/pdf" data={preview.url} aria-label="PDF file preview" className="h-80 w-full rounded-lg border border-ink-200">
          <p className="p-3 text-sm text-ink-600">Download the PDF to view it in your PDF reader.</p>
        </object>}
      </div>
    </Dialog>
  )
}
