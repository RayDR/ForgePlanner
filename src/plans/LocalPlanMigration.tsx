import { useEffect, useMemo, useRef, useState } from 'react'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import type { ForgePlan } from '../types/forgePlanner'
import { planApi, PlanConflictError, PlanRequestError } from './planApi'
import { getIdentityScope, getScopeGeneration, isCurrentScope } from '../persistence/identityScope'
import { readGuestPlanCandidates, removeImportedGuestPlans, subscribeGuestPlanCandidates } from '../persistence/guestPlanMigration'
import { useSession } from '../auth/SessionProvider'
import { useNavigate } from 'react-router-dom'
import { buildVisiblePlanCards, eligibleLocalCards } from './visiblePlanCards'
import { Modal } from '../ui/Modal'
import { DownloadIcon, TrashIcon } from '../ui/icons'
import { synchronizeGuestCommentAuthors } from '../activity/commentAuthor'

function fingerprint(plan: ForgePlan) { return JSON.stringify({ title: plan.title, description: plan.description, startDate: plan.startDate, endDate: plan.endDate, planningMode: plan.planningMode, templateKey: plan.templateKey, categories: plan.categories, monthlyViewPreference: plan.monthlyViewPreference, snapshot: plan.snapshot }) }

export function LocalPlanMigration() {
  const plans = useForgePlannerStore((state) => state.plans)
  const archivedPlanIds = useForgePlannerStore((state) => state.archivedPlanIds)
  const reconcileRemotePlans = useForgePlannerStore((state) => state.reconcileRemotePlans)
  const replaceRemotePlan = useForgePlannerStore((state) => state.replaceRemotePlan)
  const markPlanSynced = useForgePlannerStore((state) => state.markPlanSynced)
  const deletePlan = useForgePlannerStore((state) => state.deletePlan)
  const setPlanSync = useForgePlannerStore((state) => state.setPlanSync)
  const acceptServerPlan = useForgePlannerStore((state) => state.acceptServerPlan)
  const syncByPlanId = useForgePlannerStore((state) => state.syncByPlanId)
  const locale = useRoadmapStore((state) => state.locale)
  const { session } = useSession()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false); const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<Record<string, { local: ForgePlan; remote: ForgePlan }>>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [guestPlans, setGuestPlans] = useState<ForgePlan[]>(readGuestPlanCandidates)
  const loaded = useRef(false); const savedFingerprints = useRef(new Map<string, string>()); const savedRevisions = useRef(new Map<string, number>()); const saving = useRef(new Set<string>())
  const visibleAccountPlans = useMemo(() => plans.filter((plan) => !archivedPlanIds.includes(plan.id)), [archivedPlanIds, plans])
  const pendingCards = useMemo(() => {
    const guestIds = new Set(guestPlans.map((plan) => plan.id))
    return eligibleLocalCards(buildVisiblePlanCards(visibleAccountPlans.filter((plan) => !guestIds.has(plan.id)), guestPlans, syncByPlanId, !session))
  }, [guestPlans, session, syncByPlanId, visibleAccountPlans])
  const pending = useMemo(() => pendingCards.map((card) => card.plan), [pendingCards])

  useEffect(() => {
    if (!session) {
      loaded.current = false
      return
    }
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
  }, [locale, reconcileRemotePlans, session])
  useEffect(() => { queueMicrotask(() => setGuestPlans(readGuestPlanCandidates())) }, [session])
  useEffect(() => subscribeGuestPlanCandidates(() => setGuestPlans(readGuestPlanCandidates())), [])
  useEffect(() => {
    if (!session || !loaded.current) return
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
  }, [plans, conflicts, markPlanSynced, reconcileRemotePlans, replaceRemotePlan, setPlanSync, syncByPlanId, session])

  function backup() { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), plans: pending }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'northstar-local-plans-backup.json'; anchor.click(); URL.revokeObjectURL(url) }
  function deleteLocalPlans(withBackup: boolean) {
    if (withBackup) backup()
    const guestIds = new Set(guestPlans.map((plan) => plan.id))
    const guestToRemove = pending.filter((plan) => guestIds.has(plan.id))
    if (guestToRemove.length) removeImportedGuestPlans(guestToRemove)
    pending.filter((plan) => !guestIds.has(plan.id)).forEach((plan) => deletePlan(plan.id))
    setShowDeleteDialog(false); setConfirmDelete(false); setError(''); setDismissed(false)
  }
  async function keepLocal(planId: string) { const conflict = conflicts[planId]; const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!conflict || !scope) return; try { const remote = await planApi.update(conflict.local, conflict.remote.remoteRevision); if (!isCurrentScope(scope, generation)) return; markPlanSynced(planId, remote.remoteRevision ?? 1); savedFingerprints.current.set(planId, fingerprint(conflict.local)); clearConflict(planId) } catch (reason) { if (isCurrentScope(scope, generation)) setError(reason instanceof Error ? reason.message : String(reason)) } }
  function clearConflict(planId: string) { setConflicts((current) => { const next = { ...current }; delete next[planId]; return next }) }

  async function saveOne(plan: ForgePlan) {
    if (!session) { navigate('/login', { state: { from: '/plans', localPlanId: plan.id } }); return }
    if (saving.current.has(plan.id)) return
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    if (!scope) return
    const clientMutationId = syncByPlanId[plan.id]?.clientMutationId ?? crypto.randomUUID()
    saving.current.add(plan.id)
    setPlanSync(plan.id, { state: 'saving', clientMutationId })
    try {
      const result = await planApi.create(synchronizeGuestCommentAuthors(plan, session), clientMutationId)
      if (!isCurrentScope(scope, generation)) return
      if (guestPlans.some((item) => item.id === plan.id)) {
        removeImportedGuestPlans([plan]); setGuestPlans((items) => items.filter((item) => item.id !== plan.id))
      }
      acceptServerPlan(result.plan, plan.id)
      setError('')
    } catch (reason) {
      if (isCurrentScope(scope, generation)) setPlanSync(plan.id, { state: 'failed', clientMutationId, error: { code: reason instanceof PlanRequestError ? reason.code : 'PLAN_SYNC_FAILED', message: reason instanceof Error ? reason.message : String(reason) } })
    } finally { saving.current.delete(plan.id) }
  }

  const conflictItems = Object.entries(conflicts)
  if ((!pending.length || dismissed) && !conflictItems.length) return null
  return <section className="local-plan-migration card" role="status">
    <div>
      <strong>{conflictItems.length ? (locale === 'es' ? 'Hay cambios simultáneos' : 'Concurrent changes detected') : (locale === 'es' ? 'Guarda tus planes en tu cuenta' : 'Save your plans to your account')}</strong>
      {conflictItems.length ? conflictItems.map(([planId, conflict]) => <div className="plan-conflict" key={planId}>
        <p>{locale === 'es' ? `“${conflict.local.title}” fue modificado en otra sesión. Elige qué versión conservar.` : `“${conflict.local.title}” was changed in another session. Choose which version to keep.`}</p>
        <div>
          <button className="btn" type="button" onClick={() => { replaceRemotePlan(conflict.remote); clearConflict(planId) }}>{locale === 'es' ? 'Cargar versión remota' : 'Load remote version'}</button>
          <button className="btn btn-primary" type="button" onClick={() => void keepLocal(planId)}>{locale === 'es' ? 'Conservar mis cambios' : 'Keep my changes'}</button>
        </div>
      </div>) : <>
        <p>{session ? (locale === 'es' ? 'Estos planes todavía no se han guardado en tu cuenta. Guárdalos individualmente o crea un respaldo antes de eliminarlos.' : 'These plans have not been saved to your account yet. Save them individually or create a backup before deleting them.') : <>{locale === 'es' ? 'Estos planes están guardados únicamente en este navegador. ' : 'These plans are stored only in this browser. '}<button className="local-plan-migration__inline-link" type="button" onClick={() => navigate('/login', { state: { from: '/plans' } })}>{locale === 'es' ? 'Inicia sesión' : 'Sign in'}</button>{locale === 'es' ? ' o ' : ' or '}<button className="local-plan-migration__inline-link" type="button" onClick={() => navigate('/register', { state: { from: '/plans' } })}>{locale === 'es' ? 'crea una cuenta' : 'create an account'}</button>{locale === 'es' ? ' para guardarlos de forma segura y acceder a ellos desde otros dispositivos.' : ' to save them securely and access them from other devices.'}</>}</p>
        <div className="local-plan-migration__items">
          {pendingCards.map(({ plan }) => { const sync = syncByPlanId[plan.id]; return <div className="local-plan-migration__item" key={plan.id}>
            <span className="plan-access-badge plan-sync-local">{locale === 'es' ? 'Solo local' : 'Local only'}</span><span>{plan.title}</span>
            <button className="btn" type="button" disabled={sync?.state === 'saving'} onClick={() => void saveOne(plan)}>{sync?.state === 'saving' ? (locale === 'es' ? 'Guardando…' : 'Saving…') : (locale === 'es' ? 'Guardar' : 'Save')}</button>
          </div> })}
        </div>
      </>}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
    {!conflictItems.length ? <div className="local-plan-migration__actions"><button className="icon-button" type="button" onClick={backup} aria-label={locale === 'es' ? 'Crear respaldo' : 'Create backup'} title={locale === 'es' ? 'Crear respaldo' : 'Create backup'}><DownloadIcon width={17} /></button><button className="icon-button icon-button--danger" type="button" onClick={() => setShowDeleteDialog(true)} aria-label={locale === 'es' ? 'Eliminar todos los planes locales' : 'Delete all local plans'} title={locale === 'es' ? 'Eliminar todos los planes locales' : 'Delete all local plans'}><TrashIcon width={17} /></button><button className="icon-button" type="button" onClick={() => setDismissed(true)} aria-label={locale === 'es' ? 'Cerrar' : 'Dismiss'}>×</button></div> : null}
    {showDeleteDialog ? <Modal open title={locale === 'es' ? 'Eliminar planes locales' : 'Delete local plans'} onClose={() => { setShowDeleteDialog(false); setConfirmDelete(false) }} closeLabel={locale === 'es' ? 'Cancelar' : 'Cancel'}><p>{locale === 'es' ? 'Estos planes solo existen en este navegador. Si los eliminas sin crear un respaldo, no podrás recuperarlos.' : 'These plans exist only in this browser. If you delete them without creating a backup, they cannot be recovered.'}</p><p>{locale === 'es' ? '¿Qué deseas hacer?' : 'What would you like to do?'}</p><div className="modal-footer"><button className="btn" type="button" onClick={() => { setShowDeleteDialog(false); setConfirmDelete(false) }}>{locale === 'es' ? 'Cancelar' : 'Cancel'}</button>{confirmDelete ? <button className="btn btn-danger" type="button" onClick={() => deleteLocalPlans(false)}>{locale === 'es' ? 'Confirmar eliminación' : 'Confirm deletion'}</button> : <><button className="btn" type="button" onClick={() => deleteLocalPlans(true)}>{locale === 'es' ? 'Respaldar y eliminar' : 'Back up and delete'}</button><button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)}>{locale === 'es' ? 'Eliminar sin respaldar' : 'Delete without backup'}</button></>}</div></Modal> : null}
  </section>
}
