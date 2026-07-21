import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from './SessionProvider'

export function RequirePermission({ permission }: { permission: string }) {
  const { session } = useSession()
  return session?.permissions.includes(permission) ? <Outlet /> : <Navigate to="/plans" replace />
}
