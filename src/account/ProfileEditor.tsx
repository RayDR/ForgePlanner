import { useMemo, useState } from 'react'
import { authApi } from '../auth/authApi'
import { useSession } from '../auth/SessionProvider'

export function ProfileEditor() {
  const { session, locale, theme, refreshSession } = useSession()
  const profile = session!.user.profile!
  const es = locale === 'es'
  const [draft, setDraft] = useState({ displayName: profile.displayName, handle: profile.handle, avatarUrl: profile.avatarUrl ?? '', bio: profile.bio ?? '', locale: profile.locale === 'en' ? 'en' as const : 'es' as const, theme, timezone: profile.timezone, searchable: profile.searchable })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const timezones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone') } catch { return ['UTC', 'America/Mexico_City', 'America/Toronto'] } }, [])
  async function save() {
    setSaving(true); setError(''); setNotice('')
    try {
      await authApi.updatePreferences(draft)
      await refreshSession()
      setNotice(es ? 'Perfil actualizado.' : 'Profile updated.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setSaving(false) }
  }

  return <section className="card profile-editor" aria-labelledby="profile-editor-title">
    <header className="profile-editor-header"><div>{draft.avatarUrl ? <img className="profile-avatar" src={draft.avatarUrl} alt="" /> : <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">{draft.displayName.slice(0, 1).toUpperCase()}</div>}</div><div><p className="eyebrow">{es ? 'PERFIL' : 'PROFILE'}</p><h2 id="profile-editor-title">{es ? 'Información pública' : 'Public information'}</h2><p>{draft.handle}#{profile.discriminator}</p></div></header>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}{notice ? <p className="admin-notice" role="status">{notice}</p> : null}
    <div className="profile-form-grid"><label className="field-wrap"><span>{es ? 'Nombre visible' : 'Display name'}</span><input className="field-input" value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} maxLength={80} required /></label><label className="field-wrap"><span>{es ? 'Identificador público' : 'Public handle'}</span><div className="profile-code-input"><input className="field-input" value={draft.handle} onChange={(event) => setDraft({ ...draft, handle: event.target.value })} pattern="[A-Za-z0-9_-]{3,40}" minLength={3} maxLength={40} required /><span>#{profile.discriminator}</span></div></label><label className="field-wrap profile-field-wide"><span>{es ? 'Biografía' : 'Biography'}</span><textarea className="field-input" value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} maxLength={280} /><small>{draft.bio.length}/280</small></label><label className="field-wrap profile-field-wide"><span>{es ? 'URL del avatar' : 'Avatar URL'}</span><input className="field-input" type="url" value={draft.avatarUrl} onChange={(event) => setDraft({ ...draft, avatarUrl: event.target.value })} placeholder="https://…" /></label><label className="field-wrap"><span>{es ? 'Idioma' : 'Language'}</span><select className="field-input" value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value as 'es' | 'en' })}><option value="es">Español</option><option value="en">English</option></select></label><label className="field-wrap"><span>{es ? 'Tema' : 'Theme'}</span><select className="field-input" value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value as 'light' | 'dark' })}><option value="dark">{es ? 'Oscuro' : 'Dark'}</option><option value="light">{es ? 'Claro' : 'Light'}</option></select></label><label className="field-wrap profile-field-wide"><span>{es ? 'Zona horaria' : 'Timezone'}</span><input className="field-input" list="profile-timezones" value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /><datalist id="profile-timezones">{timezones.map((timezone) => <option key={timezone} value={timezone} />)}</datalist></label></div>
    <label className="profile-search-toggle"><input type="checkbox" checked={draft.searchable} onChange={(event) => setDraft({ ...draft, searchable: event.target.checked })} /><span><strong>{es ? 'Aparecer en búsquedas' : 'Appear in search'}</strong><small>{es ? 'Permite que otros usuarios te encuentren mediante tu código público.' : 'Allow other users to find you using your public code.'}</small></span></label>
    <footer className="profile-editor-footer"><button className="btn btn-primary" type="button" disabled={saving || !draft.displayName.trim() || !draft.handle.trim()} onClick={() => void save()}>{saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar perfil' : 'Save profile')}</button></footer>
  </section>
}
