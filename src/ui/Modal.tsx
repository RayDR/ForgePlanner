import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps extends PropsWithChildren {
  open: boolean
  title: string
  onClose: () => void
  actions?: ReactNode
  headerActions?: ReactNode
  closeLabel?: ReactNode
  closeAriaLabel?: string
}

/** Portal primitive for legacy dialogs that have bespoke content but need the
 * same top-level stacking boundary as the shared Modal shell. */
export function ModalPortal({ children }: PropsWithChildren) {
  const root = document.getElementById('modal-root')
  return root ? createPortal(children, root) : children
}

export function Modal({ open, title, onClose, actions, headerActions, closeLabel = 'Close', closeAriaLabel = 'Close modal', children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); returnFocusRef.current?.focus() }
  }, [open, onClose])
  if (!open) {
    return null
  }
  const content = (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div ref={dialogRef} className="modal-shell" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <div className="modal-header-actions">
            {headerActions}
            <button className="btn btn-ghost modal-close-button" onClick={onClose} aria-label={closeAriaLabel}>{closeLabel}</button>
          </div>
        </header>
        <div className="modal-body">{children}</div>
        {actions ? <footer className="modal-footer">{actions}</footer> : null}
      </div>
    </div>
  )
  return <ModalPortal>{content}</ModalPortal>
}
