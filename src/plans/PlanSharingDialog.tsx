import { useCallback, useEffect, useState } from 'react'
import type { Locale } from '../i18n'
import { sharingCopy } from '../i18n'
import type { ForgePlan } from '../types/forgePlanner'
import { LockIcon } from '../ui/icons'
import { sharingApi } from './sharingApi'
import type { PlanAccessRecord, PlanShareLink, PublicProfile } from './sharingApi'

export function PlanSharingDialog({ plan, locale, onClose }: { plan: ForgePlan; locale: Locale; onClose: () => void }) {
  const t = sharingCopy[locale]
  const [code, setCode] = useState('')
  const [level, setLevel] = useState<'viewer' | 'editor'>('viewer')
  const [result, setResult] = useState<PublicProfile | null>(null)
  const [access, setAccess] = useState<PlanAccessRecord[]>([])
  const [sharingEnabled, setSharingEnabled] = useState(plan.remoteSharingEnabled ?? true)
  const [link, setLink] = useState<PlanShareLink | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(() => plan.remoteId && sharingApi.list(plan.remoteId).then((state) => { setAccess(state.records); setSharingEnabled(state.sharingEnabled); setLink(state.link) }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))), [plan.remoteId])
  useEffect(() => { void load() }, [load])

  async function search() { setWorking(true); setError(''); try { const profile = await sharingApi.search(code); setResult(profile); if (!profile) setError(t.notFound) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setWorking(false) } }
  async function invite() { if (!plan.remoteId || !result) return; setWorking(true); setError(''); try { await sharingApi.grant(plan.remoteId, result.code, level); setCode(''); setResult(null); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setWorking(false) } }
  async function change(accessId: string, next: 'viewer' | 'editor') { if (!plan.remoteId) return; await sharingApi.update(plan.remoteId, accessId, next); await load() }
  async function revoke(accessId: string) { if (!plan.remoteId) return; await sharingApi.revoke(plan.remoteId, accessId); await load() }
  async function toggleSharing() { if (!plan.remoteId) return; setWorking(true); setError(''); try { const state = await sharingApi.setSharingEnabled(plan.remoteId, !sharingEnabled); setSharingEnabled(state.enabled) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setWorking(false) } }
  async function createLink() { if (!plan.remoteId) return; setLink(await sharingApi.createLink(plan.remoteId, 'viewer')) }
  async function updateLink(input: { enabled?: boolean; accessLevel?: 'viewer' | 'editor' }) { if (!plan.remoteId) return; setLink(await sharingApi.updateLink(plan.remoteId, input)) }
  async function removeLink() { if (!plan.remoteId) return; await sharingApi.deleteLink(plan.remoteId); setLink(null) }
  async function copyLink() { if (!link) return; await navigator.clipboard.writeText(`${window.location.origin}/shared/${link.id}`); setNotice(t.copied); window.setTimeout(() => setNotice(''), 1800) }

  return <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-shell plan-sharing-dialog" role="dialog" aria-modal="true" aria-labelledby="sharing-title">
      <header className="modal-header"><div><small>{plan.title}</small><h2 id="sharing-title">{t.title}</h2></div><button type="button" className="btn btn-ghost" onClick={onClose} aria-label={t.close}>×</button></header>
      <div className="modal-body stack-sm">
        <section className={sharingEnabled ? 'sharing-master-control is-enabled' : 'sharing-master-control'}>
          <div><LockIcon width={18} height={18} /><span><strong>{t.masterAccess}</strong><small>{sharingEnabled ? t.unlocked : t.locked}</small></span></div>
          <button type="button" className={sharingEnabled ? 'sharing-lock-toggle is-enabled' : 'sharing-lock-toggle'} aria-pressed={sharingEnabled} aria-label={sharingEnabled ? t.unlocked : t.locked} disabled={working} onClick={() => void toggleSharing()}>{sharingEnabled ? '🔓' : '🔒'}</button>
        </section>
        {!sharingEnabled ? <p className="sharing-locked-hint">{t.lockedHint}</p> : null}
        <p className="sharing-help">{t.searchHelp}</p>
        <form className="sharing-search" onSubmit={(event) => { event.preventDefault(); void search() }}>
          <label className="field-wrap"><span>{t.publicCode}</span><input className="field-input" value={code} disabled={!sharingEnabled} onChange={(event) => { setCode(event.target.value); setResult(null) }} placeholder={locale === 'es' ? 'usuario#1234' : 'user#1234'} autoComplete="off" /></label>
          <button className="btn" type="submit" disabled={working || !sharingEnabled || !code.trim()}>{t.search}</button>
        </form>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}{notice ? <p className="admin-notice" role="status">{notice}</p> : null}
        {result ? <div className="sharing-result"><div className="sharing-avatar" aria-hidden="true">{result.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{result.displayName}</strong><small>{result.code}</small></div><select className="field-input" value={level} onChange={(event) => setLevel(event.target.value as 'viewer' | 'editor')} aria-label={t.accessLevel}><option value="viewer">{t.view}</option><option value="editor">{t.edit}</option></select><button className="btn btn-primary" type="button" onClick={() => void invite()} disabled={working || !sharingEnabled}>{t.invite}</button></div> : null}
        <section className="sharing-general-access"><header><div><strong>{t.linkTitle}</strong><small>{link?.enabled ? t.linkEnabled : t.linkDisabled}</small></div>{link ? <select className="field-input" value={link.accessLevel} disabled={!sharingEnabled} onChange={(event) => void updateLink({ accessLevel: event.target.value as 'viewer' | 'editor' })}><option value="viewer">{t.view}</option><option value="editor">{t.edit}</option></select> : null}</header>{link ? <div><button type="button" className="btn" disabled={!sharingEnabled} onClick={() => void updateLink({ enabled: !link.enabled })}>{link.enabled ? t.disableLink : t.enableLink}</button><button type="button" className="btn" disabled={!sharingEnabled || !link.enabled} onClick={() => void copyLink()}>{t.copyLink}</button><button type="button" className="btn btn-danger" disabled={!sharingEnabled} onClick={() => void removeLink()}>{t.removeLink}</button></div> : <button type="button" className="btn" disabled={!sharingEnabled} onClick={() => void createLink()}>{t.createLink}</button>}</section>
        <div className="sharing-access-list"><h3>{t.people}</h3>{access.length ? access.filter((item) => item.status !== 'revoked').map((item) => <div className="sharing-access-row" key={item.id}><div className="sharing-avatar" aria-hidden="true">{item.profile?.displayName.slice(0, 1).toUpperCase() ?? '?'}</div><div><strong>{item.profile?.displayName ?? t.unavailable}</strong><small>{item.profile?.code} · {item.status === 'pending' ? t.pending : item.status === 'accepted' ? t.accepted : t.declined}</small></div><select className="field-input" disabled={!sharingEnabled} value={item.accessLevel} onChange={(event) => void change(item.id, event.target.value as 'viewer' | 'editor')}><option value="viewer">{t.view}</option><option value="editor">{t.edit}</option></select><button className="btn btn-danger" disabled={!sharingEnabled} type="button" onClick={() => void revoke(item.id)}>{t.revoke}</button></div>) : <p>{t.noPeople}</p>}</div>
      </div>
    </section>
  </div>
}
