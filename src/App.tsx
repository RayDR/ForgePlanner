import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { AnnualRoadmapView } from './views/AnnualRoadmapView'
import { MonthlyFocusView } from './views/MonthlyFocusView'
import { PlansHomeView } from './views/PlansHomeView'
import { useForgePlannerStore } from './hooks/useForgePlannerStore'

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

  useEffect(() => {
    ensureInitialized()
  }, [ensureInitialized])

  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<DefaultLandingRoute />} />
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
        <Route path="*" element={<Navigate to="/plans" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
