import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { adminApi } from './adminApi'

export function ImpersonationBanner() {
  const { session, locale, refreshSession } = useSession(); const navigate = useNavigate()
  if (!session?.impersonation) return null
  const es = locale === 'es'
  return <div className="impersonation-banner" role="alert"><span><strong>{es ? 'Modo de impersonación' : 'Impersonation mode'}</strong> · {es ? 'Estás viendo el sistema como' : 'You are viewing the system as'} {session.user.profile?.displayName ?? session.user.email}</span><button className="btn" type="button" onClick={async () => { await adminApi.endImpersonation(); await refreshSession(); navigate('/admin') }}>{es ? 'Terminar impersonación' : 'End impersonation'}</button></div>
}
