import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type MobileTopBarTitleContextValue = {
  override: string | null
  setOverride: (title: string | null) => void
}

const MobileTopBarTitleContext = createContext<MobileTopBarTitleContextValue | null>(null)

export function MobileTopBarTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null)
  const value = useMemo(() => ({ override, setOverride }), [override])
  return <MobileTopBarTitleContext.Provider value={value}>{children}</MobileTopBarTitleContext.Provider>
}

export function useMobileTopBarTitleOverride() {
  return useContext(MobileTopBarTitleContext)?.override ?? null
}

/** Подставляет заголовок в mobile-top-bar на время жизни страницы */
export function useMobileTopBarTitle(title: string | null | undefined) {
  const ctx = useContext(MobileTopBarTitleContext)

  useEffect(() => {
    if (!ctx) return
    const next = title?.trim() || null
    ctx.setOverride(next)
    return () => ctx.setOverride(null)
  }, [ctx, title])
}
