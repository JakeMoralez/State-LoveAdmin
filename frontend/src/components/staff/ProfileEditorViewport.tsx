import type { ReactNode } from 'react'
import { ModalViewport } from '../ui/ModalViewport'

export function ProfileEditorViewport({ inline, children, open, onClose, titleId }: {
  inline?: boolean; children: ReactNode; open: boolean; onClose: () => void; titleId: string
}) {
  return inline ? <section className="profile-editor-inline" aria-label="Управление профилем">{children}</section>
    : <ModalViewport open={open} onBackdropClick={onClose} ariaLabelledBy={titleId}>{children}</ModalViewport>
}
