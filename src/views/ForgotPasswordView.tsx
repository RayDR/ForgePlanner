import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthAppearanceControls } from '../auth/AuthAppearanceControls'
import { authApi } from '../auth/authApi'
import { useSession } from '../auth/SessionProvider'

export function ForgotPasswordView() {
  const { locale } = useSession(); const [params] = useSearchParams(); const es = locale === 'es'; const [email, setEmail] = useState(params.get('email') ?? ''); const [sent, setSent] = useState(false); const [error, setError] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); try { await authApi.forgotPassword(email); setSent(true) } catch (reason) { setError(reason instanceof Error ? reason.message : (es ? 'La solicitud falló.' : 'Request failed.')) } }
  return <main className="auth-page"><AuthAppearanceControls /><section className="auth-card"><div className="auth-brand"><span>FP</span><div><small>FORGE PLANNER</small><h1>{es ? 'Recupera tu contraseña' : 'Recover your password'}</h1></div></div>{sent ? <p>{es ? 'Si la cuenta existe, recibirás un enlace temporal con las instrucciones.' : 'If the account exists, you will receive a temporary link with instructions.'}</p> : <form className="auth-form" onSubmit={submit}><label>{es ? 'Correo electrónico' : 'Email'}<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{error ? <p className="auth-error">{error}</p> : null}<button className="btn btn-primary">{es ? 'Enviar instrucciones' : 'Send instructions'}</button></form>}<p className="auth-switch"><Link to="/login">{es ? 'Volver al inicio de sesión' : 'Back to sign in'}</Link></p></section></main>
}
