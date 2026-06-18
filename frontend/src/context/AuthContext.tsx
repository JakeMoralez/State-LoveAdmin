import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type UserProfile } from '../api'

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

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const me = await api.me()
      setUser(me)
    } catch (e: unknown) {
      setUser(null)
      if (e instanceof ApiError && e.status !== 401) {
        const msg = e.message.toLowerCase()
        if (msg.includes('bad gateway') || e.status === 502) {
          setError('Сервер API недоступен. Запустите backend на порту 8011.')
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
    await api.logout()
    setUser(null)
  }

  useEffect(() => {
    refresh()
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
