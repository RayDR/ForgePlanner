import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { AuthAppearanceControls } from '../auth/AuthAppearanceControls'
import { authApi } from '../auth/authApi'
import { executeRecaptcha } from '../auth/recaptcha'

export function RegisterView() {
  const { register, locale } = useSession()
  const es = locale === 'es'
  const t = es ? { title: 'Crea tu cuenta', intro: 'Tus planes locales existentes permanecerán intactos.', name: 'Nombre visible', email: 'Correo electrónico', password: 'Contraseña', hint: 'Al menos 12 caracteres con mayúscula, minúscula y un número.', terms: 'Acepto los términos del servicio.', creating: 'Creando…', create: 'Crear cuenta', existing: '¿Ya tienes una cuenta?', login: 'Iniciar sesión', error: 'No fue posible crear la cuenta.' } : { title: 'Create your account', intro: 'Your existing local plans will remain untouched.', name: 'Display name', email: 'Email', password: 'Password', hint: 'At least 12 characters with uppercase, lowercase and a number.', terms: 'I accept the terms of service.', creating: 'Creating…', create: 'Create account', existing: 'Already registered?', login: 'Sign in', error: 'Unable to create the account.' }
  const navigate = useNavigate()
  const [form, setForm] = useState({ displayName: '', email: '', password: '', acceptTerms: false })
  const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false)
  const [providers, setProviders] = useState({ googleEnabled: false, recaptchaSiteKey: null as string | null })
  useEffect(() => { authApi.config().then(setProviders).catch(() => undefined) }, [])
  async function submit(event: React.FormEvent) { event.preventDefault(); setSubmitting(true); setError(''); try { const recaptchaToken = await executeRecaptcha(providers.recaptchaSiteKey, 'register'); const verify = await register({ ...form, recaptchaToken }); navigate(verify ? `/verify-email?email=${encodeURIComponent(form.email)}` : '/plans', { replace: true }) } catch (reason) { setError(reason instanceof Error ? reason.message : t.error) } finally { setSubmitting(false) } }
  return <main className="auth-page"><AuthAppearanceControls /><Link className="btn btn-ghost back-to-plans" to="/plans">← {es ? 'Volver a planes' : 'Back to plans'}</Link><section className="auth-card"><div className="auth-brand"><span>FP</span><div><small>FORGE PLANNER</small><h1>{t.title}</h1></div></div><p>{t.intro}</p><form onSubmit={submit} className="auth-form"><label>{t.name}<input autoComplete="name" required minLength={2} maxLength={80} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label><label>{t.email}<input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>{t.password}<input type="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>{t.hint}</small></label><label className="auth-checkbox"><input type="checkbox" required checked={form.acceptTerms} onChange={(event) => setForm({ ...form, acceptTerms: event.target.checked })} /><span>{t.terms}</span></label>{error ? <p className="auth-error" role="alert">{error}</p> : null}<button className="btn btn-primary" disabled={submitting}>{submitting ? t.creating : t.create}</button></form>{providers.googleEnabled ? <a className="btn auth-google" href="/api/auth/google/start">G&nbsp; {es ? 'Registrarse con Google' : 'Sign up with Google'}</a> : null}<p className="auth-switch">{t.existing} <Link to="/login">{t.login}</Link></p></section></main>
}
