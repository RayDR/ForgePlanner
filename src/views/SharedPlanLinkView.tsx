import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { copy } from '../i18n'
import { planApi } from '../plans/planApi'

export function SharedPlanLinkView() {
  const { linkId } = useParams()
  const navigate = useNavigate()
  const locale = useRoadmapStore((state) => state.locale)
  const mergeRemotePlans = useForgePlannerStore((state) => state.mergeRemotePlans)
  const replaceRemotePlan = useForgePlannerStore((state) => state.replaceRemotePlan)
  const openPlan = useForgePlannerStore((state) => state.openPlan)
  const [error, setError] = useState('')
  const t = copy[locale]

  useEffect(() => {
    if (!linkId) return
    let active = true
    void planApi.openSharedLink(linkId).then((plan) => {
      if (!active) return
      mergeRemotePlans([plan])
      replaceRemotePlan(plan)
      const resolved = useForgePlannerStore.getState().plans.find((item) => item.remoteId === plan.remoteId) ?? plan
      openPlan(resolved.id)
      navigate(`/plans/${resolved.id}/roadmap`, { replace: true })
    }).catch(() => { if (active) setError(t.invalidShareLink) })
    return () => { active = false }
  }, [linkId, mergeRemotePlans, navigate, openPlan, replaceRemotePlan, t.invalidShareLink])

  const visibleError = linkId ? error : t.invalidShareLink
  return <main className="auth-page"><section className="auth-card" aria-live="polite">{visibleError ? <><p className="auth-error">{visibleError}</p><Link className="btn" to="/plans">{t.backToPlans}</Link></> : <p>{t.loadingSharedPlan}</p>}</section></main>
}
