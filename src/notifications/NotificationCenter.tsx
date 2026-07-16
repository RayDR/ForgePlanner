import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { notificationApi } from './notificationApi'
import type { NotificationItem } from './notificationApi'
import { BellIcon } from '../ui/icons'

function message(item: NotificationItem, es: boolean) {
  const actor = item.data.actorName ?? (es ? 'Alguien' : 'Someone'); const plan = item.data.planName ?? (es ? 'un plan' : 'a plan')
  if (item.type === 'plan_invitation') return es ? `${actor} te invitó a “${plan}”.` : `${actor} invited you to “${plan}”.`
  if (item.type === 'plan_invitation_accepted') return es ? `${actor} aceptó la invitación a “${plan}”.` : `${actor} accepted the invitation to “${plan}”.`
  return es ? `${actor} rechazó la invitación a “${plan}”.` : `${actor} declined the invitation to “${plan}”.`
}

export function NotificationCenter() {
  const { locale } = useSession(); const es = locale === 'es'; const navigate = useNavigate(); const container = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false); const [items, setItems] = useState<NotificationItem[]>([]); const [unread, setUnread] = useState(0); const [error, setError] = useState('')
  const load = useCallback(() => notificationApi.list().then((result) => { setItems(result.items); setUnread(result.unreadCount); setError('') }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))), [])
  useEffect(() => { void load(); const timer = window.setInterval(load, 60_000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { function close(event: MouseEvent) { if (container.current && !container.current.contains(event.target as Node)) setOpen(false) } document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, [])
  async function select(item: NotificationItem) { if (!item.readAt) { await notificationApi.markRead(item.id); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)); setUnread((value) => Math.max(0, value - 1)) } setOpen(false); navigate('/plans') }
  async function readAll() { await notificationApi.markAllRead(); setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); setUnread(0) }
  return <div className="notification-center" ref={container}><button className="notification-trigger" type="button" aria-label={es ? 'Notificaciones' : 'Notifications'} aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}><BellIcon width={19} height={19} />{unread ? <b>{unread > 99 ? '99+' : unread}</b> : null}</button>{open ? <section className="notification-panel" onClick={(event) => event.stopPropagation()}><header><strong>{es ? 'Notificaciones' : 'Notifications'}</strong>{unread ? <button type="button" onClick={() => void readAll()}>{es ? 'Marcar todas como leídas' : 'Mark all read'}</button> : null}</header>{error ? <p className="auth-error">{error}</p> : items.length ? <div className="notification-list">{items.map((item) => <button className={item.readAt ? 'notification-item' : 'notification-item is-unread'} type="button" key={item.id} onClick={() => void select(item)}><span>{message(item, es)}</span><small>{new Date(item.createdAt).toLocaleString(es ? 'es-MX' : 'en-US')}</small></button>)}</div> : <p className="notification-empty">{es ? 'No tienes notificaciones.' : 'You have no notifications.'}</p>}</section> : null}</div>
}
