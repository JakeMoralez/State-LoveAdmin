import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function ModalViewport({
  open,
  onBackdropClick,
  children,
}: {
  open: boolean
  onBackdropClick?: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    window.dispatchEvent(new CustomEvent('sl:overlay-open'))
    return () => document.body.classList.remove('modal-open')
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="modal-viewport fixed inset-0 z-[130] flex items-center justify-center p-4">
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
