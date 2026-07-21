import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { AuthAppearanceControls } from '../auth/AuthAppearanceControls'
import { authApi } from '../auth/authApi'
import { executeRecaptcha } from '../auth/recaptcha'

export function LoginView() {
  const { login, locale } = useSession()
  const es = locale === 'es'
  const t = es ? { welcome: 'Bienvenido de nuevo', intro: 'Inicia sesión para acceder de forma segura a tus planes.', email: 'Correo electrónico', password: 'Contraseña', sending: 'Ingresando…', submit: 'Iniciar sesión', new: '¿Nuevo en NorthStar?', create: 'Crear una cuenta', error: 'No fue posible iniciar sesión.' } : { welcome: 'Welcome back', intro: 'Sign in to access your plans securely.', email: 'Email', password: 'Password', sending: 'Signing in…', submit: 'Sign in', new: 'New to NorthStar?', create: 'Create an account', error: 'Unable to sign in.' }
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [providers, setProviders] = useState({ googleEnabled: false, recaptchaSiteKey: null as string | null })
  useEffect(() => { authApi.config().then(setProviders).catch(() => undefined) }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSubmitting(true); setError('')
    try { const token = await executeRecaptcha(providers.recaptchaSiteKey, 'login'); await login(email, password, token); const from = (location.state as { from?: string } | null)?.from; navigate(from?.startsWith('/') ? from : '/plans', { replace: true }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error) }
    finally { setSubmitting(false) }
  }
  return <main className="auth-page"><AuthAppearanceControls /><Link className="btn btn-ghost back-to-plans" to="/plans">← {es ? 'Volver a planes' : 'Back to plans'}</Link><section className="auth-card"><div className="auth-brand"><span>FP</span><div><small>FORGE PLANNER</small><h1>{t.welcome}</h1></div></div><p>{t.intro}</p><form onSubmit={submit} className="auth-form"><label>{t.email}<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>{t.password}<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><Link className="auth-forgot" to="/forgot-password">{es ? '¿Olvidaste tu contraseña?' : 'Forgot your password?'}</Link>{error ? <p className="auth-error" role="alert">{error}</p> : null}<button className="btn btn-primary" disabled={submitting}>{submitting ? t.sending : t.submit}</button></form>{providers.googleEnabled ? <a className="btn auth-google" href="/api/auth/google/start">G&nbsp; {es ? 'Continuar con Google' : 'Continue with Google'}</a> : null}<p className="auth-switch">{t.new} <Link to="/register">{t.create}</Link></p></section></main>
}
