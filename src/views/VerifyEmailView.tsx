import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthAppearanceControls } from '../auth/AuthAppearanceControls'
import { authApi } from '../auth/authApi'
import { useSession } from '../auth/SessionProvider'

export function VerifyEmailView() {
  const { locale } = useSession()
  const es = locale === 'es'
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const initialEmail = params.get('email') ?? ''
  const [email, setEmail] = useState(initialEmail)
  const [state, setState] = useState<'idle' | 'working' | 'verified' | 'sent' | 'error'>(token ? 'working' : 'idle')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!token) return
    let active = true
    authApi.confirmEmailVerification(token).then(() => { if (active) setState('verified') }).catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : String(reason)); setState('error') } })
    return () => { active = false }
  }, [token])
  async function resend(event: React.FormEvent) {
    event.preventDefault(); setState('working'); setError('')
    try { await authApi.requestEmailVerification(email); setState('sent') }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setState('error') }
  }
  return <main className="auth-page"><AuthAppearanceControls /><section className="auth-card"><div className="auth-brand"><span>FP</span><div><small>FORGE PLANNER</small><h1>{es ? 'Verifica tu correo' : 'Verify your email'}</h1></div></div>
    {state === 'working' && token ? <p role="status">{es ? 'Verificando…' : 'Verifying…'}</p> : null}
    {state === 'verified' ? <><p className="admin-notice" role="status">{es ? 'Tu correo fue verificado correctamente.' : 'Your email was verified successfully.'}</p><Link className="btn btn-primary" to="/login">{es ? 'Iniciar sesión' : 'Sign in'}</Link></> : null}
    {!token && state !== 'sent' ? <><p>{es ? 'Te enviaremos un enlace seguro. Por seguridad, la respuesta no revela si una cuenta existe.' : 'We will send a secure link. For security, the response does not reveal whether an account exists.'}</p><form className="auth-form" onSubmit={resend}><label>{es ? 'Correo electrónico' : 'Email'}<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="btn btn-primary" disabled={state === 'working'}>{state === 'working' ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Enviar enlace' : 'Send link')}</button></form></> : null}
    {state === 'sent' ? <p className="admin-notice" role="status">{es ? 'Si la dirección es válida, recibirás instrucciones en breve.' : 'If the address is eligible, instructions will arrive shortly.'}</p> : null}
    {state === 'error' ? <p className="auth-error" role="alert">{error}</p> : null}
    {state !== 'verified' ? <p className="auth-switch"><Link to="/login">{es ? 'Volver al inicio de sesión' : 'Back to sign in'}</Link></p> : null}
  </section></main>
}
