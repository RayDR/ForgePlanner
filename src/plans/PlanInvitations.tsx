import { useEffect, useState } from 'react'
import type { Locale } from '../i18n'
import { sharingApi } from './sharingApi'
import type { PlanInvitation } from './sharingApi'

export function PlanInvitations({ locale, onAccepted }: { locale: Locale; onAccepted: () => void }) {
  const [items, setItems] = useState<PlanInvitation[]>([]); const [error, setError] = useState('')
  const es = locale === 'es'; const load = () => sharingApi.invitations().then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  useEffect(() => { void load() }, [])
  async function respond(id: string, response: 'accepted' | 'declined') { try { await sharingApi.respond(id, response); await load(); if (response === 'accepted') onAccepted() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } }
  if (!items.length && !error) return null
  return <section className="plan-invitations card" aria-labelledby="plan-invitations-title"><div><strong id="plan-invitations-title">{es ? 'Invitaciones a planes' : 'Plan invitations'}</strong><p>{es ? 'Acepta únicamente planes de personas que reconozcas.' : 'Only accept plans from people you recognize.'}</p>{error ? <p className="auth-error">{error}</p> : null}</div>{items.map((item) => <div className="plan-invitation" key={item.id}><div><strong>{item.plan.name}</strong><small>{item.grantedBy?.displayName ?? (es ? 'Usuario' : 'User')} · {item.accessLevel === 'editor' ? (es ? 'Puede editar' : 'Can edit') : (es ? 'Puede ver' : 'Can view')}</small></div><button className="btn" type="button" onClick={() => void respond(item.id, 'declined')}>{es ? 'Rechazar' : 'Decline'}</button><button className="btn btn-primary" type="button" onClick={() => void respond(item.id, 'accepted')}>{es ? 'Aceptar' : 'Accept'}</button></div>)}</section>
}
