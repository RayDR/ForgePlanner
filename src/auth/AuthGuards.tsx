import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from './SessionProvider'
import { useRoadmapStore } from '../hooks/useRoadmapStore'

export function RequireSession() {
  const { session, loading } = useSession()
  const locale = useRoadmapStore((state) => state.locale)
  const location = useLocation()
  if (loading) return <main className="auth-loading" aria-live="polite">{locale === 'es' ? 'Cargando…' : 'Loading…'}</main>
  return session ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
}

export function PublicOnly() {
  const { session, loading } = useSession()
  const locale = useRoadmapStore((state) => state.locale)
  if (loading) return <main className="auth-loading" aria-live="polite">{locale === 'es' ? 'Cargando…' : 'Loading…'}</main>
  return session ? <Navigate to="/plans" replace /> : <Outlet />
}
