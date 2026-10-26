import { useEffect, useRef, useState } from 'react'

type Draft = Record<string, string | boolean | string[]>
const PREFIX = 'sl-profile-draft:'
const guardedEvents = new WeakSet<Event>()
let restoringHistory = false
let historyIndex: number | undefined

/** Register before BrowserRouter so a rejected Back does not unmount the editor. */
export function installProfileHistoryGuard() {
  const popstate = (e: PopStateEvent) => {
    const next = e.state?.idx as number | undefined
    if (restoringHistory) { restoringHistory = false; historyIndex = next; return }
    if (historyIndex != null && next != null && next !== historyIndex && !confirmProfileNavigation()) {
      e.stopImmediatePropagation()
      restoringHistory = true
      window.history.go(historyIndex - next)
    } else historyIndex = next
  }
  window.addEventListener('popstate', popstate, true)
  return () => window.removeEventListener('popstate', popstate, true)
}
export function clearProfileDrafts() {
  try {
    Object.keys(sessionStorage).filter(key => key.startsWith(PREFIX)).forEach(key => sessionStorage.removeItem(key))
  } catch { /* Storage may be disabled. In-memory editing remains available. */ }
}
export function confirmProfileNavigation() {
  return window.dispatchEvent(new Event('sl:profile-navigation', { cancelable: true }))
}

export function useProfileDraft<T extends Draft>(key: string | undefined, baseline: T, value: T, restore: (draft: T) => void) {
  const original = JSON.stringify(baseline)
  const current = JSON.stringify(value)
  const token = `${key || ''}:${original}`
  const [ready, setReady] = useState('')
  const restoreRef = useRef(restore)
  useEffect(() => { restoreRef.current = restore })
  const clearedRef = useRef<string | null>(null)
  const dirty = original !== current
  useEffect(() => {
    let draft = JSON.parse(original) as T
    if (key) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(PREFIX + key) || 'null')
        if (stored && Object.entries(draft).every(([field, initial]) => Array.isArray(initial)
          ? Array.isArray(stored[field]) && stored[field].every((v: unknown) => typeof v === 'string')
          : typeof stored[field] === typeof initial)) draft = stored
      } catch { /* An invalid draft must not prevent opening the editor. */ }
    }
    restoreRef.current(draft)
    clearedRef.current = null
    // Hydration is keyed to both identity and the server baseline, before persisting edits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(token)
  }, [key, original, token])
  useEffect(() => {
    if (!key || ready !== token || clearedRef.current === current) return
    try {
      if (dirty) sessionStorage.setItem(PREFIX + key, current)
      else sessionStorage.removeItem(PREFIX + key)
    } catch { /* Quota/privacy mode: keep the form usable. */ }
  }, [key, ready, token, current, dirty])
  useUnsavedNavigationGuard(Boolean(key && dirty))
  const clear = () => {
    clearedRef.current = current
    try { if (key) sessionStorage.removeItem(PREFIX + key) } catch { /* optional persistence */ }
  }
  const discard = () => { clear(); restoreRef.current(JSON.parse(original) as T) }
  return { dirty, clear, discard, ready: ready === token }
}


export function useUnsavedNavigationGuard(enabled: boolean, message = 'Есть несохранённые изменения. Перейти, сохранив черновик?') {
  useEffect(() => {
    if (!enabled) return
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const guard = (e: Event) => {
      if (guardedEvents.has(e)) return
      guardedEvents.add(e)
      if (!window.confirm(message)) e.preventDefault()
    }
    const click = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.href === location.href) return
      if (guardedEvents.has(e)) return
      guardedEvents.add(e)
      if (new URL(link.href).origin === location.origin && !confirmProfileNavigation()) { e.preventDefault(); e.stopPropagation() }
    }
    historyIndex = window.history.state?.idx
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('sl:profile-navigation', guard)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('sl:profile-navigation', guard)
      document.removeEventListener('click', click, true)
    }
  }, [enabled, message])
}
