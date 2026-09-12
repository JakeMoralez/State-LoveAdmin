import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { api, ApiError, markSessionEnded, consumeSessionEndedReason, type UserProfile } from '../api'
import { LoadingState } from '../components/ui/LoadingState'

const SESSION_PING_MS = 20 * 60 * 1000

interface AuthState {
  user: UserProfile | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const userRef = useRef<UserProfile | null>(null)
  userRef.current = user

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const me = await api.me()
      setUser(me)
    } catch (e: unknown) {
      setUser(null)
      if (e instanceof ApiError && e.status === 401) {
        // нет сессии / истекла — не ошибка UI при первом заходе
      } else if (e instanceof ApiError) {
        const msg = e.message.toLowerCase()
        if (msg.includes('bad gateway') || e.status === 502) {
          setError('Сервер API недоступен. Запустите backend на порту 8012.')
        } else if (e.status === 0) {
          setError(e.message)
        } else {
          setError(e.message)
        }
      } else if (e instanceof TypeError) {
        setError('Нет связи с API. Проверьте, что backend запущен.')
      }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    setUser(null)
  }

  useEffect(() => {
    void refresh()
  }, [])

  // Пинг при видимой вкладке — sliding до истечения idle
  useEffect(() => {
    if (!user) return

    const ping = () => {
      if (document.visibilityState !== 'visible') return
      void api.refreshSession().catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          window.dispatchEvent(new Event('sled:session-ended'))
        }
      })
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') ping()
    }

    const id = window.setInterval(ping, SESSION_PING_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  // Глобальный 401 после того, как пользователь уже был залогинен
  useEffect(() => {
    const onExpired = () => {
      if (!userRef.current) return
      markSessionEnded('session')
      setUser(null)
    }
    window.addEventListener('sled:session-ended', onExpired)
    return () => window.removeEventListener('sled:session-ended', onExpired)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}

export function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <LoadingState />
      </div>
    )
  }
  if (!user) {
    const reason = consumeSessionEndedReason()
    const to = reason === 'session' ? '/login?reason=session' : '/login'
    return <Navigate to={to} replace />
  }
  return <Outlet />
}
