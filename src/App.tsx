import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { AnnualRoadmapView } from './views/AnnualRoadmapView'
import { MonthlyFocusView } from './views/MonthlyFocusView'
import { PlansHomeView } from './views/PlansHomeView'
import { useForgePlannerStore } from './hooks/useForgePlannerStore'
import { PublicOnly, RequireSession } from './auth/AuthGuards'
import { LoginView } from './views/LoginView'
import { RegisterView } from './views/RegisterView'
import { AccountView } from './views/AccountView'
import { ForgotPasswordView } from './views/ForgotPasswordView'
import { ResetPasswordView } from './views/ResetPasswordView'
import { VerifyEmailView } from './views/VerifyEmailView'
import { AdminView } from './views/AdminView'
import { RequirePermission } from './auth/PermissionGuard'
import { ImpersonationBanner } from './admin/ImpersonationBanner'
import { SharedPlanLinkView } from './views/SharedPlanLinkView'
import { useSession } from './auth/SessionProvider'

function DefaultLandingRoute() {
  return <Navigate to="/plans" replace />
}

function RequireActivePlan() {
  const activePlanId = useForgePlannerStore((state) => state.activePlanId)
  return activePlanId ? <Outlet /> : <Navigate to="/plans" replace />
}

function PlanRouteBootstrap() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const openPlan = useForgePlannerStore((state) => state.openPlan)
  const getPlanById = useForgePlannerStore((state) => state.getPlanById)
  const activePlanId = useForgePlannerStore((state) => state.activePlanId)

  useEffect(() => {
    if (!planId) {
      navigate('/plans', { replace: true })
      return
    }

    const plan = getPlanById(planId)
    if (!plan) {
      navigate('/plans', { replace: true })
      return
    }

    if (activePlanId !== planId) {
      openPlan(planId)
    }
  }, [activePlanId, planId, navigate, openPlan, getPlanById])

  return <Outlet />
}

function App() {
  const ensureInitialized = useForgePlannerStore((state) => state.ensureInitialized)
  const { session } = useSession()

  useEffect(() => {
    ensureInitialized(!session)
  }, [ensureInitialized, session])

  return (
    <BrowserRouter>
      <ImpersonationBanner />
      <Routes>
        <Route index element={<DefaultLandingRoute />} />
        <Route element={<PublicOnly />}>
          <Route path="login" element={<LoginView />} />
          <Route path="register" element={<RegisterView />} />
          <Route path="forgot-password" element={<ForgotPasswordView />} />
          <Route path="reset-password" element={<ResetPasswordView />} />
          <Route path="verify-email" element={<VerifyEmailView />} />
        </Route>
        <Route element={<RequireSession />}>
          <Route path="shared/:linkId" element={<SharedPlanLinkView />} />
          <Route path="account" element={<AccountView />} />
          <Route path="collaboration" element={<Navigate to="/plans" replace />} />
          <Route element={<RequirePermission permission="user.read" />}>
            <Route path="admin" element={<AdminView />} />
          </Route>
          <Route path="plans" element={<PlansHomeView />} />
          <Route path="plans/:planId" element={<PlanRouteBootstrap />}>
            <Route element={<RequireActivePlan />}>
              <Route element={<AppShell />}>
                <Route path="roadmap" element={<AnnualRoadmapView />} />
                <Route path="monthly">
                  <Route index element={<MonthlyFocusView />} />
                  <Route path=":monthId" element={<MonthlyFocusView />} />
                </Route>
                <Route path="planner" element={<Navigate to="../roadmap" replace />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/plans" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
