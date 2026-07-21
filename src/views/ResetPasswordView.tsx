import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthAppearanceControls } from '../auth/AuthAppearanceControls'
import { authApi } from '../auth/authApi'
import { useSession } from '../auth/SessionProvider'

export function ResetPasswordView() {
  const { locale } = useSession(); const es = locale === 'es'; const [params] = useSearchParams(); const token = params.get('token') ?? ''; const [password, setPassword] = useState(''); const [done, setDone] = useState(false); const [error, setError] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); try { await authApi.resetPassword(token, password); setDone(true) } catch (reason) { setError(reason instanceof Error ? reason.message : (es ? 'No fue posible restablecer la contraseña.' : 'Reset failed.')) } }
  return <main className="auth-page"><AuthAppearanceControls /><section className="auth-card"><div className="auth-brand"><span>FP</span><div><small>FORGE PLANNER</small><h1>{es ? 'Nueva contraseña' : 'New password'}</h1></div></div>{done ? <p>{es ? 'La contraseña fue actualizada. Ya puedes iniciar sesión.' : 'Your password was updated. You can now sign in.'}</p> : <form className="auth-form" onSubmit={submit}><label>{es ? 'Contraseña' : 'Password'}<input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>{es ? 'Mínimo 12 caracteres, mayúscula, minúscula y número.' : 'At least 12 characters, uppercase, lowercase and a number.'}</small></label>{error ? <p className="auth-error">{error}</p> : null}<button className="btn btn-primary" disabled={!token}>{es ? 'Actualizar contraseña' : 'Update password'}</button></form>}<p className="auth-switch"><Link to="/login">{es ? 'Ir al inicio de sesión' : 'Go to sign in'}</Link></p></section></main>
}
