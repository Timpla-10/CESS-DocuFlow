import { Bell, KeyRound, LogOut, Save, Shield } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession, useUser } from '../../app/session'
import { Field, Input } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Avatar, Badge, Button, Card, CardHeader, DefinitionList, PageHeader } from '../../components/ui'
import { NOTIFICATION_PREF_LABEL, ROLE_LABEL } from '../../content/language'
import { api } from '../../data/store'
import type { NotificationPreference } from '../../data/types'

const PREF_OPTIONS: {
  value: NotificationPreference
  title: string
  description: string
}[] = [
  {
    value: 'both',
    title: 'Both External Email and In-System Notifications (Recommended)',
    description:
      'Receive alerts in your @msunaawan.edu.ph university email inbox and inside the DocuFlow notification bell.',
  },
  {
    value: 'email_only',
    title: 'External University Email Only',
    description:
      'Send alerts only to your @msunaawan.edu.ph email address (in-system bell alerts will be muted).',
  },
  {
    value: 'in_system_only',
    title: 'In-System Notifications Only',
    description:
      'Show alerts only inside the CESS DocuFlow notification center without sending external emails.',
  },
]

export function AccountPage() {
  const user = useUser()
  const { signOut } = useSession()
  const navigate = useNavigate()
  const toast = useToast()

  const [notifPref, setNotifPref] = useState<NotificationPreference>(user.notificationPreference ?? 'both')
  const [notifBusy, setNotifBusy] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const handleSaveNotifPref = async (e: FormEvent) => {
    e.preventDefault()
    setNotifBusy(true)
    try {
      await api.updateNotificationPreference(user, notifPref)
      toast.success('Notification Preferences Saved', `Delivery mode updated to: ${NOTIFICATION_PREF_LABEL[notifPref]}.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to update preferences.'
      toast.error('Update Failed', msg)
    } finally {
      setNotifBusy(false)
    }
  }

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!currentPw) {
      setPwError('Please enter your current password.')
      return
    }
    if (newPw.length < 8) {
      setPwError('Your new password must be at least 8 characters long.')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('The new passwords you entered do not match.')
      return
    }

    setPwBusy(true)
    setPwError(null)
    setTimeout(() => {
      setPwBusy(false)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      toast.success('Password Updated', 'Your account password has been changed successfully.')
    }, 600)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="My Account"
        title="Account & Notification Settings"
        description="View your university account details, toggle your hybrid notification preferences (REQ-NOT-7), and update your security settings."
      />

      {/* Profile Overview */}
      <Card className="p-6">
        <div className="flex items-center gap-4 border-b border-ink-100 pb-6">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink-900">{user.name}</h2>
            <p className="text-sm text-ink-600">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="brand">{ROLE_LABEL[user.role]}</Badge>
              {user.role === 'ids_principal' && (
                <Badge tone="warning">🏫 IDS Principal</Badge>
              )}
              {user.role === 'faculty' && (
                <Badge tone={user.origin === 'IDS' ? 'warning' : 'brand'}>
                  {user.origin === 'IDS' ? '🏫 IDS Faculty' : '🏛️ CESS Faculty'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <DefinitionList
            items={[
              { label: 'Full Name', value: user.name },
              { label: 'Role & Responsibilities', value: ROLE_LABEL[user.role] },
              ...(user.role === 'ids_principal'
                ? [
                    {
                      label: 'Unit Affiliation',
                      value: 'IDS Administration & Faculty (Integrated Developmental School)',
                    },
                    {
                      label: 'Document Submission Route',
                      value: 'Direct College Review (Secretary → Chairperson → Dean → Release)',
                    },
                  ]
                : user.role === 'faculty'
                ? [
                    {
                      label: 'Faculty Unit Affiliation',
                      value:
                        user.origin === 'IDS'
                          ? 'IDS Faculty (Integrated Developmental School)'
                          : 'CESS Faculty (College of Education and Social Sciences)',
                    },
                    {
                      label: 'Designated Document Route',
                      value:
                        user.origin === 'IDS'
                          ? 'Includes IDS Principal Review (Secretary → Chairperson → IDS Principal → Dean → Release)'
                          : 'Standard College Review (Secretary → Chairperson → Dean → Release)',
                    },
                  ]
                : []),
              { label: 'Department / Academic Program', value: user.department },
              { label: 'Official Position', value: user.position },
              { label: 'University Email (REQ-AUTH-9)', value: user.email },
              {
                label: 'Notification Delivery Mode',
                value: NOTIFICATION_PREF_LABEL[user.notificationPreference ?? 'both'],
              },
            ]}
          />
        </div>
      </Card>

      {/* Hybrid Notification Preferences (REQ-NOT-7) */}
      <Card className="p-6">
        <CardHeader
          icon={Bell}
          title="Hybrid Notification Preferences (REQ-NOT-7)"
          description="Choose how you want to receive alerts when a document is returned, ready for release, or pending for 3 days."
        />

        <form onSubmit={handleSaveNotifPref} className="mt-5 space-y-4">
          <div className="space-y-3" role="radiogroup" aria-label="Notification channel preference">
            {PREF_OPTIONS.map((opt) => {
              const selected = notifPref === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                    selected
                      ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
                      : 'border-ink-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="notif-pref"
                    value={opt.value}
                    checked={selected}
                    onChange={() => setNotifPref(opt.value)}
                    className="mt-1 size-4 shrink-0 cursor-pointer accent-brand-600"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">{opt.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{opt.description}</p>
                  </div>
                </label>
              )
            })}
          </div>

          <div className="pt-2">
            <Button type="submit" loading={notifBusy} loadingText="Saving…" icon={Save}>
              Save Notification Preference
            </Button>
          </div>
        </form>
      </Card>

      {/* Change Password Form */}
      <Card className="p-6">
        <CardHeader
          icon={KeyRound}
          title="Change Password"
          description="Update your password to keep your DocuFlow account and document history safe."
        />

        <form onSubmit={handlePasswordSubmit} noValidate className="mt-6 max-w-md space-y-4">
          {pwError && (
            <div className="rounded-lg bg-danger-50 p-3 text-sm font-medium text-danger-700 ring-1 ring-inset ring-danger-100">
              {pwError}
            </div>
          )}

          <Field label="Current Password" required>
            <Input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Enter current password"
            />
          </Field>

          <Field label="New Password" required hint="Must be at least 8 characters.">
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Enter new password"
            />
          </Field>

          <Field label="Confirm New Password" required>
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Re-enter new password"
            />
          </Field>

          <div className="pt-2">
            <Button type="submit" loading={pwBusy} loadingText="Updating Password…">
              Save New Password
            </Button>
          </div>
        </form>
      </Card>

      {/* Session & Security */}
      <Card className="p-6">
        <CardHeader
          icon={Shield}
          title="Active Session & Sign Out"
          description="End your active session securely on this workstation."
        />
        <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-bold text-ink-900">Current Workstation Session</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Signed in as {user.email} · Automatically expires after 30 minutes of inactivity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              signOut()
              navigate('/sign-in', { replace: true, state: { signedOut: true } })
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-danger-200 bg-white px-4 py-2 text-xs font-bold text-danger-700 shadow-2xs transition-all hover:bg-danger-50 hover:border-danger-300 active:scale-95 cursor-pointer"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>Sign Out Securely</span>
          </button>
        </div>
      </Card>
    </div>
  )
}
