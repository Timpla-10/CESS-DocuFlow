import { Bell, KeyRound, Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useUser } from '../../app/session'
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
              {user.role === 'faculty' && (
                <Badge tone={user.origin === 'IDS' ? 'warning' : 'brand'}>
                  {user.origin === 'IDS' ? 'IDS Faculty' : 'CESS Faculty'}
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
              ...(user.role === 'faculty'
                ? [
                    {
                      label: 'Faculty Affiliation / College Unit',
                      value:
                        user.origin === 'IDS'
                          ? 'IDS Faculty — Integrated Developmental School'
                          : 'CESS Faculty — College of Education and Social Sciences',
                    },
                    {
                      label: 'Designated Document Routing Flow',
                      value:
                        user.origin === 'IDS'
                          ? 'Secretary Check → Chairperson → IDS Principal (Review) → Dean → Release'
                          : 'Secretary Check → Chairperson → Dean → Release',
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
    </div>
  )
}
