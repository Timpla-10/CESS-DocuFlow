import { Bell, ChevronDown, LogOut, Mail, Menu, PanelLeftClose, PanelLeftOpen, UserCog, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { navFor } from '../app/nav'
import { useSession, useUser } from '../app/session'
import { ROLE_LABEL, formatRoleTitle } from '../content/language'
import { myNotifications, unreadCount } from '../data/selectors'
import { api, useDb } from '../data/store'
import { timeAgo } from '../lib/time'
import { Logo, LogoMark } from './Logo'
import { Avatar, cn } from './ui'

export function AppShell() {
  const [drawer, setDrawer] = useState(false)
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cess_sidebar_locked')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })
  const [isHovered, setIsHovered] = useState(false)
  const location = useLocation()
  useEffect(() => setDrawer(false), [location.pathname])

  const toggleLock = () => {
    setIsLocked((prev) => {
      const next = !prev
      try {
        localStorage.setItem('cess_sidebar_locked', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const isExpanded = isLocked || isHovered

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className="sr-only z-50 rounded-md bg-white px-3 py-2 text-brand-800 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to main content
      </a>

      {/* Desktop sidebar: mini-rail (72px) when unlocked, full (264px) when locked or hovered */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 hidden transition-all duration-300 ease-in-out lg:block',
          isExpanded ? 'w-[264px]' : 'w-[72px]',
          !isLocked && isHovered ? 'z-40 shadow-2xl ring-1 ring-black/15' : 'z-30'
        )}
        onMouseEnter={() => {
          if (!isLocked) setIsHovered(true)
        }}
        onMouseLeave={() => {
          setIsHovered(false)
        }}
      >
        <Sidebar
          isExpanded={isExpanded}
          isLocked={isLocked}
          onToggleLock={toggleLock}
        />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-brand-950/50 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden />
          <div className="relative h-full w-[280px] max-w-[85vw] animate-slide-in">
            <Sidebar
              onClose={() => setDrawer(false)}
              isExpanded={true}
              isLocked={true}
            />
          </div>
        </div>
      )}

      <div
        className={cn(
          'w-full min-w-0 max-w-full overflow-x-hidden transition-[padding] duration-300 ease-in-out',
          isLocked ? 'lg:pl-[264px]' : 'lg:pl-[72px]'
        )}
      >
        <TopBar
          onMenu={() => setDrawer(true)}
          isLocked={isLocked}
          onToggleLock={toggleLock}
        />
        <main id="main" className="mx-auto w-full min-w-0 max-w-[1440px] px-2.5 pb-20 pt-4 2xl:max-w-[1560px] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Sidebar({
  onClose,
  isExpanded = true,
  isLocked = true,
  onToggleLock,
}: {
  onClose?: () => void
  isExpanded?: boolean
  isLocked?: boolean
  onToggleLock?: () => void
}) {
  const user = useUser()
  const db = useDb()
  const sections = navFor(user.role)

  return (
    <nav aria-label="Main navigation" className="surface-brand-gradient relative flex h-full flex-col overflow-hidden text-white">
      {/* Living Aurora ambient moving glow orbs in official CESS department colors (IDS Pink, DSEE Lavender, DSSH Purple) */}
      <div className="pointer-events-none absolute -bottom-16 -right-16 size-80 rounded-full bg-ids-400/50 blur-2xl animate-aurora-pink" aria-hidden />
      <div className="pointer-events-none absolute -top-16 -left-16 size-72 rounded-full bg-dsee-300/45 blur-2xl animate-aurora-lavender" aria-hidden />
      <div className="pointer-events-none absolute top-1/2 -right-12 size-64 -translate-y-1/2 rounded-full bg-dssh-500/40 blur-2xl animate-aurora-violet" aria-hidden />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* Header */}
        <div className={cn('flex h-16 items-center', isExpanded ? 'justify-between px-4' : 'justify-center')}>
          {isExpanded ? (
            <>
              <Link to="/app" aria-label="CESS DocuFlow — go to your home page">
                <Logo tone="light" />
              </Link>
              <div className="flex items-center gap-1">
                {onToggleLock && (
                  <button
                    type="button"
                    onClick={onToggleLock}
                    className={cn(
                      'grid size-8 place-items-center rounded-lg transition-colors',
                      isLocked ? 'text-brand-200 hover:bg-white/10 hover:text-white' : 'bg-white/20 text-white shadow-sm'
                    )}
                    title={isLocked ? 'Collapse sidebar (switch to rail)' : 'Lock sidebar open'}
                    aria-label={isLocked ? 'Collapse sidebar' : 'Lock sidebar open'}
                  >
                    {isLocked ? (
                      <PanelLeftClose className="size-4" aria-hidden />
                    ) : (
                      <PanelLeftOpen className="size-4" aria-hidden />
                    )}
                  </button>
                )}
                {onClose && (
                  <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-brand-100 hover:bg-white/10" aria-label="Close menu">
                    <X className="size-5" aria-hidden />
                  </button>
                )}
              </div>
            </>
          ) : (
            <Link to="/app" aria-label="CESS DocuFlow" title="CESS DocuFlow">
              <LogoMark size="sm" />
            </Link>
          )}
        </div>

        {/* User identification card */}
        {isExpanded ? (
          <div className="mx-4 mb-2 mt-2 rounded-xl bg-white/[0.09] p-3 ring-1 ring-inset ring-white/15">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200/90">Signed in as</p>
            <p className="mt-0.5 truncate text-sm font-bold">{formatRoleTitle(user)}</p>
            <p className="truncate text-xs text-brand-200/80">{user.department}</p>
          </div>
        ) : (
          <div
            className="mx-2 mb-2 mt-2 flex items-center justify-center rounded-xl bg-white/[0.09] py-2 px-1 ring-1 ring-inset ring-white/15"
            title={`Signed in as ${user.name} (${ROLE_LABEL[user.role]})`}
          >
            <Avatar name={user.name} size="sm" />
          </div>
        )}

        {/* Navigation items */}
        <div className={cn('flex-1 space-y-4 overflow-y-auto py-3', isExpanded ? 'px-3' : 'px-2')}>
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && isExpanded && (
                <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-300">
                  {s.heading}
                </p>
              )}
              <ul className="space-y-1">
                {s.items.map((it) => {
                  const count = it.count?.(db, user) ?? 0
                  return (
                    <li key={it.to}>
                      <NavLink
                        to={it.to}
                        end={it.to === '/app/documents'}
                        title={it.label}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center rounded-xl text-sm font-semibold transition-all',
                            isExpanded ? 'gap-3 px-3 py-2' : 'justify-center p-2.5',
                            isActive
                              ? 'bg-white text-brand-900 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25)] font-bold'
                              : 'text-brand-100/90 hover:bg-white/10 hover:text-white',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <it.icon
                              className={cn(
                                'size-[18px] shrink-0',
                                isActive ? 'text-brand-700' : 'text-brand-300 group-hover:text-white',
                              )}
                            />
                            {isExpanded && <span className="flex-1 truncate">{it.label}</span>}
                            {count > 0 &&
                              (isExpanded ? (
                                <span
                                  className={cn(
                                    'min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums leading-5',
                                    it.countTone === 'danger'
                                      ? 'bg-danger-500 text-white'
                                      : it.countTone === 'warning'
                                      ? 'bg-warning-500 text-brand-950'
                                      : isActive
                                      ? 'bg-brand-600 text-white'
                                      : 'bg-white/15 text-white',
                                  )}
                                  aria-label={`${count} waiting`}
                                >
                                  {count}
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    'absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold ring-2 ring-brand-900',
                                    it.countTone === 'danger'
                                      ? 'bg-danger-500 text-white'
                                      : it.countTone === 'warning'
                                      ? 'bg-warning-500 text-brand-950'
                                      : isActive
                                      ? 'bg-brand-600 text-white'
                                      : 'bg-ids-400 text-brand-950',
                                  )}
                                  aria-label={`${count} waiting`}
                                >
                                  {count}
                                </span>
                              ))}
                          </>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        {isExpanded ? (
          <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-brand-200/80">
            College of Education and Social Sciences
            <br />
            Mindanao State University at Naawan
          </div>
        ) : (
          <div className="border-t border-white/10 py-3 text-center text-[10px] font-bold text-brand-300">
            MSU-N
          </div>
        )}
      </div>
    </nav>
  )
}

function TopBar({
  onMenu,
  isLocked,
  onToggleLock,
}: {
  onMenu: () => void
  isLocked: boolean
  onToggleLock: () => void
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 sm:h-16 w-full min-w-0 max-w-full items-center gap-1.5 sm:gap-3 border-b border-ink-100 bg-white/80 px-2 sm:px-6 lg:px-8 backdrop-blur-xl">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onMenu}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-700 hover:bg-brand-50 sm:size-10 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-4.5 sm:size-5 shrink-0" aria-hidden />
      </button>

      {/* Desktop hamburger toggle: only rendered when sidebar is collapsed (rail mode) */}
      {!isLocked && (
        <button
          type="button"
          onClick={onToggleLock}
          className="hidden lg:grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-brand-50 hover:text-brand-900 transition-colors"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      )}

      <div className="min-w-0 shrink lg:hidden">
        <div className="hidden min-[440px]:block">
          <Logo subtitle={false} />
        </div>
        <div className="hidden min-[260px]:block min-[440px]:hidden">
          <LogoMark size="sm" />
        </div>
        <div className="block min-[260px]:hidden">
          <LogoMark size="xs" />
        </div>
      </div>
      <div className="min-w-0 flex-1" />
      <NotificationBell />
      <UserMenu />
    </header>
  )
}

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

function NotificationBell() {
  const user = useUser()
  const db = useDb()
  const navigate = useNavigate()
  const { open, setOpen, ref } = usePopover()
  const items = myNotifications(db, user).slice(0, 8)
  const unread = unreadCount(db, user)

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      const ids = myNotifications(db, user).filter((n) => !n.readBy.includes(user.id)).map((n) => n.id)
      window.setTimeout(() => void api.markNotificationsRead(user, ids), 1200)
    }
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread ? `Email updates — ${unread} new` : 'Email updates'}
        className="relative grid size-8 sm:size-10 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
      >
        <Bell className="size-4.5 sm:size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 sm:right-1.5 sm:top-1.5 grid min-w-4 sm:min-w-[18px] place-items-center rounded-full bg-brand-600 px-0.5 sm:px-1 text-[9px] sm:text-[10px] font-bold leading-none sm:leading-[18px] text-white ring-1.5 sm:ring-2 ring-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 sm:top-12 z-30 w-[min(calc(100vw-16px),380px)] origin-top-right animate-scale-in overflow-hidden rounded-xl bg-white shadow-raised ring-1 ring-ink-100">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink-900">Notifications & Email Updates</p>
              <p className="text-xs text-ink-500">
                {user.notificationPreference === 'email_only'
                  ? `External email only (${user.email})`
                  : user.notificationPreference === 'in_system_only'
                  ? 'In-system notifications only'
                  : `In-system & sent to ${user.email}`}
              </p>
            </div>
            <Link
              to="/app/account"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              Preferences
            </Link>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-500">
              <Mail className="mx-auto mb-2 size-6 text-brand-300" aria-hidden />
              {user.notificationPreference === 'email_only'
                ? 'In-system alerts are muted because your preference is set to External Email Only.'
                : 'No notifications yet. We’ll let you know when something changes.'}
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-ink-100 overflow-y-auto">
              {items.map((n) => {
                const isNew = !n.readBy.includes(user.id) && !n.readBy.includes(n.recipientId)
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        navigate(
                          n.docId
                            ? `/app/documents/${n.docId}`
                            : n.kind === 'notice' && (user.role === 'secretary' || user.role === 'dean')
                            ? '/app/notices'
                            : '/app',
                        )
                      }}
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-brand-50/70"
                    >
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', isNew ? 'bg-brand-600' : 'bg-transparent')} aria-hidden />
                      <span className="min-w-0">
                        <span className={cn('block text-sm', isNew ? 'font-bold text-ink-900' : 'font-medium text-ink-800')}>{n.subject}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">{timeAgo(n.at)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const user = useUser()
  const { signOut } = useSession()
  const navigate = useNavigate()
  const { open, setOpen, ref } = usePopover()
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 sm:gap-2.5 rounded-xl p-0.5 sm:py-1 sm:pl-1 sm:pr-2 transition-colors hover:bg-brand-50"
      >
        <Avatar name={user.name} className="size-7 sm:size-9 text-[11px] sm:text-xs" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-ink-900">{user.name}</span>
          <span className="block text-xs text-ink-500">{user.position}</span>
        </span>
        <ChevronDown
          className={cn(
            'hidden min-[280px]:block size-3.5 sm:size-4 text-ink-400 transform-gpu transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
            open && 'rotate-180',
          )}
          style={{ transformOrigin: 'center' }}
          aria-hidden
        />
      </button>
      {open && (
        <div className="absolute right-0 top-11 sm:top-12 z-30 w-[min(calc(100vw-16px),240px)] origin-top-right animate-scale-in overflow-hidden rounded-xl bg-white p-1.5 shadow-raised ring-1 ring-ink-100">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-ink-100" />
          <Link to="/app/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-800">
            <UserCog className="size-4" aria-hidden /> Account Settings
          </Link>
          <button
            type="button"
            onClick={() => {
              signOut()
              navigate('/sign-in', { replace: true, state: { signedOut: true } })
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-800"
          >
            <LogOut className="size-4" aria-hidden /> Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
