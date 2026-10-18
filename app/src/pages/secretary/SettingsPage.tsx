import {
  Bell,
  Building2,
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
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, CardHeader, PageHeader } from '../../components/ui'
import { OFFICE_LABEL, ROLE_LABEL } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { DocumentType, ExternalOfficeItem, OfficeId, Origin, Requirement, Role, User } from '../../data/types'

const REVIEW_OFFICE_CHOICES: OfficeId[] = ['chairperson', 'ids_principal', 'dean', 'ovcaa', 'chancellor']
const HIGHER_OFFICE_CHOICES: OfficeId[] = ['ovcaa', 'chancellor']
const ALL_ROLES: Role[] = ['student', 'faculty', 'secretary', 'chairperson', 'ids_principal', 'dean', 'ovcaa', 'chancellor']

export function SettingsPage() {
  const user = useUser()
  const db = useDb()
  const toast = useToast()

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

  // 5. User Account Create / Edit Dialog State (REQ-AUTH-3)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | undefined>(undefined)
  const [uName, setUName] = useState('')
  const [uEmail, setUEmail] = useState('')
  const [uRole, setURole] = useState<Role>('student')
  const [uOrigin, setUOrigin] = useState<Origin>('CESS')
  const [uDept, setUDept] = useState('')
  const [uPos, setUPos] = useState('')
  const [userBusy, setUserBusy] = useState(false)

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

  // User Account Modal Handlers
  const openCreateUser = () => {
    setEditingUserId(undefined)
    setUName('')
    setUEmail('')
    setURole('student')
    setUOrigin('CESS')
    setUDept('BSEd English')
    setUPos('Student')
    setIsUserModalOpen(true)
  }

  const openEditUser = (u: User) => {
    setEditingUserId(u.id)
    setUName(u.name)
    setUEmail(u.email)
    setURole(u.role)
    setUOrigin(u.origin ?? 'CESS')
    setUDept(u.department)
    setUPos(u.position)
    setIsUserModalOpen(true)
  }

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault()
    setUserBusy(true)
    try {
      await api.saveUserAccount(user, {
        id: editingUserId,
        name: uName,
        email: uEmail,
        role: uRole,
        origin: uRole === 'student' || uRole === 'faculty' ? uOrigin : undefined,
        department: uDept,
        position: uPos,
      })
      toast.success(
        editingUserId ? 'Account Updated' : 'Account Created',
        `Saved account for ${uName.trim()} (${ROLE_LABEL[uRole]}).`,
      )
      setIsUserModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save user account.'
      toast.error('Save Failed', msg)
    } finally {
      setUserBusy(false)
    }
  }

  const handleToggleUser = async (targetUserId: string, currentActive: boolean) => {
    try {
      await api.setUserActive(user, targetUserId, !currentActive)
      toast.success(
        !currentActive ? 'Account Activated' : 'Account Deactivated',
        !currentActive ? 'User can now sign in.' : 'User will be denied access upon next login.',
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed.'
      toast.error('Action Failed', msg)
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

      {/* 1. Document Types, Checklists, Templates, Routes & Turnaround Times (REQ-REQT-1, REQ-REQT-10, REQ-ROUTE-1, REQ-WFM-7) */}
      <Card className="p-6">
        <CardHeader
          icon={Clock}
          title="Document Types, Checklists, Templates, Routes & Turnaround Times"
          description="Configure required forms, upload official templates (REQ-REQT-10), edit CESS and IDS routes (REQ-ROUTE-1), and set standard processing times from the CESS Manual of Operations (REQ-WFM-7)."
          action={
            <Button size="sm" icon={Plus} onClick={openNewDocType}>
              Add Document Type
            </Button>
          }
        />
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="pb-3">Document Type & Template</th>
                <th className="pb-3">Audience</th>
                <th className="pb-3">Checklist & Route</th>
                <th className="pb-3">Min / Max Days</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {db.documentTypes.map((t) => {
                const days = editingTypeDays[t.id] || t.processingDays
                const cessSteps = (t.cessRoute ?? ['chairperson', 'dean']).map((o) => OFFICE_LABEL[o]).join(' → ')
                const idsSteps = (t.idsRoute ?? ['chairperson', 'ids_principal', 'dean']).map((o) => OFFICE_LABEL[o]).join(' → ')
                return (
                  <tr key={t.id}>
                    <td className="py-3.5 pr-3">
                      <p className="font-semibold text-ink-900">{t.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                        <FileText className="size-3 text-brand-600" />
                        {t.templateName || 'Default template'}
                      </p>
                    </td>
                    <td className="py-3.5 capitalize text-ink-600">{t.audience}</td>
                    <td className="max-w-[280px] py-3.5 pr-3 text-xs text-ink-600">
                      <div className="font-semibold text-ink-800">
                        {t.requirements.filter((r) => r.required).length} required · {t.requirements.filter((r) => !r.required).length} optional
                      </div>
                      <div className="mt-0.5 truncate" title={`CESS: ${cessSteps}`}>
                        <span className="font-semibold text-brand-700">CESS:</span> {cessSteps}
                      </div>
                      <div className="truncate" title={`IDS: ${idsSteps}`}>
                        <span className="font-semibold text-brand-700">IDS:</span> {idsSteps}
                      </div>
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-1.5">
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
                          className="h-8 w-16 px-2 text-xs"
                          aria-label={`Minimum days for ${t.name}`}
                        />
                        <span className="text-xs text-ink-400">to</span>
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
                          className="h-8 w-16 px-2 text-xs"
                          aria-label={`Maximum days for ${t.name}`}
                        />
                      </div>
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
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

      {/* 2. Automated Reminders Configuration (REQ-NOT-3) */}
      <Card className="p-6">
        <CardHeader
          icon={Bell}
          title="Automated Follow-up Reminders (REQ-NOT-3)"
          description="Interval for sending automated reminders to reviewing offices holding pending documents, and progress updates to requesters."
        />
        <div className="mt-5 flex max-w-lg flex-wrap items-end gap-4">
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
      </Card>

      {/* 3. External University Offices Management (REQ-EXT-1) */}
      <Card className="p-6">
        <CardHeader
          icon={Building2}
          title="External University Offices (REQ-EXT-1)"
          description="Manage the list of external university offices (such as HRMO, Registrar, and Budget & Accounting) to which the College Secretary records transfers."
        />
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
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
      </Card>

      {/* 4. User Accounts Management (REQ-AUTH-2, REQ-AUTH-3, REQ-AUTH-9) */}
      <Card className="p-6">
        <CardHeader
          icon={Users}
          title="Authorized User Accounts & Roles (REQ-AUTH-2, REQ-AUTH-3)"
          description="Create, edit, assign roles, and activate or deactivate university accounts (@msunaawan.edu.ph)."
          action={
            <Button size="sm" icon={UserPlus} onClick={openCreateUser}>
              Create User Account
            </Button>
          }
        />
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="pb-3">Name & Department</th>
                <th className="pb-3">Role & Origin</th>
                <th className="pb-3">University Email</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {db.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3.5">
                    <div className="font-semibold text-ink-900">{u.name}</div>
                    <div className="text-xs text-ink-500">{u.department}</div>
                  </td>
                  <td className="py-3.5 text-ink-700">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{ROLE_LABEL[u.role]}</span>
                      {u.origin && <Badge tone="neutral" dot={false}>{u.origin}</Badge>}
                    </div>
                    <div className="text-xs text-ink-500">{u.position}</div>
                  </td>
                  <td className="py-3.5 font-mono text-xs text-ink-600">{u.email}</td>
                  <td className="py-3.5">
                    {u.active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Deactivated</Badge>
                    )}
                  </td>
                  <td className="py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="ghost" icon={Edit3} onClick={() => openEditUser(u)}>
                        Edit / Role
                      </Button>
                      {u.id !== user.id && (
                        <Button
                          size="sm"
                          variant={u.active ? 'danger-soft' : 'secondary'}
                          onClick={() => handleToggleUser(u.id, u.active)}
                          icon={u.active ? UserX : UserCheck}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. Prototype Demo Reset */}
      <Card className="border-danger-200 bg-danger-50/20 p-6">
        <CardHeader
          icon={ShieldAlert}
          title="Prototype Reset"
          description="Reset database back to the initial sample seed."
        />
        <div className="mt-4 flex items-center justify-between">
          <p className="max-w-md text-xs text-ink-600">
            This will reload all fictional users, documents, notification logs, and test workflows.
          </p>
          <Button variant="danger-soft" onClick={handleResetDemo} icon={RotateCcw}>
            Reset Sample Data
          </Button>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* DIALOG 1: Document Type, Checklist, Route & Template Editor               */}
      {/* ========================================================================= */}
      <Dialog
        open={isDocTypeModalOpen}
        onClose={() => setIsDocTypeModalOpen(false)}
        size="lg"
        title={dtDraft?.id ? `Configure ${dtDraft.name}` : 'Add New Document Type'}
        description="Edit required forms and attachments (REQ-REQT-1), upload or replace the blank template (REQ-REQT-10), and configure the CESS and IDS approval routes (REQ-ROUTE-1)."
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
          <form className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Document Type Name" required>
                <Input
                  type="text"
                  value={dtDraft.name}
                  onChange={(e) => setDtDraft({ ...dtDraft, name: e.target.value })}
                  placeholder="e.g. Travel Order"
                />
              </Field>
              <Field label="Requester Audience (REQ-SUB-1)" required>
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

            {/* Template Upload / Replacement (REQ-REQT-9, REQ-REQT-10) */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-800">
                Downloadable Form Template (REQ-REQT-9, REQ-REQT-10)
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

            {/* Origin-Based Routes Configuration (REQ-ROUTE-1, REQ-ROUTE-2, REQ-ROUTE-3, REQ-ROUTE-5) */}
            <div className="space-y-4 rounded-xl border border-ink-200 bg-ink-50/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-700">
                Origin-Based Approval Routes (REQ-ROUTE-1..5)
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

              {/* IDS Route (Supports IDS Principal 1st and 2nd review, REQ-ROUTE-3) */}
              <div className="border-t border-ink-200/70 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-800">
                    IDS Route (Supports IDS Principal 1st & 2nd Review, REQ-ROUTE-3):
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

              {/* Higher Approval after Dean (REQ-ROUTE-5) */}
              <div className="border-t border-ink-200/70 pt-3">
                <p className="text-xs font-semibold text-ink-800">
                  Offices after College Dean when Higher Approval is marked (REQ-ROUTE-5):
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

            {/* Required Forms & Attachments Checklist (REQ-REQT-1, REQ-REQT-7) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-700">
                  Required Forms & Attachments Checklist (REQ-REQT-1, REQ-REQT-7)
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
                    placeholder="Where to get it (REQ-REQT-7), e.g., Registrar's Office, HRMO, or Download template above"
                    className="h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </form>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG 2: User Account Create / Edit & Role Assignment (REQ-AUTH-3)       */}
      {/* ========================================================================= */}
      <Dialog
        open={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title={editingUserId ? 'Edit User Account & Role' : 'Create Authorized User Account'}
        description="Assign roles and university email addresses (@msunaawan.edu.ph) for students, faculty, and reviewing offices (REQ-AUTH-3, REQ-AUTH-9)."
        busy={userBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsUserModalOpen(false)} disabled={userBusy}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} loading={userBusy} icon={Save}>
              {editingUserId ? 'Save Changes' : 'Create Account'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Field label="Full Name" required>
            <Input
              type="text"
              value={uName}
              onChange={(e) => setUName(e.target.value)}
              placeholder="e.g. Prof. Elena Gomez"
            />
          </Field>

          <Field
            label="MSU at Naawan University Email (REQ-AUTH-9)"
            required
            hint="Must end with @msunaawan.edu.ph. Used to sign in and receive alerts."
          >
            <Input
              type="email"
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
              placeholder="username@msunaawan.edu.ph"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assigned System Role (REQ-AUTH-2)" required>
              <Select value={uRole} onChange={(e) => setURole(e.target.value as Role)}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>

            {(uRole === 'student' || uRole === 'faculty') && (
              <Field label="Origin School / College (REQ-SUB-6)" required>
                <Select value={uOrigin} onChange={(e) => setUOrigin(e.target.value as Origin)}>
                  <option value="CESS">CESS (College of Education & Social Sciences)</option>
                  <option value="IDS">IDS (Integrated Development School)</option>
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department / Academic Program" required>
              <Input
                type="text"
                value={uDept}
                onChange={(e) => setUDept(e.target.value)}
                placeholder="e.g. Department of Social Sciences"
              />
            </Field>
            <Field label="Official Position / Title" required>
              <Input
                type="text"
                value={uPos}
                onChange={(e) => setUPos(e.target.value)}
                placeholder="e.g. Assistant Professor"
              />
            </Field>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
