import {
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Search,
  ShieldAlert,
  Trash2,
  UploadCloud,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useUser } from '../../app/session'
import { Dialog } from '../../components/Dialog'
import { Field, Input, Select } from '../../components/form'
import { useToast } from '../../components/Toast'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Segmented, cn } from '../../components/ui'
import { ROLE_LABEL } from '../../content/language'
import { api, useDb } from '../../data/store'
import type { NotificationPreference, Origin, PendingRegistration, Role, User, WhitelistEntry } from '../../data/types'
import { formatDate } from '../../lib/time'

const ALL_ROLES: Role[] = ['student', 'faculty', 'secretary', 'chairperson', 'ids_principal', 'dean', 'ovcaa', 'vcaf', 'chancellor']

interface ParsedRow {
  idNumber: string
  name: string
  email: string
  role: 'student' | 'faculty' | 'chairperson' | 'dean' | 'ids_principal'
  department: string
  origin: Origin
  valid: boolean
  error?: string
}

export function UserManagementPage() {
  const currentUser = useUser()
  const db = useDb()
  const toast = useToast()

  // Active Tab: 'users' | 'masterlist' | 'pending'
  const [activeTab, setActiveTab] = useState<'users' | 'masterlist' | 'pending'>('users')

  // ---------------------------------------------------------------------------
  // TAB 1: User Directory State & Filters
  // ---------------------------------------------------------------------------
  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [originFilter, setOriginFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // User Create / Edit Dialog State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | undefined>(undefined)
  const [uName, setUName] = useState('')
  const [uEmail, setUEmail] = useState('')
  const [uRole, setURole] = useState<Role>('student')
  const [uOrigin, setUOrigin] = useState<Origin>('CESS')
  const [uDept, setUDept] = useState('')
  const [uPos, setUPos] = useState('')
  const [uNotifPref, setUNotifPref] = useState<NotificationPreference>('both')
  const [userBusy, setUserBusy] = useState(false)
  const [userErrors, setUserErrors] = useState<Record<string, string>>({})

  // ---------------------------------------------------------------------------
  // TAB 2: Masterlist & Whitelist Import State
  // ---------------------------------------------------------------------------
  const [importTargetRole, setImportTargetRole] = useState<'student' | 'faculty'>('student')
  const [importTerm, setImportTerm] = useState('1st Sem AY 2026-2027')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const [whitelistSearch, setWhitelistSearch] = useState('')
  const [whitelistRoleFilter, setWhitelistRoleFilter] = useState('all')

  // ---------------------------------------------------------------------------
  // TAB 3: Pending Approvals & Rejection Dialog State
  // ---------------------------------------------------------------------------
  const [approveDialogReg, setApproveDialogReg] = useState<PendingRegistration | null>(null)
  const [appRole, setAppRole] = useState<Role>('student')
  const [appDept, setAppDept] = useState('')
  const [appOrigin, setAppOrigin] = useState<Origin>('CESS')
  const [approveBusy, setApproveBusy] = useState(false)

  const [rejectDialogReg, setRejectDialogReg] = useState<PendingRegistration | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)
  const [rejectError, setRejectError] = useState<string>('')

  // ---------------------------------------------------------------------------
  // Derived Data
  // ---------------------------------------------------------------------------
  const filteredUsers = useMemo(() => {
    return db.users.filter((u) => {
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase()
        const matches =
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q) ||
          u.position.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (originFilter !== 'all' && (u.origin ?? 'CESS') !== originFilter) return false
      if (statusFilter === 'active' && !u.active) return false
      if (statusFilter === 'deactivated' && u.active) return false
      return true
    })
  }, [db.users, userSearch, roleFilter, originFilter, statusFilter])

  const filteredWhitelist = useMemo(() => {
    const list = db.whitelist ?? []
    return list.filter((w) => {
      if (whitelistSearch.trim()) {
        const q = whitelistSearch.toLowerCase()
        const matches =
          w.name.toLowerCase().includes(q) ||
          w.email.toLowerCase().includes(q) ||
          w.idNumber.toLowerCase().includes(q) ||
          w.department.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (whitelistRoleFilter !== 'all' && w.role !== whitelistRoleFilter) return false
      return true
    })
  }, [db.whitelist, whitelistSearch, whitelistRoleFilter])

  const pendingRegistrations = useMemo(() => {
    return (db.pendingRegistrations ?? []).filter((p) => p.status === 'pending')
  }, [db.pendingRegistrations])

  // Metric counts
  const totalUsers = db.users.length
  const activeUsersCount = db.users.filter((u) => u.active).length
  const whitelistCount = (db.whitelist ?? []).length
  const pendingCount = pendingRegistrations.length

  // ---------------------------------------------------------------------------
  // Handlers: User Directory
  // ---------------------------------------------------------------------------
  const openCreateUser = () => {
    setEditingUserId(undefined)
    setUName('')
    setUEmail('')
    setURole('student')
    setUOrigin('CESS')
    setUDept('BSEd English')
    setUPos('Student')
    setUNotifPref('both')
    setUserErrors({})
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
    setUNotifPref(u.notificationPreference ?? 'both')
    setUserErrors({})
    setIsUserModalOpen(true)
  }

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!uName.trim()) {
      errors.name = 'Full name is required.'
    }
    const trimmedEmail = uEmail.trim().toLowerCase()
    if (!trimmedEmail) {
      errors.email = 'Institutional email is required.'
    } else if (!trimmedEmail.endsWith('@msunaawan.edu.ph')) {
      errors.email = 'Email must end with @msunaawan.edu.ph.'
    }
    if (!uDept.trim()) {
      errors.department = 'Department or academic program is required.'
    }
    if (!uPos.trim()) {
      errors.position = 'Position or designation is required.'
    }

    if (Object.keys(errors).length > 0) {
      setUserErrors(errors)
      toast.error('Validation Error', 'Please correct the highlighted fields before saving.')
      return
    }

    setUserErrors({})
    setUserBusy(true)
    try {
      await api.saveUserAccount(currentUser, {
        id: editingUserId,
        name: uName.trim(),
        email: trimmedEmail,
        role: uRole,
        origin: uRole === 'student' || uRole === 'faculty' ? uOrigin : undefined,
        department: uDept.trim(),
        position: uPos.trim(),
        notificationPreference: uNotifPref,
      })
      toast.success(
        editingUserId ? 'Account Updated' : 'Account Created',
        `Successfully saved account for ${uName.trim()} (${ROLE_LABEL[uRole]}).`,
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
      await api.setUserActive(currentUser, targetUserId, !currentActive)
      toast.success(
        !currentActive ? 'Account Activated' : 'Account Deactivated',
        !currentActive ? 'User can now sign in.' : 'User will be denied access upon next login.',
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed.'
      toast.error('Action Failed', msg)
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers: Masterlist CSV File Upload & Parsing
  // ---------------------------------------------------------------------------
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return
      parseCsv(text, importTargetRole)
    }
    reader.readAsText(file)
  }

  const parseCsv = (csvText: string, targetRole: 'student' | 'faculty') => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length <= 1) {
      toast.error('Empty File', 'The uploaded CSV file does not contain any data rows.')
      setParsedRows([])
      return
    }

    const rows: ParsedRow[] = []

    // Skip header line (index 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // Split by comma while respecting quotes
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^"|"$/g, '').trim())

      if (parts.length < 3) continue

      const idNumber = parts[0] || `REC-${i}`
      const name = parts[1] || ''
      const email = parts[2]?.toLowerCase() || ''
      const department = parts[3] || (targetRole === 'student' ? 'College of Education' : 'Faculty Member')
      const rawOrigin = parts[4]?.toUpperCase()
      const origin: Origin = rawOrigin === 'IDS' ? 'IDS' : 'CESS'

      let valid = true
      let error = ''

      if (!name) {
        valid = false
        error = 'Missing full name'
      } else if (!email.endsWith('@msunaawan.edu.ph')) {
        valid = false
        error = 'Email must be @msunaawan.edu.ph'
      }

      rows.push({
        idNumber,
        name,
        email,
        role: targetRole,
        department,
        origin,
        valid,
        error,
      })
    }

    setParsedRows(rows)
    toast.info('File Parsed', `Found ${rows.length} rows (${rows.filter((r) => r.valid).length} valid).`)
  }

  const handleCommitImport = async () => {
    const validRows = parsedRows.filter((r) => r.valid)
    if (!validRows.length) {
      toast.error('No Valid Entries', 'There are no valid rows to import into the whitelist.')
      return
    }

    setImportBusy(true)
    try {
      const res = await api.importWhitelist(
        currentUser,
        validRows.map((r) => ({
          idNumber: r.idNumber,
          name: r.name,
          email: r.email,
          role: r.role,
          department: r.department,
          origin: r.origin,
        })),
        importTerm,
      )

      toast.success(
        'Whitelist Imported',
        `Imported ${res.added} new records and updated ${res.updated} existing whitelist entries for ${importTerm}.`,
      )
      setParsedRows([])
      setFileName('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed.'
      toast.error('Import Failed', msg)
    } finally {
      setImportBusy(false)
    }
  }

  const handleDownloadSample = (type: 'cess_student' | 'ids_student' | 'faculty') => {
    let content = ''
    let dlName = ''

    if (type === 'cess_student') {
      content = `ID Number,Full Name,Institutional Email,Department,Unit
2023101,Clara Mae Mendoza,clara.mendoza@msunaawan.edu.ph,BSEd English,CESS
2023102,Joshua David Tan,joshua.tan@msunaawan.edu.ph,BEEd General Curriculum,CESS
2023104,Arvin Ramos,arvin.ramos@msunaawan.edu.ph,BA Social Sciences,CESS
2024015,Althea Mae Soriano,althea.soriano@msunaawan.edu.ph,BSEd Filipino,CESS
2024089,Kenneth Bryan Garcia,kenneth.garcia@msunaawan.edu.ph,BEEd General Curriculum,CESS
2022340,Christian Jay Mercado,christian.mercado@msunaawan.edu.ph,BSEd Social Studies,CESS
2024112,Princess Diane Gomez,princess.gomez@msunaawan.edu.ph,BSEd English,CESS
2023205,Mark Anthony Villanueva,mark.villanueva@msunaawan.edu.ph,BA Social Sciences,CESS
2024156,Bea Nicole Castro,bea.castro@msunaawan.edu.ph,BSEd Mathematics,CESS
2023308,Lance Patrick Navarro,lance.navarro@msunaawan.edu.ph,BSEd Science,CESS`
      dlName = 'MSUN_CESS_Student_Masterlist_Sample.csv'
    } else if (type === 'ids_student') {
      content = `ID Number,Full Name,Institutional Email,Department,Unit
2024501,Samantha Cruz,samantha.cruz@msunaawan.edu.ph,IDS Grade 12 - STEM,IDS
2024502,Danica Nicole Perez,danica.perez@msunaawan.edu.ph,IDS Grade 12 - HUMSS,IDS
2024503,Miguel Luis Reyes,miguel.reyes@msunaawan.edu.ph,IDS Grade 11 - STEM,IDS
2024504,Kristine Joy Torres,kristine.torres@msunaawan.edu.ph,IDS Grade 11 - HUMSS,IDS
2024505,Angelo Gabriel Aquino,angelo.aquino@msunaawan.edu.ph,IDS Grade 10 - JHS,IDS
2024506,Hannah Mae Delos Reyes,hannah.delosreyes@msunaawan.edu.ph,IDS Grade 10 - JHS,IDS
2024507,Justin Carlo Bautista,justin.bautista@msunaawan.edu.ph,IDS Grade 9 - JHS,IDS
2024508,Sofia Isabelle Lim,sofia.lim@msunaawan.edu.ph,IDS Grade 8 - JHS,IDS
2024509,Ethan James Salvador,ethan.salvador@msunaawan.edu.ph,IDS Grade 7 - JHS,IDS
2024510,Chloe Denise Vergara,chloe.vergara@msunaawan.edu.ph,IDS Grade 7 - JHS,IDS`
      dlName = 'MSUN_IDS_Student_Masterlist_Sample.csv'
    } else {
      content = `Employee ID,Full Name,Institutional Email,Department,Unit,Position
1018042,Dr. Elena Bautista,elena.bautista@msunaawan.edu.ph,Department of Secondary and Elementary Education,CESS,Associate Professor
1020119,Mr. Gabriel Santos,gabriel.santos@msunaawan.edu.ph,Integrated Developmental School,IDS,Teacher II
1015083,Dr. Corazon Morales,corazon.morales@msunaawan.edu.ph,Department of Social Sciences and Humanities,CESS,Professor
1024003,Prof. Rhea Mendez,rhea.mendez@msunaawan.edu.ph,Department of Secondary and Elementary Education,CESS,Assistant Professor
1025018,Engr. Daniel Ocampo,daniel.ocampo@msunaawan.edu.ph,Integrated Developmental School,IDS,Instructor
1026002,Ms. Fatima Joy Alvarez,fatima.alvarez@msunaawan.edu.ph,Integrated Developmental School,IDS,Teacher I
1019011,Prof. Ana Lim,ana.lim@msunaawan.edu.ph,Department of Secondary and Elementary Education,CESS,Assistant Professor
1021045,Prof. Ben Aquino,ben.aquino@msunaawan.edu.ph,Department of Social Sciences and Humanities,CESS,Instructor
1018092,Mr. Jose Dela Cruz,jose.delacruz@msunaawan.edu.ph,Integrated Developmental School,IDS,Teacher III`
      dlName = 'MSUN_Faculty_Roster_Sample.csv'
    }

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', dlName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.info('Sample Downloaded', `Downloaded template: ${dlName}`)
  }

  const handleDeleteWhitelist = async (entry: WhitelistEntry) => {
    if (!window.confirm(`Remove ${entry.name} (${entry.email}) from the whitelist?`)) return
    try {
      await api.deleteWhitelistEntry(currentUser, entry.id)
      toast.info('Whitelist Entry Removed', `${entry.name} was removed from the whitelist.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to delete.'
      toast.error('Delete Failed', msg)
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers: Pending Approvals & Rejections
  // ---------------------------------------------------------------------------
  const openApproveModal = (reg: PendingRegistration) => {
    setApproveDialogReg(reg)
    setAppRole(reg.requestedRole)
    setAppDept(reg.department)
    setAppOrigin(reg.origin ?? 'CESS')
  }

  const handleConfirmApproval = async () => {
    if (!approveDialogReg) return
    setApproveBusy(true)
    try {
      const created = await api.approvePendingRegistration(currentUser, approveDialogReg.id, {
        role: appRole,
        department: appDept,
        origin: appRole === 'student' || appRole === 'faculty' ? appOrigin : undefined,
      })
      toast.success(
        'Account Approved & Verified',
        `User ${created.name} (${ROLE_LABEL[created.role]}) is now verified and active.`,
      )
      setApproveDialogReg(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed.'
      toast.error('Approval Failed', msg)
    } finally {
      setApproveBusy(false)
    }
  }

  const openRejectModal = (reg: PendingRegistration) => {
    setRejectDialogReg(reg)
    setRejectReason('Student/employee record not found in official CESS semester enrollment records.')
    setRejectError('')
  }

  const handleConfirmRejection = async () => {
    if (!rejectDialogReg) return
    if (!rejectReason.trim()) {
      setRejectError('Please provide a reason for rejecting this registration.')
      toast.error('Reason Required', 'A reason is required to reject the registration request.')
      return
    }
    setRejectError('')
    setRejectBusy(true)
    try {
      await api.rejectPendingRegistration(currentUser, rejectDialogReg.id, rejectReason.trim())
      toast.info('Registration Rejected', `Registration for ${rejectDialogReg.name} was rejected.`)
      setRejectDialogReg(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed.'
      toast.error('Action Failed', msg)
    } finally {
      setRejectBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="System Administration (College Secretary)"
        title="User Management & Whitelist Masterlists"
        description="Manage registered student and faculty accounts, import semester enrollment masterlists for instant authorization, and review unlisted account requests."
      />

      {/* Metric Highlights Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Registered Accounts</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink-900">{totalUsers}</span>
                <span className="text-xs text-ink-500 font-medium">({activeUsersCount} active)</span>
              </div>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Users className="size-5" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Pre-Loaded Whitelist</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink-900">{whitelistCount}</span>
                <span className="text-xs text-ink-500 font-medium">official roster records</span>
              </div>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <FileSpreadsheet className="size-5" />
            </div>
          </div>
        </Card>

        <Card className={cn('p-5 transition-all', pendingCount > 0 ? 'border-warning-300 bg-warning-50/20' : '')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Pending Verifications</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink-900">{pendingCount}</span>
                <span className="text-xs text-ink-500 font-medium">
                  {pendingCount === 1 ? 'applicant waiting' : 'applicants waiting'}
                </span>
              </div>
            </div>
            <div
              className={cn(
                'flex size-11 items-center justify-center rounded-xl',
                pendingCount > 0 ? 'bg-warning-100 text-warning-800' : 'bg-ink-100 text-ink-500',
              )}
            >
              <ShieldAlert className="size-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Tabs Segmented Control */}
      <div className="border-b border-ink-200 pb-3">
        <Segmented<'users' | 'masterlist' | 'pending'>
          value={activeTab}
          onChange={setActiveTab}
          label="User Management Tabs"
          options={[
            {
              value: 'users',
              label: 'Active User Directory',
              icon: Users,
              count: totalUsers,
            },
            {
              value: 'masterlist',
              label: 'Masterlist & Whitelist Import',
              icon: FileSpreadsheet,
              count: whitelistCount,
            },
            {
              value: 'pending',
              label: 'Pending Verifications',
              icon: ShieldAlert,
              count: pendingCount,
            },
          ]}
        />
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ACTIVE USER DIRECTORY                                              */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <Card>
          <CardHeader
            icon={Users}
            title="Authorized User Accounts & Role Assignments"
            description="View, edit roles, and toggle access for all university accounts (@msunaawan.edu.ph)."
            action={
              <Button size="sm" icon={UserPlus} onClick={openCreateUser}>
                Create User Account
              </Button>
            }
          />

          {/* Filter Bar */}
          <div className="border-b border-ink-100 bg-ink-50/50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  placeholder="Search name, email, department..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <Select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="all">All Roles ({db.users.length})</option>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="all">All Units (CESS & IDS)</option>
                  <option value="CESS">CESS Main Campus</option>
                  <option value="IDS">Integrated Developmental School (IDS)</option>
                </Select>
              </div>

              <div>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="all">All Account Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="deactivated">Deactivated Only</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  <th className="px-5 py-3.5 min-w-[200px]">Name & Department</th>
                  <th className="px-5 py-3.5 min-w-[180px]">Role & Origin</th>
                  <th className="px-5 py-3.5 min-w-[200px]">University Email</th>
                  <th className="px-5 py-3.5 min-w-[120px]">Status</th>
                  <th className="px-5 py-3.5 min-w-[200px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-xs text-ink-500">
                      No user accounts match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-brand-50/40">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-ink-900">{u.name}</div>
                        <div className="mt-0.5 text-xs text-ink-500">{u.department}</div>
                      </td>
                      <td className="px-5 py-3.5 text-ink-700">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink-800">{ROLE_LABEL[u.role]}</span>
                          {u.origin && <Badge tone="neutral">{u.origin}</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                          <span>{u.position}</span>
                          <span>·</span>
                          <span className="font-medium text-ink-600">
                            {u.notificationPreference === 'email_only'
                              ? '📧 Email Only'
                              : u.notificationPreference === 'in_system_only'
                              ? '🔔 In-System Only'
                              : '🔔+📧 Both'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-ink-600">{u.email}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {u.active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" icon={Edit3} onClick={() => openEditUser(u)}>
                            Edit / Role
                          </Button>
                          {u.id !== currentUser.id && (
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MASTERLIST & WHITELIST IMPORT                                      */}
      {/* ========================================================================= */}
      {activeTab === 'masterlist' && (
        <div className="space-y-6">
          {/* Upload Card */}
          <Card>
            <CardHeader
              icon={UploadCloud}
              title="Import Official Semester Masterlist (CSV / Excel)"
              description="Upload enrolled students or faculty rosters. Whitelisted individuals are pre-authorized and activate instantly when signing in."
            />
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-800">Masterlist Type</label>
                  <Select
                    value={importTargetRole}
                    onChange={(e) => setImportTargetRole(e.target.value as 'student' | 'faculty')}
                    className="h-10 text-sm"
                  >
                    <option value="student">Enrolled Students Masterlist</option>
                    <option value="faculty">Faculty & Academic Staff Roster</option>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-800">Academic Term</label>
                  <input
                    type="text"
                    value={importTerm}
                    onChange={(e) => setImportTerm(e.target.value)}
                    placeholder="e.g. 1st Sem AY 2026-2027"
                    className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="mb-1 block text-xs font-semibold text-ink-700">Sample Templates (7-Digit IDs)</label>
                  <div className="flex gap-2">
                    {importTargetRole === 'student' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Download}
                          onClick={() => handleDownloadSample('cess_student')}
                          className="flex-1 text-xs"
                          title="Download sample CESS College Students CSV"
                        >
                          CESS Students
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Download}
                          onClick={() => handleDownloadSample('ids_student')}
                          className="flex-1 text-xs"
                          title="Download sample IDS High School Students CSV"
                        >
                          IDS Students
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Download}
                        onClick={() => handleDownloadSample('faculty')}
                        className="w-full text-xs"
                        title="Download sample Faculty & Staff CSV"
                      >
                        Faculty Roster CSV
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/40 p-6 text-center hover:border-brand-400 hover:bg-brand-50/20 transition-all">
                <input
                  type="file"
                  id="masterlist-upload"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="masterlist-upload" className="cursor-pointer">
                  <UploadCloud className="mx-auto size-9 text-brand-600 mb-2" />
                  <p className="text-sm font-semibold text-ink-800">
                    {fileName ? `Selected: ${fileName}` : 'Click to select or drag & drop semester CSV file'}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    Expected columns: ID Number (strictly 7 numeric digits), Full Name, Institutional Email (@msunaawan.edu.ph), Department, Unit (CESS or IDS)
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-3 text-xs text-brand-700">
                    <span className="text-ink-400">Download templates:</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownloadSample('cess_student')
                      }}
                      className="underline hover:text-brand-900 font-medium"
                    >
                      CESS Students
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownloadSample('ids_student')
                      }}
                      className="underline hover:text-brand-900 font-medium"
                    >
                      IDS Students
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownloadSample('faculty')
                      }}
                      className="underline hover:text-brand-900 font-medium"
                    >
                      Faculty Roster
                    </button>
                  </div>
                </label>
              </div>

              {/* Parsed Rows Preview */}
              {parsedRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-ink-900">
                        File Preview ({parsedRows.filter((r) => r.valid).length} valid of {parsedRows.length} rows)
                      </h4>
                      <p className="text-xs text-ink-500">
                        Review the records below before committing them to the official whitelist.
                      </p>
                    </div>
                    <Button
                      onClick={handleCommitImport}
                      loading={importBusy}
                      icon={CheckCircle2}
                      disabled={parsedRows.filter((r) => r.valid).length === 0}
                    >
                      Confirm & Import to Whitelist
                    </Button>
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-lg border border-ink-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-ink-50 sticky top-0 border-b border-ink-200 font-semibold text-ink-600">
                        <tr>
                          <th className="px-4 py-2">ID Number</th>
                          <th className="px-4 py-2">Full Name</th>
                          <th className="px-4 py-2">Email</th>
                          <th className="px-4 py-2">Department</th>
                          <th className="px-4 py-2">Unit</th>
                          <th className="px-4 py-2">Validation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {parsedRows.map((r, idx) => (
                          <tr key={idx} className={r.valid ? '' : 'bg-danger-50/40'}>
                            <td className="px-4 py-2 font-mono">{r.idNumber}</td>
                            <td className="px-4 py-2 font-medium text-ink-900">{r.name}</td>
                            <td className="px-4 py-2 font-mono">{r.email}</td>
                            <td className="px-4 py-2 text-ink-700">{r.department}</td>
                            <td className="px-4 py-2">
                              <Badge tone="neutral">{r.origin}</Badge>
                            </td>
                            <td className="px-4 py-2">
                              {r.valid ? (
                                <Badge tone="success">Ready</Badge>
                              ) : (
                                <Badge tone="danger">{r.error || 'Invalid'}</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Current Whitelist Table */}
          <Card>
            <CardHeader
              icon={FileSpreadsheet}
              title="Current Whitelisted Individuals"
              description="Pre-authorized institutional records that activate automatically when the student or faculty member signs up."
            />

            {/* Filter Bar */}
            <div className="border-b border-ink-100 bg-ink-50/50 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    placeholder="Search by ID, name, email..."
                    value={whitelistSearch}
                    onChange={(e) => setWhitelistSearch(e.target.value)}
                    className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <Select
                    value={whitelistRoleFilter}
                    onChange={(e) => setWhitelistRoleFilter(e.target.value)}
                    className="h-9 text-xs"
                  >
                    <option value="all">All Roles</option>
                    <option value="student">Students</option>
                    <option value="faculty">Faculty</option>
                  </Select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3.5 min-w-[140px]">ID Number</th>
                    <th className="px-5 py-3.5 min-w-[200px]">Name & Department</th>
                    <th className="px-5 py-3.5 min-w-[140px]">Role & Unit</th>
                    <th className="px-5 py-3.5 min-w-[180px]">Institutional Email</th>
                    <th className="px-5 py-3.5 min-w-[140px]">Term</th>
                    <th className="px-5 py-3.5 min-w-[140px]">Status</th>
                    <th className="px-5 py-3.5 min-w-[100px] text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredWhitelist.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-xs text-ink-500">
                        No whitelist entries found. Import an official CSV masterlist above to get started.
                      </td>
                    </tr>
                  ) : (
                    filteredWhitelist.map((w) => (
                      <tr key={w.id} className="hover:bg-brand-50/40">
                        <td className="px-5 py-3.5 font-mono text-xs font-semibold text-ink-800">{w.idNumber}</td>
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-ink-900">{w.name}</div>
                          <div className="text-xs text-ink-500">{w.department}</div>
                        </td>
                        <td className="px-5 py-3.5 text-ink-700">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-xs text-ink-900">{ROLE_LABEL[w.role]}</span>
                            {w.origin && <Badge tone="neutral">{w.origin}</Badge>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-ink-600">{w.email}</td>
                        <td className="px-5 py-3.5 text-xs text-ink-600">{w.term}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {w.status === 'activated' ? (
                            <Badge tone="success">Activated (Signed In)</Badge>
                          ) : (
                            <Badge tone="neutral">Pre-Registered</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            onClick={() => handleDeleteWhitelist(w)}
                            aria-label={`Remove ${w.name}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PENDING VERIFICATIONS (UNLISTED APPLICANTS)                        */}
      {/* ========================================================================= */}
      {activeTab === 'pending' && (
        <Card>
          <CardHeader
            icon={ShieldAlert}
            title="Pending Account Verifications"
            description="Students, transferees, or new faculty members whose emails were not in the imported semester masterlist and require manual review."
          />

          {pendingRegistrations.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={CheckCircle2} title="All Registrations Verified">
                There are currently no pending registration requests awaiting College Secretary review.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3.5 min-w-[200px]">Applicant & Submitted ID</th>
                    <th className="px-5 py-3.5 min-w-[180px]">Requested Role & Unit</th>
                    <th className="px-5 py-3.5 min-w-[200px]">Institutional Email</th>
                    <th className="px-5 py-3.5 min-w-[140px]">Date Submitted</th>
                    <th className="px-5 py-3.5 min-w-[200px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {pendingRegistrations.map((p) => (
                    <tr key={p.id} className="hover:bg-warning-50/30">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-ink-900">{p.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-ink-500">
                          {p.idNumber ? `ID: ${p.idNumber}` : 'No ID specified'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-ink-700">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink-800">{ROLE_LABEL[p.requestedRole]}</span>
                          {p.origin && <Badge tone="neutral">{p.origin}</Badge>}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-500">{p.department}</div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-ink-600">{p.email}</td>
                      <td className="px-5 py-4 text-xs text-ink-500 whitespace-nowrap">
                        {formatDate(p.submittedAt)}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" icon={UserCheck} onClick={() => openApproveModal(p)}>
                            Approve & Activate
                          </Button>
                          <Button size="sm" variant="danger-soft" icon={X} onClick={() => openRejectModal(p)}>
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ========================================================================= */}
      {/* DIALOG: CREATE / EDIT USER ACCOUNT                                        */}
      {/* ========================================================================= */}
      <Dialog
        open={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        size="lg"
        title={editingUserId ? 'Edit User Account & Role' : 'Create User Account'}
        description="Configure university email, assign official roles, and designate CESS or IDS origin."
        busy={userBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsUserModalOpen(false)} disabled={userBusy}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} loading={userBusy} icon={UserPlus}>
              {editingUserId ? 'Save Account Changes' : 'Create Account'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveUser} className="space-y-5">
          <Field label="Full Name" required error={userErrors.name}>
            <Input
              value={uName}
              onChange={(e) => {
                setUName(e.target.value)
                if (userErrors.name) setUserErrors((prev) => ({ ...prev, name: '' }))
              }}
              placeholder="e.g. Maria Santos or Dr. Jose Cruz"
              required
            />
          </Field>

          <Field label="University Email (@msunaawan.edu.ph)" required error={userErrors.email}>
            <Input
              type="email"
              value={uEmail}
              onChange={(e) => {
                setUEmail(e.target.value)
                if (userErrors.email) setUserErrors((prev) => ({ ...prev, email: '' }))
              }}
              placeholder="username@msunaawan.edu.ph"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-5">
            <Field label="Official Role" required>
              <Select value={uRole} onChange={(e) => setURole(e.target.value as Role)}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>

            {(uRole === 'student' || uRole === 'faculty') && (
              <Field label="Unit / Origin" hint="Designate campus affiliation for document routing." required>
                <Select value={uOrigin} onChange={(e) => setUOrigin(e.target.value as Origin)}>
                  <option value="CESS">CESS Main Campus</option>
                  <option value="IDS">Integrated Developmental School (IDS)</option>
                </Select>
              </Field>
            )}
          </div>

          <Field label="Department / Program" required error={userErrors.department}>
            <Input
              value={uDept}
              onChange={(e) => {
                setUDept(e.target.value)
                if (userErrors.department) setUserErrors((prev) => ({ ...prev, department: '' }))
              }}
              placeholder="e.g. BSEd English, DSEE, or IDS Science"
              required
            />
          </Field>

          <Field label="Position / Designation" required error={userErrors.position}>
            <Input
              value={uPos}
              onChange={(e) => {
                setUPos(e.target.value)
                if (userErrors.position) setUserErrors((prev) => ({ ...prev, position: '' }))
              }}
              placeholder="e.g. Student, Assistant Professor, Instructor"
              required
            />
          </Field>

          <Field label="Notification Delivery Preference" hint="User can also change this anytime from their Account Settings.">
            <Select
              value={uNotifPref}
              onChange={(e) => setUNotifPref(e.target.value as NotificationPreference)}
            >
              <option value="both">Both External Email &amp; In-System Bell (Default)</option>
              <option value="email_only">External Email Only (In-System Bell Muted)</option>
              <option value="in_system_only">In-System Bell Only (External Email Muted)</option>
            </Select>
          </Field>

          {!editingUserId && (
            <div className="rounded-lg bg-brand-50 p-3 text-xs text-brand-900 border border-brand-200">
              <p className="font-bold flex items-center gap-1.5">
                <span>Default Password for New Accounts</span>
              </p>
              <p className="mt-1 text-brand-700 leading-relaxed">
                New accounts are assigned the system default password:{' '}
                <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-brand-300 text-brand-950">
                  cess2026
                </strong>
                . The user can sign in using their official Gmail (<span className="font-mono">@msunaawan.edu.ph</span>) and this password.
              </p>
            </div>
          )}
        </form>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG: APPROVE PENDING REGISTRATION                                      */}
      {/* ========================================================================= */}
      <Dialog
        open={!!approveDialogReg}
        onClose={() => setApproveDialogReg(null)}
        size="lg"
        title="Approve & Activate Account"
        description="Confirm or adjust the assigned role and department before activating this university user."
        busy={approveBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveDialogReg(null)} disabled={approveBusy}>
              Cancel
            </Button>
            <Button onClick={handleConfirmApproval} loading={approveBusy} icon={UserCheck}>
              Confirm Approval
            </Button>
          </>
        }
      >
        {approveDialogReg && (
          <div className="space-y-5">
            <div className="rounded-xl bg-ink-50 p-4 text-xs space-y-1.5 border border-ink-100">
              <div>
                <span className="font-semibold text-ink-700">Applicant: </span>
                <span className="text-ink-900 font-bold">{approveDialogReg.name}</span>
              </div>
              <div>
                <span className="font-semibold text-ink-700">Email: </span>
                <span className="font-mono text-ink-800">{approveDialogReg.email}</span>
              </div>
              {approveDialogReg.idNumber && (
                <div>
                  <span className="font-semibold text-ink-700">Submitted ID: </span>
                  <span className="font-mono text-ink-800">{approveDialogReg.idNumber}</span>
                </div>
              )}
            </div>

            <Field label="Assigned Role">
              <Select value={appRole} onChange={(e) => setAppRole(e.target.value as Role)}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Department / Program">
              <Input value={appDept} onChange={(e) => setAppDept(e.target.value)} />
            </Field>

            {(appRole === 'student' || appRole === 'faculty') && (
              <Field label="Unit / Origin">
                <Select value={appOrigin} onChange={(e) => setAppOrigin(e.target.value as Origin)}>
                  <option value="CESS">CESS Main Campus</option>
                  <option value="IDS">Integrated Developmental School (IDS)</option>
                </Select>
              </Field>
            )}
          </div>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG: REJECT PENDING REGISTRATION                                       */}
      {/* ========================================================================= */}
      <Dialog
        open={!!rejectDialogReg}
        onClose={() => setRejectDialogReg(null)}
        size="md"
        title="Reject Registration"
        description="Provide a reason for invalidating this registration request."
        busy={rejectBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectDialogReg(null)} disabled={rejectBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmRejection} loading={rejectBusy} icon={X}>
              Reject Registration
            </Button>
          </>
        }
      >
        {rejectDialogReg && (
          <div className="space-y-5">
            <p className="text-xs text-ink-600">
              Rejecting will notify <span className="font-bold">{rejectDialogReg.name}</span> ({rejectDialogReg.email}).
            </p>
            <Field label="Rejection Reason" required error={rejectError}>
              <Input
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value)
                  if (rejectError) setRejectError('')
                }}
                placeholder="e.g. Not enrolled this semester or invalid institutional details"
                required
              />
            </Field>
          </div>
        )}
      </Dialog>
    </div>
  )
}
