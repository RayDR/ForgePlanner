import { useEffect, useMemo, useRef, useState } from 'react'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import type { ForgePlan } from '../types/forgePlanner'
import { planApi, PlanConflictError } from './planApi'

function fingerprint(plan: ForgePlan) { return JSON.stringify({ title: plan.title, description: plan.description, startDate: plan.startDate, endDate: plan.endDate, planningMode: plan.planningMode, templateKey: plan.templateKey, categories: plan.categories, monthlyViewPreference: plan.monthlyViewPreference, snapshot: plan.snapshot }) }

export function LocalPlanMigration() {
  const plans = useForgePlannerStore((state) => state.plans)
  const linkRemotePlans = useForgePlannerStore((state) => state.linkRemotePlans)
  const mergeRemotePlans = useForgePlannerStore((state) => state.mergeRemotePlans)
  const replaceRemotePlan = useForgePlannerStore((state) => state.replaceRemotePlan)
  const markPlanSynced = useForgePlannerStore((state) => state.markPlanSynced)
  const locale = useRoadmapStore((state) => state.locale)
  const [dismissed, setDismissed] = useState(false); const [working, setWorking] = useState(false); const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<Record<string, { local: ForgePlan; remote: ForgePlan }>>({})
  const loaded = useRef(false); const savedFingerprints = useRef(new Map<string, string>()); const saving = useRef(new Set<string>())
  const pending = useMemo(() => plans.filter((plan) => !plan.remoteId), [plans])

  useEffect(() => { planApi.list().then((remote) => { remote.forEach((plan) => savedFingerprints.current.set(plan.id, fingerprint(plan))); mergeRemotePlans(remote); loaded.current = true }).catch((reason) => setError(reason instanceof Error ? reason.message : (locale === 'es' ? 'No fue posible cargar los planes de la nube.' : 'Unable to load cloud plans.'))) }, [locale, mergeRemotePlans])
  useEffect(() => {
    if (!loaded.current) return
    const timer = window.setTimeout(() => plans.filter((plan) => plan.remoteId && plan.remoteAccess !== 'viewer' && !conflicts[plan.id]).forEach((plan) => {
      const currentFingerprint = fingerprint(plan)
      if (savedFingerprints.current.get(plan.id) === currentFingerprint || saving.current.has(plan.id)) return
      saving.current.add(plan.id); savedFingerprints.current.set(plan.id, currentFingerprint)
      void planApi.update(plan).then((remote) => markPlanSynced(plan.id, remote.remoteRevision ?? 1)).catch((reason) => {
        if (reason instanceof PlanConflictError) setConflicts((current) => ({ ...current, [plan.id]: { local: plan, remote: reason.current } }))
        else { savedFingerprints.current.delete(plan.id); setError(reason instanceof Error ? reason.message : String(reason)) }
      }).finally(() => saving.current.delete(plan.id))
    }), 1200)
    return () => window.clearTimeout(timer)
  }, [plans, conflicts, markPlanSynced])

  function backup() { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), plans }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'northstar-local-plans-backup.json'; anchor.click(); URL.revokeObjectURL(url) }
  async function migrate() { setWorking(true); setError(''); try { const remote = await planApi.import(pending); linkRemotePlans(remote.filter((item) => item.importKey).map((item) => ({ importKey: item.importKey!, remoteId: item.id, remoteRevision: item.revision }))) } catch (reason) { setError(reason instanceof Error ? reason.message : (locale === 'es' ? 'La importación falló.' : 'Import failed.')) } finally { setWorking(false) } }
  async function keepLocal(planId: string) { const conflict = conflicts[planId]; if (!conflict) return; try { const remote = await planApi.update(conflict.local, conflict.remote.remoteRevision); markPlanSynced(planId, remote.remoteRevision ?? 1); savedFingerprints.current.set(planId, fingerprint(conflict.local)); clearConflict(planId) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } }
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
