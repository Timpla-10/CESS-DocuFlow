import {
  Bell,
  Building2,
  CheckSquare,
  Clock,
  Edit3,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldAlert,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, CardHeader, PageHeader, cn } from '../../components/ui'
import { OFFICE_LABEL } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { DocumentType, ExternalOfficeItem, OfficeId, Requirement } from '../../data/types'

const REVIEW_OFFICE_CHOICES: OfficeId[] = ['chairperson', 'ids_principal', 'dean', 'ovcaa', 'vcaf', 'chancellor']
const HIGHER_OFFICE_CHOICES: OfficeId[] = ['ovcaa', 'vcaf', 'chancellor']


export function SettingsPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()
  const navigate = useNavigate()

  // 1. Reminder days state (REQ-NOT-3)
  const [reminderDays, setReminderDays] = useState(db.settings.reminderEveryDays)

  // 2. Inline processing days state (REQ-WFM-7)
  const [editingTypeDays, setEditingTypeDays] = useState<Record<string, [number, number]>>(
    Object.fromEntries(db.documentTypes.map((t) => [t.id, [...t.processingDays]])),
  )

  // 3. Document Type, Checklist, Route & Template Editor Dialog State (REQ-REQT-1, REQ-REQT-10, REQ-ROUTE-1)
  const [isDocTypeModalOpen, setIsDocTypeModalOpen] = useState(false)
  const [dtDraft, setDtDraft] = useState<DocumentType | null>(null)
  const [dtBusy, setDtBusy] = useState(false)

  // 4. External Offices Editor State (REQ-EXT-1)
  const [extLabel, setExtLabel] = useState('')
  const [extShort, setExtShort] = useState('')
  const [editingExtId, setEditingExtId] = useState<string | null>(null)
  const [extBusy, setExtBusy] = useState(false)



  // --- Handlers ---

  const handleSaveReminder = async () => {
    try {
      await api.updateReminderDays(user, reminderDays)
      toast.success('Settings Saved', `Pending reminders will be sent every ${reminderDays} days.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed.'
      toast.error('Unable to Save', msg)
    }
  }

  const handleSaveProcessingDays = async (typeId: string) => {
    const days = editingTypeDays[typeId]
    if (!days) return
    try {
      await api.updateProcessingDays(user, typeId, days)
      toast.success('Turnaround Time Saved', 'Standard processing days updated for this document type.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed.'
      toast.error('Unable to Save', msg)
    }
  }

  // Document Type Modal Handlers
  const openEditDocType = (t: DocumentType) => {
    setDtDraft({
      ...structuredClone(t),
      cessRoute: t.cessRoute && t.cessRoute.length > 0 ? [...t.cessRoute] : ['chairperson', 'dean'],
      idsRoute: t.idsRoute && t.idsRoute.length > 0 ? [...t.idsRoute] : ['chairperson', 'ids_principal', 'dean'],
    })
    setIsDocTypeModalOpen(true)
  }

  const openNewDocType = () => {
    setDtDraft({
      id: '',
      name: '',
      audience: 'student',
      summary: '',
      templateName: '',
      processingDays: [3, 5],
      cessRoute: ['chairperson', 'dean'],
      idsRoute: ['chairperson', 'ids_principal', 'dean'],
      higherApproval: [],
      requirements: [{ id: `req-${Date.now()}`, label: '', required: true, source: '' }],
    })
    setIsDocTypeModalOpen(true)
  }

  const handleTemplateUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !dtDraft) return
    setDtDraft({ ...dtDraft, templateName: file.name })
    e.target.value = ''
  }

  const handleSaveDocType = async (e: FormEvent) => {
    e.preventDefault()
    if (!dtDraft) return
    setDtBusy(true)
    try {
      const cleanedReqs: Requirement[] = dtDraft.requirements
        .filter((r) => r.label.trim())
        .map((r, i) => ({
          id: r.id || `req-${Date.now()}-${i}`,
          label: r.label.trim(),
          required: r.required,
          source: r.source?.trim() || undefined,
          why: r.why?.trim() || undefined,
        }))
      const saved = await api.saveDocumentType(user, {
        ...dtDraft,
        requirements: cleanedReqs,
      })
      setEditingTypeDays((prev) => ({ ...prev, [saved.id]: [...saved.processingDays] }))
      toast.success(
        'Document Type Saved',
        `Updated checklist, template, and routing rules for ${saved.name}.`,
      )
      setIsDocTypeModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save document type.'
      toast.error('Save Failed', msg)
    } finally {
      setDtBusy(false)
    }
  }

  // External Office Handlers
  const handleSaveExternalOffice = async (e: FormEvent) => {
    e.preventDefault()
    setExtBusy(true)
    try {
      await api.saveExternalOffice(user, {
        id: editingExtId ?? '',
        label: extLabel,
        shortLabel: extShort,
      })
      toast.success(
        editingExtId ? 'External Office Updated' : 'External Office Added',
        `Saved ${extShort || extLabel} in external office list.`,
      )
      setEditingExtId(null)
      setExtLabel('')
      setExtShort('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save external office.'
      toast.error('Save Failed', msg)
    } finally {
      setExtBusy(false)
    }
  }

  const handleEditExternal = (item: ExternalOfficeItem) => {
    setEditingExtId(item.id)
    setExtLabel(item.label)
    setExtShort(item.shortLabel)
  }

  const handleDeleteExternal = async (item: ExternalOfficeItem) => {
    if (!window.confirm(`Remove ${item.label} from the external offices list?`)) return
    try {
      await api.deleteExternalOffice(user, item.id)
      toast.info('External Office Removed', `${item.shortLabel} was removed.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to remove external office.'
      toast.error('Remove Failed', msg)
    }
  }


  const handleResetDemo = () => {
    if (window.confirm('Reset all demo data back to default sample state? Any changes made during this session will be replaced.')) {
      api.resetDemo()
      toast.info('Demo Reset', 'All sample documents, accounts, and notices have been restored to initial state.')
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="System Administrator Controls (College Secretary)"
        title="System Settings & Configuration"
        description="Manage document types, required checklists, downloadable templates, CESS/IDS routes, turnaround times, external offices, reminder intervals, and user accounts without changing code."
      />

      {/* 1. Document Types, Checklists, Templates, Routes & Turnaround Times */}
      <Card>
        <CardHeader
          icon={Clock}
          title="Document Types, Checklists, Templates, Routes & Turnaround Times"
          description="Configure required forms, upload official templates, edit CESS and IDS routes, and set standard processing times from the CESS Manual of Operations."
          action={
            <Button size="sm" icon={Plus} onClick={openNewDocType}>
              Add Document Type
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
                <th className="px-5 py-3.5 min-w-[220px]">Document Type & Template</th>
                <th className="px-5 py-3.5 min-w-[120px]">Audience</th>
                <th className="px-5 py-3.5 min-w-[280px]">Checklist & Route</th>
                <th className="px-5 py-3.5 min-w-[180px]">Min / Max Days</th>
                <th className="px-5 py-3.5 min-w-[260px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {db.documentTypes.map((t) => {
                const days = editingTypeDays[t.id] || t.processingDays
                const cessSteps = (t.cessRoute ?? ['chairperson', 'dean']).map((o) => OFFICE_LABEL[o]).join(' → ')
                const idsSteps = (t.idsRoute ?? ['chairperson', 'ids_principal', 'dean']).map((o) => OFFICE_LABEL[o]).join(' → ')
                return (
                  <tr key={t.id} className="hover:bg-brand-50/50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink-900">{t.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                        <FileText className="size-3.5 text-brand-600" />
                        {t.templateName || 'Default template'}
                      </p>
                    </td>
                    <td className="px-5 py-4 capitalize text-ink-600 font-medium">{t.audience}</td>
                    <td className="max-w-[340px] px-5 py-4 text-xs text-ink-600">
                      <div className="flex items-center gap-1.5 font-bold text-ink-900">
                        <CheckSquare className="size-3.5 text-brand-600 shrink-0" />
                        <span>Checklist: {t.requirements.filter((r) => r.required).length} required, {t.requirements.filter((r) => !r.required).length} optional</span>
                      </div>
                      <ul className="mt-1 space-y-0.5 text-2xs text-ink-600">
                        {t.requirements.map((r) => (
                          <li key={r.id} className="flex items-center gap-1.5 truncate" title={`${r.label} (${r.required ? 'Required' : 'Optional'})`}>
                            <span className={cn('size-1.5 rounded-full shrink-0', r.required ? 'bg-brand-600' : 'bg-ink-300')} />
                            <span className="truncate font-medium">{r.label}</span>
                            <span className={cn('text-[10px] font-semibold px-1 rounded', r.required ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500')}>
                              {r.required ? 'Required' : 'Optional'}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 pt-1.5 border-t border-ink-100 truncate" title={`CESS: ${cessSteps}`}>
                        <span className="font-semibold text-brand-700">CESS:</span> {cessSteps}
                      </div>
                      <div className="mt-0.5 truncate" title={`IDS: ${idsSteps}`}>
                        <span className="font-semibold text-brand-700">IDS:</span> {idsSteps}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={days[0]}
                          onChange={(e) =>
                            setEditingTypeDays((prev) => ({
                              ...prev,
                              [t.id]: [parseInt(e.target.value) || 1, days[1]],
                            }))
                          }
                          className="h-8.5 w-16 px-2.5 text-xs text-center"
                          aria-label={`Minimum days for ${t.name}`}
                        />
                        <span className="text-xs font-medium text-ink-400">to</span>
                        <Input
                          type="number"
                          min={days[0]}
                          value={days[1]}
                          onChange={(e) =>
                            setEditingTypeDays((prev) => ({
                              ...prev,
                              [t.id]: [days[0], parseInt(e.target.value) || days[0]],
                            }))
                          }
                          className="h-8.5 w-16 px-2.5 text-xs text-center"
                          aria-label={`Maximum days for ${t.name}`}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Settings2}
                          onClick={() => openEditDocType(t)}
                        >
                          Checklist, Route & Template
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSaveProcessingDays(t.id)}
                        >
                          Save Days
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 2. Automated Reminders Configuration */}
      <Card>
        <CardHeader
          icon={Bell}
          title="Automated Follow-up Reminders"
          description="Interval for sending automated reminders to reviewing offices holding pending documents, and progress updates to requesters."
        />
        <div className="p-6">
          <div className="flex max-w-lg flex-wrap items-end gap-4">
            <Field
              label="Send reminder & requester update every"
              hint="The College Secretary requested 3 days on October 16, 2026."
              className="flex-1"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={14}
                  value={reminderDays}
                  onChange={(e) => setReminderDays(parseInt(e.target.value) || 3)}
                  className="w-24"
                />
                <span className="text-sm font-semibold text-ink-700">days</span>
              </div>
            </Field>
            <Button onClick={handleSaveReminder} icon={Save}>
              Save Reminder Interval
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. External University Offices Management */}
      <Card>
        <CardHeader
          icon={Building2}
          title="External University Offices"
          description="Manage the list of external university offices (such as HRMO, Registrar, and Budget & Accounting) to which the College Secretary records transfers."
        />
        <div className="p-6">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <ul className="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-100">
              {db.externalOffices.map((ext) => (
                <li key={ext.id} className="flex items-center justify-between gap-3 bg-white px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-ink-900">{ext.label}</p>
                    <p className="text-xs text-ink-500">Short badge label: {ext.shortLabel}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" icon={Edit3} onClick={() => handleEditExternal(ext)}>
                      Edit
                    </Button>
                    {db.externalOffices.length > 1 && (
                      <Button
                        size="sm"
                        variant="danger-soft"
                        icon={Trash2}
                        onClick={() => handleDeleteExternal(ext)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <form onSubmit={handleSaveExternalOffice} className="space-y-3 rounded-xl bg-ink-50/50 p-4 ring-1 ring-inset ring-ink-100">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-600">
                {editingExtId ? 'Edit External Office' : 'Add External Office'}
              </p>
              <Field label="Full Office Name" required>
                <Input
                  type="text"
                  value={extLabel}
                  onChange={(e) => setExtLabel(e.target.value)}
                  placeholder="e.g. Cashier's Office"
                />
              </Field>
              <Field label="Short Label" required>
                <Input
                  type="text"
                  value={extShort}
                  onChange={(e) => setExtShort(e.target.value)}
                  placeholder="e.g. Cashier"
                />
              </Field>
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" size="sm" loading={extBusy} icon={Save}>
                  {editingExtId ? 'Update Office' : 'Add Office'}
                </Button>
                {editingExtId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingExtId(null)
                      setExtLabel('')
                      setExtShort('')
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </Card>

      {/* 4. User Accounts & Masterlist Migration Link Card */}
      <Card className="border-brand-200 bg-brand-50/20">
        <CardHeader
          icon={Users}
          title="User Accounts, Roles & Semester Masterlists"
          description="Manage all student and faculty accounts, semester CSV/Excel masterlist imports, and pending account approvals in the dedicated User Management module."
          action={
            <Button size="sm" icon={Users} onClick={() => navigate('/app/users')}>
              Open User Management
            </Button>
          }
        />
        <div className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink-900">
                {db.users.length} University Accounts · {(db.whitelist ?? []).length} Whitelisted Records · {(db.pendingRegistrations ?? []).filter((p) => p.status === 'pending').length} Pending Verifications
              </p>
              <p className="text-xs text-ink-600">
                Bulk imports for student enrollment rosters, faculty records, automated role assignments, and instant whitelist matching have moved to the dedicated module.
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate('/app/users')}>
              Go to User Management &rarr;
            </Button>
          </div>
        </div>
      </Card>

      {/* 5. Prototype Demo Reset */}
      <Card className="border-danger-200 bg-danger-50/20">
        <CardHeader
          icon={ShieldAlert}
          title="Prototype Reset"
          description="Reset database back to the initial sample seed."
        />
        <div className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-md text-xs text-ink-600">
              This will reload all fictional users, documents, notification logs, and test workflows.
            </p>
            <Button variant="danger-soft" onClick={handleResetDemo} icon={RotateCcw}>
              Reset Sample Data
            </Button>
          </div>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* DIALOG 1: Document Type, Checklist, Route & Template Editor               */}
      {/* ========================================================================= */}
      <Dialog
        open={isDocTypeModalOpen}
        onClose={() => setIsDocTypeModalOpen(false)}
        size="xl"
        title={dtDraft?.id ? `Configure ${dtDraft.name}` : 'Add New Document Type'}
        description="Edit required forms and attachments, upload or replace the blank template, and configure the CESS and IDS approval routes."
        busy={dtBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsDocTypeModalOpen(false)} disabled={dtBusy}>
              Cancel
            </Button>
            <Button onClick={handleSaveDocType} loading={dtBusy} icon={Save}>
              Save Document Type Configuration
            </Button>
          </>
        }
      >
        {dtDraft && (
          <form className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Document Type Name" required>
                <Input
                  type="text"
                  value={dtDraft.name}
                  onChange={(e) => setDtDraft({ ...dtDraft, name: e.target.value })}
                  placeholder="e.g. Travel Order"
                />
              </Field>
              <Field label="Requester Audience" hint="Specify whether this document is submitted by students or faculty." required>
                <Select
                  value={dtDraft.audience}
                  onChange={(e) => setDtDraft({ ...dtDraft, audience: e.target.value as 'student' | 'faculty' })}
                >
                  <option value="student">Student</option>
                  <option value="faculty">Faculty (CESS & IDS)</option>
                </Select>
              </Field>
            </div>

            <Field label="Short Description / Summary" required>
              <Textarea
                rows={2}
                value={dtDraft.summary}
                onChange={(e) => setDtDraft({ ...dtDraft, summary: e.target.value })}
                placeholder="Explain when a student or faculty member uses this document..."
              />
            </Field>

            {/* Template Upload / Replacement */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-800">
                Downloadable Form Template
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[200px] flex-1">
                  <Input
                    type="text"
                    value={dtDraft.templateName ?? ''}
                    onChange={(e) => setDtDraft({ ...dtDraft, templateName: e.target.value })}
                    placeholder="Template file name (e.g. MSUN_Travel_Order_Template.pdf)"
                    className="h-9 text-xs"
                  />
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-xs ring-1 ring-brand-200 hover:bg-brand-50">
                  <UploadCloud className="size-3.5" /> Upload / Replace Template
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="sr-only"
                    onChange={handleTemplateUpload}
                  />
                </label>
              </div>
            </div>

            {/* Origin-Based Routes Configuration */}
            <div className="space-y-4 rounded-xl border border-ink-200 bg-ink-50/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-700">
                Origin-Based Approval Routes
              </p>

              {/* CESS Route */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-800">
                    CESS Route (between Secretary Check & Release):
                  </span>
                  <button
                    type="button"
                    onClick={() => setDtDraft({ ...dtDraft, cessRoute: ['chairperson', 'dean'] })}
                    className="text-[11px] font-semibold text-brand-700 hover:underline"
                  >
                    Reset to default (Chairperson → Dean)
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral" dot={false}>1. Secretary Check</Badge>
                  {(dtDraft.cessRoute ?? []).map((off, idx) => (
                    <span key={`cess-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                      {idx + 2}. {OFFICE_LABEL[off]}
                      <button
                        type="button"
                        onClick={() =>
                          setDtDraft({
                            ...dtDraft,
                            cessRoute: (dtDraft.cessRoute ?? []).filter((_, i) => i !== idx),
                          })
                        }
                        className="ml-0.5 text-brand-600 hover:text-danger-600"
                        aria-label="Remove step"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <Select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      setDtDraft({
                        ...dtDraft,
                        cessRoute: [...(dtDraft.cessRoute ?? []), e.target.value as OfficeId],
                      })
                    }}
                    className="h-7 w-40 text-xs"
                  >
                    <option value="">+ Add office step…</option>
                    {REVIEW_OFFICE_CHOICES.map((o) => (
                      <option key={o} value={o}>
                        {OFFICE_LABEL[o]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* IDS Route (Supports IDS Principal 1st and 2nd review) */}
              <div className="border-t border-ink-200/70 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-800">
                    IDS Route (Supports IDS Principal 1st & 2nd Review):
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDtDraft({ ...dtDraft, idsRoute: ['chairperson', 'ids_principal', 'dean'] })
                      }
                      className="text-[11px] font-semibold text-brand-700 hover:underline"
                    >
                      Standard IDS Route
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDtDraft({
                          ...dtDraft,
                          idsRoute: ['ids_principal', 'chairperson', 'ids_principal', 'dean'],
                        })
                      }
                      className="text-[11px] font-semibold text-brand-700 hover:underline"
                    >
                      Use 1st & 2nd IDS Principal Review
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral" dot={false}>1. Secretary Check</Badge>
                  {(dtDraft.idsRoute ?? []).map((off, idx) => (
                    <span key={`ids-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                      {idx + 2}. {OFFICE_LABEL[off]}
                      <button
                        type="button"
                        onClick={() =>
                          setDtDraft({
                            ...dtDraft,
                            idsRoute: (dtDraft.idsRoute ?? []).filter((_, i) => i !== idx),
                          })
                        }
                        className="ml-0.5 text-brand-600 hover:text-danger-600"
                        aria-label="Remove step"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <Select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      setDtDraft({
                        ...dtDraft,
                        idsRoute: [...(dtDraft.idsRoute ?? []), e.target.value as OfficeId],
                      })
                    }}
                    className="h-7 w-40 text-xs"
                  >
                    <option value="">+ Add office step…</option>
                    {REVIEW_OFFICE_CHOICES.map((o) => (
                      <option key={o} value={o}>
                        {OFFICE_LABEL[o]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Higher Approval after Dean */}
              <div className="border-t border-ink-200/70 pt-3">
                <p className="text-xs font-semibold text-ink-800">
                  Offices after College Dean when Higher Approval is marked:
                </p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {HIGHER_OFFICE_CHOICES.map((off) => {
                    const checked = dtDraft.higherApproval.includes(off)
                    return (
                      <Checkbox
                        key={off}
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...dtDraft.higherApproval, off]
                            : dtDraft.higherApproval.filter((x) => x !== off)
                          setDtDraft({ ...dtDraft, higherApproval: next })
                        }}
                        label={<span className="text-xs font-semibold">{OFFICE_LABEL[off]}</span>}
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Required Forms & Attachments Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-700">
                  Required Forms & Attachments Checklist
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={Plus}
                  onClick={() =>
                    setDtDraft({
                      ...dtDraft,
                      requirements: [
                        ...dtDraft.requirements,
                        { id: `req-${Date.now()}`, label: '', required: true, source: '' },
                      ],
                    })
                  }
                >
                  Add Checklist Item
                </Button>
              </div>

              {dtDraft.requirements.map((req, idx) => (
                <div key={req.id || idx} className="rounded-xl border border-ink-200 bg-white p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex-1 min-w-[200px]">
                      <Input
                        type="text"
                        value={req.label}
                        onChange={(e) => {
                          const next = [...dtDraft.requirements]
                          next[idx] = { ...req, label: e.target.value }
                          setDtDraft({ ...dtDraft, requirements: next })
                        }}
                        placeholder="Form or attachment name (e.g. Travel Order form)"
                        className="h-9 text-xs font-semibold"
                      />
                    </div>
                    <Select
                      value={req.required ? 'required' : 'optional'}
                      onChange={(e) => {
                        const next = [...dtDraft.requirements]
                        next[idx] = { ...req, required: e.target.value === 'required' }
                        setDtDraft({ ...dtDraft, requirements: next })
                      }}
                      className="h-9 w-32 text-xs"
                    >
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </Select>
                    {dtDraft.requirements.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDtDraft({
                            ...dtDraft,
                            requirements: dtDraft.requirements.filter((_, i) => i !== idx),
                          })
                        }
                        className="rounded p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                        aria-label="Remove requirement"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <Input
                    type="text"
                    value={req.source ?? ''}
                    onChange={(e) => {
                      const next = [...dtDraft.requirements]
                      next[idx] = { ...req, source: e.target.value }
                      setDtDraft({ ...dtDraft, requirements: next })
                    }}
                    placeholder="Where to get it, e.g., Registrar's Office, HRMO, or Download template above"
                    className="h-8 text-xs"
                  />
                  <Input
                    type="text"
                    value={req.why ?? ''}
                    onChange={(e) => {
                      const next = [...dtDraft.requirements]
                      next[idx] = { ...req, why: e.target.value }
                      setDtDraft({ ...dtDraft, requirements: next })
                    }}
                    placeholder="Purpose / Why it's needed (e.g. Official request approving offices sign)"
                    className="h-8 text-xs text-ink-600"
                  />
                </div>
              ))}
            </div>
          </form>
        )}
      </Dialog>

    </div>
  )
}
