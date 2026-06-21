import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    window.addEventListener('resize', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [query])

  return matches
}

/** Drawer navigation — sidebar off-canvas */
export const MOBILE_NAV_QUERY = '(max-width: 1023px)'

/** Compact layouts — kanban, checklist cards, list default */
export const COMPACT_QUERY = '(max-width: 767px)'

/** Phone — fullscreen modals, single column */
export const PHONE_QUERY = '(max-width: 639px)'

/** @deprecated use COMPACT_QUERY */
export const TABLET_QUERY = COMPACT_QUERY

export function matchesMediaQuery(query: string): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(query).matches
}
