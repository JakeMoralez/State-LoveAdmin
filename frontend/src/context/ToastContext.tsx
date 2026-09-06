import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AlertVariant } from '../components/ui/Alert'

type ToastItem = {
  id: number
  message: string
  variant: AlertVariant
}

type ToastApi = {
  toast: (message: string, variant?: AlertVariant) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const MAX_TOASTS = 3
const TOAST_MS = 3000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const toast = useCallback((message: string, variant: AlertVariant = 'danger') => {
    const id = nextId.current++
    setItems((prev) => {
      const next = [...prev, { id, message, variant }]
      return next.slice(-MAX_TOASTS)
    })
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_MS)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="sl-toast-stack" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <p key={item.id} className={`sl-toast sl-alert sl-alert--${item.variant}`} role="status">
            {item.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
