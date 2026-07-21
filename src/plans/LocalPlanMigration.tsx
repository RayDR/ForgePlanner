import { useEffect, useMemo, useRef, useState } from 'react'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import type { ForgePlan } from '../types/forgePlanner'
import { planApi, PlanConflictError, PlanRequestError } from './planApi'
import { getIdentityScope, getScopeGeneration, isCurrentScope } from '../persistence/identityScope'
import { readGuestPlanCandidates, removeImportedGuestPlans } from '../persistence/guestPlanMigration'

function fingerprint(plan: ForgePlan) { return JSON.stringify({ title: plan.title, description: plan.description, startDate: plan.startDate, endDate: plan.endDate, planningMode: plan.planningMode, templateKey: plan.templateKey, categories: plan.categories, monthlyViewPreference: plan.monthlyViewPreference, snapshot: plan.snapshot }) }

export function LocalPlanMigration() {
  const plans = useForgePlannerStore((state) => state.plans)
  const linkRemotePlans = useForgePlannerStore((state) => state.linkRemotePlans)
  const reconcileRemotePlans = useForgePlannerStore((state) => state.reconcileRemotePlans)
  const replaceRemotePlan = useForgePlannerStore((state) => state.replaceRemotePlan)
  const markPlanSynced = useForgePlannerStore((state) => state.markPlanSynced)
  const setPlanSync = useForgePlannerStore((state) => state.setPlanSync)
  const syncByPlanId = useForgePlannerStore((state) => state.syncByPlanId)
  const locale = useRoadmapStore((state) => state.locale)
  const [dismissed, setDismissed] = useState(false); const [working, setWorking] = useState(false); const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<Record<string, { local: ForgePlan; remote: ForgePlan }>>({})
  const [guestPlans, setGuestPlans] = useState<ForgePlan[]>(readGuestPlanCandidates)
  const loaded = useRef(false); const savedFingerprints = useRef(new Map<string, string>()); const savedRevisions = useRef(new Map<string, number>()); const saving = useRef(new Set<string>())
  const accountPending = useMemo(() => plans.filter((plan) => !plan.remoteId && (syncByPlanId[plan.id]?.state ?? 'local') === 'local'), [plans, syncByPlanId])
  const pending = useMemo(() => [...accountPending, ...guestPlans.filter((guest) => !accountPending.some((plan) => plan.id === guest.id))], [accountPending, guestPlans])

  useEffect(() => {
    const controller = new AbortController()
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    void planApi.list(controller.signal).then((remote) => {
      if (!scope || !isCurrentScope(scope, generation)) return
      remote.forEach((plan) => { savedFingerprints.current.set(plan.id, fingerprint(plan)); if (plan.remoteRevision) savedRevisions.current.set(plan.id, plan.remoteRevision) })
      reconcileRemotePlans(remote); loaded.current = true
    }).catch((reason) => {
      if (controller.signal.aborted || !scope || !isCurrentScope(scope, generation)) return
      setError(reason instanceof Error ? reason.message : (locale === 'es' ? 'No fue posible cargar los planes de la nube.' : 'Unable to load cloud plans.'))
    })
    return () => controller.abort()
  }, [locale, reconcileRemotePlans])
  useEffect(() => {
    if (!loaded.current) return
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    const controller = new AbortController()
    const timer = window.setTimeout(() => plans.filter((plan) => plan.remoteId && plan.remoteAccess !== 'viewer' && syncByPlanId[plan.id]?.state !== 'deleting' && !conflicts[plan.id]).forEach((plan) => {
      if (!scope || !isCurrentScope(scope, generation)) return
      const currentFingerprint = fingerprint(plan)
      const acceptedRevision = savedRevisions.current.get(plan.id)
      if (plan.remoteRevision && acceptedRevision && plan.remoteRevision !== acceptedRevision && syncByPlanId[plan.id]?.state === 'synced') {
        savedFingerprints.current.set(plan.id, currentFingerprint)
        savedRevisions.current.set(plan.id, plan.remoteRevision)
        return
      }
      if (!savedFingerprints.current.has(plan.id)) {
        savedFingerprints.current.set(plan.id, currentFingerprint)
        if (plan.remoteRevision) savedRevisions.current.set(plan.id, plan.remoteRevision)
        return
      }
      if (savedFingerprints.current.get(plan.id) === currentFingerprint || saving.current.has(plan.id)) return
      saving.current.add(plan.id); savedFingerprints.current.set(plan.id, currentFingerprint)
      setPlanSync(plan.id, { state: 'saving' })
      void planApi.update(plan, plan.remoteRevision ?? 1, controller.signal).then((remote) => { if (isCurrentScope(scope, generation)) { if (remote.remoteRevision) savedRevisions.current.set(plan.id, remote.remoteRevision); replaceRemotePlan(remote) } }).catch(async (reason) => {
        if (controller.signal.aborted) return
        if (!isCurrentScope(scope, generation)) return
        if (reason instanceof PlanConflictError) {
          setPlanSync(plan.id, { state: 'conflict', error: { code: 'PLAN_VERSION_CONFLICT', message: reason.message } })
          try {
            const remote = await planApi.get(plan.remoteId!)
            if (isCurrentScope(scope, generation)) setConflicts((current) => ({ ...current, [plan.id]: { local: plan, remote } }))
          } catch { /* Access may have been revoked after the conflict response. */ }
        } else {
          const offline = reason instanceof TypeError
          setPlanSync(plan.id, { state: offline ? 'offline' : 'failed', error: { code: reason instanceof PlanRequestError ? reason.code : 'PLAN_SYNC_FAILED', message: reason instanceof Error ? reason.message : String(reason) } })
          savedFingerprints.current.delete(plan.id); setError(reason instanceof Error ? reason.message : String(reason))
          if (reason instanceof PlanRequestError && (reason.status === 403 || reason.status === 404)) {
            void planApi.list().then((remote) => { if (isCurrentScope(scope, generation)) reconcileRemotePlans(remote) })
          }
        }
      }).finally(() => saving.current.delete(plan.id))
    }), 1200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [plans, conflicts, markPlanSynced, reconcileRemotePlans, replaceRemotePlan, setPlanSync, syncByPlanId])

  function backup() { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), plans }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'northstar-local-plans-backup.json'; anchor.click(); URL.revokeObjectURL(url) }
  async function migrate() {
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    if (!scope) return
    setWorking(true); setError('')
    try {
      const remote = await planApi.import(pending)
      if (!isCurrentScope(scope, generation)) return
      linkRemotePlans(remote.filter((item) => item.importKey).map((item) => ({ importKey: item.importKey!, remoteId: item.id, remoteRevision: item.revision })))
      if (guestPlans.length) {
        removeImportedGuestPlans(guestPlans)
        setGuestPlans([])
      }
      const currentRemotePlans = await planApi.list()
      if (isCurrentScope(scope, generation)) reconcileRemotePlans(currentRemotePlans)
    } catch (reason) {
      if (!isCurrentScope(scope, generation)) return
      setError(reason instanceof Error ? reason.message : (locale === 'es' ? 'La importación falló.' : 'Import failed.'))
    } finally { if (isCurrentScope(scope, generation)) setWorking(false) }
  }
  async function keepLocal(planId: string) { const conflict = conflicts[planId]; const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!conflict || !scope) return; try { const remote = await planApi.update(conflict.local, conflict.remote.remoteRevision); if (!isCurrentScope(scope, generation)) return; markPlanSynced(planId, remote.remoteRevision ?? 1); savedFingerprints.current.set(planId, fingerprint(conflict.local)); clearConflict(planId) } catch (reason) { if (isCurrentScope(scope, generation)) setError(reason instanceof Error ? reason.message : String(reason)) } }
  function clearConflict(planId: string) { setConflicts((current) => { const next = { ...current }; delete next[planId]; return next }) }

  const conflictItems = Object.entries(conflicts)
  if ((!pending.length || dismissed) && !error && !conflictItems.length) return null
  return <section className="local-plan-migration card" role="status">
    <div>
      <strong>{conflictItems.length ? (locale === 'es' ? 'Hay cambios simultáneos' : 'Concurrent changes detected') : (locale === 'es' ? 'Guarda tus planes en tu cuenta' : 'Save your plans to your account')}</strong>
      {conflictItems.length ? conflictItems.map(([planId, conflict]) => <div className="plan-conflict" key={planId}>
        <p>{locale === 'es' ? `“${conflict.local.title}” fue modificado en otra sesión. Elige qué versión conservar.` : `“${conflict.local.title}” was changed in another session. Choose which version to keep.`}</p>
        <div>
          <button className="btn" type="button" onClick={() => { replaceRemotePlan(conflict.remote); clearConflict(planId) }}>{locale === 'es' ? 'Cargar versión remota' : 'Load remote version'}</button>
          <button className="btn btn-primary" type="button" onClick={() => void keepLocal(planId)}>{locale === 'es' ? 'Conservar mis cambios' : 'Keep my changes'}</button>
        </div>
      </div>) : <p>{locale === 'es' ? `${pending.length} planes permanecen únicamente en este dispositivo. Crea un respaldo y luego impórtalos de forma segura.` : `${pending.length} plans remain only on this device. Create a backup, then import them safely.`}</p>}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
    {!conflictItems.length ? <div><button className="btn" onClick={backup}>{locale === 'es' ? 'Descargar respaldo' : 'Download backup'}</button>{pending.length ? <button className="btn btn-primary" disabled={working} onClick={() => void migrate()}>{working ? (locale === 'es' ? 'Importando…' : 'Importing…') : (locale === 'es' ? 'Importar a mi cuenta' : 'Import to my account')}</button> : null}<button className="btn" onClick={() => setDismissed(true)} aria-label={locale === 'es' ? 'Cerrar' : 'Dismiss'}>×</button></div> : null}
  </section>
}
