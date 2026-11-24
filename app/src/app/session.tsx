import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AUTH_TOKEN_KEY, getDb, useDb } from '../data/store'
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

function readSession(): { userId: string; lastActive: number; user?: User } | null {
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
      localStorage.removeItem(AUTH_TOKEN_KEY)
      return null
    }
    const localUser = getDb().users.find((u) => u.id === s.userId && u.active)
    const savedUser = s.user?.id === s.userId && s.user.active ? s.user : null
    return localUser || savedUser ? s.userId : null
  })
  const lastActive = useRef(Date.now())

  const user = useMemo(() => {
    const localUser = db.users.find((u) => u.id === userId && u.active)
    if (localUser) return localUser
    const savedSession = readSession()
    return savedSession?.user?.id === userId && savedSession.user.active
      ? savedSession.user
      : null
  }, [db, userId])

  const signIn = useCallback((u: User) => {
    lastActive.current = Date.now()
    localStorage.setItem(KEY, JSON.stringify({ userId: u.id, lastActive: lastActive.current, user: u }))
    setUserId(u.id)
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
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
        localStorage.removeItem(AUTH_TOKEN_KEY)
        setUserId(null)
        navigate('/session-expired', { replace: true })
      } else {
        const saved = readSession()
        localStorage.setItem(
          KEY,
          JSON.stringify({ userId, lastActive: lastActive.current, user: saved?.user }),
        )
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
