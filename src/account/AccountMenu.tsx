import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { UserIcon } from '../ui/icons'

export function AccountMenu() {
  const { session, locale, logout } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const name = session?.user.profile?.displayName ?? session?.user.email ?? ''
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'NS'
  const es = locale === 'es'
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const go = (path: string) => { setOpen(false); navigate(path) }
  const guest = !session
  return <div className="account-menu" ref={ref}>
    <button type="button" className="account-avatar-button account-avatar-button--guest" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} title={guest ? (es ? 'Invitado · Sin sesión iniciada' : 'Guest · Not signed in') : name}>{guest ? <UserIcon width={18} height={18} /> : initials}</button>
    {open ? <div className="account-menu-popover" role="menu">
      <header><span>{guest ? '○' : initials}</span><div><strong>{guest ? (es ? 'Invitado' : 'Guest') : name}</strong><small>{guest ? (es ? 'Sin sesión iniciada' : 'Not signed in') : session?.user.email}</small></div></header>
      {guest ? <><button role="menuitem" onClick={() => go('/login')}>↪ <span>{es ? 'Iniciar sesión' : 'Sign in'}</span></button><button role="menuitem" onClick={() => go('/register')}>＋ <span>{es ? 'Crear una cuenta' : 'Create account'}</span></button></> : <><button role="menuitem" onClick={() => go('/account')}>◎ <span>{es ? 'Mi perfil' : 'My profile'}</span></button>
      <button role="menuitem" onClick={() => go('/account#contact')}>✎ <span>{es ? 'Información de contacto' : 'Contact information'}</span></button>
      <button role="menuitem" onClick={() => go(`/forgot-password?email=${encodeURIComponent(session?.user.email ?? '')}`)}>⌁ <span>{es ? 'Cambiar contraseña' : 'Change password'}</span></button>
      <button role="menuitem" onClick={() => go('/account#preferences')}>⚙ <span>{es ? 'Preferencias' : 'Preferences'}</span></button>
      <hr />
      <button role="menuitem" className="danger" onClick={() => { setOpen(false); void logout() }}>↪ <span>{es ? 'Cerrar sesión' : 'Sign out'}</span></button></>}
    </div> : null}
  </div>
}
