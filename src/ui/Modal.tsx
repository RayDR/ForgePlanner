import type { PropsWithChildren, ReactNode } from 'react'

interface ModalProps extends PropsWithChildren {
  open: boolean
  title: string
  onClose: () => void
  actions?: ReactNode
  headerActions?: ReactNode
  closeLabel?: ReactNode
}

export function Modal({ open, title, onClose, actions, headerActions, closeLabel = 'Close', children }: ModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-shell" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <div className="modal-header-actions">
            {headerActions}
            <button className="btn btn-ghost modal-close-button" onClick={onClose} aria-label="Close modal">{closeLabel}</button>
          </div>
        </header>
        <div className="modal-body">{children}</div>
        {actions ? <footer className="modal-footer">{actions}</footer> : null}
      </div>
    </div>
  )
}
