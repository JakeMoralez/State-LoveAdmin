import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../../hooks/useOverlayFocus'

export function ModalViewport({
  open,
  onBackdropClick,
  children,
  ariaLabelledBy,
  ariaLabel,
}: {
  open: boolean
  onBackdropClick?: () => void
  children: React.ReactNode
  ariaLabelledBy?: string
  ariaLabel?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onEscape = useCallback(() => {
    onBackdropClick?.()
  }, [onBackdropClick])

  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    window.dispatchEvent(new CustomEvent('sl:overlay-open'))
    return () => document.body.classList.remove('modal-open')
  }, [open])

  useOverlayFocus(open, rootRef, onBackdropClick ? onEscape : undefined)

  if (!open) return null

  return createPortal(
    <div
      ref={rootRef}
      className="modal-viewport fixed inset-0 z-[130] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
    >
      <div
        className="absolute inset-0 bg-black/55 overlay-backdrop"
        onClick={onBackdropClick}
        aria-hidden
      />
      {children}
    </div>,
    document.body,
  )
}
