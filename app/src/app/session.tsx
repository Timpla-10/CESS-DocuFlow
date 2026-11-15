import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDb, useDb } from '../data/store'
import type { User } from '../data/types'

/** Sign out after this long without activity (REQ-AUTH-6; exact length TBD in the SRS). */
export const IDLE_LIMIT_MS = 30 * 60 * 1000
const KEY = 'docuflow.session'

interface SessionValue {
  user: User | null
  signIn: (user: User) => void
  signOut: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

function readSession(): { userId: string; lastActive: number } | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(() => {
    const s = readSession()
    if (!s) return null
    if (Date.now() - s.lastActive > IDLE_LIMIT_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return getDb().users.some((u) => u.id === s.userId && u.active) ? s.userId : null
  })
  const lastActive = useRef(Date.now())

  const user = useMemo(() => db.users.find((u) => u.id === userId && u.active) ?? null, [db, userId])

  const signIn = useCallback((u: User) => {
    lastActive.current = Date.now()
    localStorage.setItem(KEY, JSON.stringify({ userId: u.id, lastActive: lastActive.current }))
    setUserId(u.id)
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY)
    try {
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    setUserId(null)
  }, [])

  // Track activity and expire idle sessions.
  useEffect(() => {
    if (!userId) return
    const touch = () => {
      lastActive.current = Date.now()
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActive.current
      if (idle > IDLE_LIMIT_MS) {
        localStorage.removeItem(KEY)
        setUserId(null)
        navigate('/session-expired', { replace: true })
      } else {
        localStorage.setItem(KEY, JSON.stringify({ userId, lastActive: lastActive.current }))
      }
    }, 15_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      window.clearInterval(timer)
    }
  }, [userId, navigate])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** For pages behind sign-in: the user is guaranteed to exist. */
export function useUser(): User {
  const { user } = useSession()
  if (!user) throw new Error('useUser called without a signed-in user')
  return user
}
