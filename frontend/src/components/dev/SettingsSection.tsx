import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'

const Context = createContext<{ report: (key: string, dirty: boolean, busy: boolean) => void } | null>(null)
export function SettingsSection({ id, active, visited, onReport, children }: {
  id: string; active: boolean; visited: boolean
  onReport: (key: string, dirty: boolean, busy: boolean) => void; children: ReactNode
}) {
  const report = useCallback((key: string, dirty: boolean, busy: boolean) => onReport(`${id}:${key}`, dirty, busy), [id, onReport])
  const value = useMemo(() => ({ report }), [report])
  if (!visited) return null
  return <div id={`settings-panel-${id}`} role="tabpanel" aria-labelledby={`settings-tab-${id}`} hidden={!active}>
    <Context.Provider value={value}>{children}</Context.Provider>
  </div>
}
export function useSettingsSection(dirty: boolean, busy: boolean, key = 'form') {
  const context = useContext(Context)
  const report = context?.report
  useEffect(() => {
    report?.(key, dirty, busy)
    return () => report?.(key, false, false)
  }, [report, key, dirty, busy])
}
