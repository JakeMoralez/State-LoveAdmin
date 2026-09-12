import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.tabIndex !== -1,
  )
}

/** Trap Tab focus inside an overlay; restore focus on close; optional Escape. */
export function useOverlayFocus(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active) return
    const root = containerRef.current
    if (!root) return

    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const nodes = focusablesIn(root)
    const first = nodes[0]
    if (first) {
      requestAnimationFrame(() => first.focus())
    } else {
      root.setAttribute('tabindex', '-1')
      root.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!onEscape) return
        e.preventDefault()
        e.stopPropagation()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusablesIn(root)
      if (!list.length) {
        e.preventDefault()
        return
      }
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      const current = document.activeElement
      if (e.shiftKey) {
        if (current === firstEl || !root.contains(current)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else if (current === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [active, containerRef, onEscape])
}
