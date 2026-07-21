import { useEffect, useState } from 'react'
import type { ForgePlan } from '../types/forgePlanner'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { getIdentityScope, getScopeGeneration, isCurrentScope } from '../persistence/identityScope'
import { copy, type Locale } from '../i18n'
import { planApi, type PlanVersionDetail, type PlanVersionMetadata, type PlanVersionSource } from './planApi'
import { ModalPortal } from '../ui/Modal'

const sourceKey: Record<PlanVersionSource, keyof typeof copy.en> = {
  USER: 'versionSourceUser', IMPORT: 'versionSourceImport', MIGRATION: 'versionSourceMigration', SYSTEM: 'versionSourceSystem', TRASH_DELETE: 'versionSourceTrashDelete', TRASH_RESTORE: 'versionSourceTrashRestore', VERSION_RESTORE: 'versionSourceRestore', AI_GENERATION: 'versionSourceAiGeneration', AI_REFINEMENT: 'versionSourceAiRefinement', AI_PATCH: 'versionSourceAiPatch',
}

export function PlanVersionHistory({ plan, locale, onClose }: { plan: ForgePlan; locale: Locale; onClose: () => void }) {
  const [versions, setVersions] = useState<PlanVersionMetadata[]>([])
  const [selected, setSelected] = useState<PlanVersionDetail | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const replaceRemotePlan = useForgePlannerStore((state) => state.replaceRemotePlan)
  const activePlanId = useForgePlannerStore((state) => state.activePlanId)
  const t = copy[locale]

  useEffect(() => {
    if (!plan.remoteId) return
    const controller = new AbortController(); const scope = getIdentityScope(); const generation = getScopeGeneration()
    if (!scope) return
    void planApi.versions(plan.remoteId, 1, 25, controller.signal).then((result) => { if (isCurrentScope(scope, generation)) { setVersions(result.versions); setTotal(result.total) } }).catch((reason) => { if (!controller.signal.aborted && isCurrentScope(scope, generation)) setError(reason instanceof Error ? reason.message : String(reason)) }).finally(() => { if (isCurrentScope(scope, generation)) setLoading(false) })
    return () => controller.abort()
  }, [plan.remoteId, plan.id])

  async function inspect(version: PlanVersionMetadata) {
    if (!plan.remoteId || plan.remoteAccess === 'viewer') return
    const controller = new AbortController(); const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    setLoading(true); setError(''); setSelected(null)
    try { const detail = await planApi.version(plan.remoteId, version.revision, controller.signal); if (isCurrentScope(scope, generation)) setSelected(detail) }
    catch (reason) { if (isCurrentScope(scope, generation)) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (isCurrentScope(scope, generation)) setLoading(false) }
  }

  async function loadMore() {
    if (!plan.remoteId) return
    const controller = new AbortController(); const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    const next = page + 1; setLoading(true)
    try { const result = await planApi.versions(plan.remoteId, next, 25, controller.signal); if (isCurrentScope(scope, generation)) { setVersions((current) => [...current, ...result.versions]); setPage(next); setTotal(result.total) } }
    catch (reason) { if (!controller.signal.aborted && isCurrentScope(scope, generation)) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (isCurrentScope(scope, generation)) setLoading(false) }
  }

  async function restoreSelected() {
    if (!selected || !plan.remoteId || !window.confirm(t.restoreVersionConfirm)) return
    const controller = new AbortController(); const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    setRestoring(true); setError('')
    try {
      const result = await planApi.restoreVersion(plan.remoteId, selected.revision, plan.remoteRevision ?? 1, controller.signal)
      if (!isCurrentScope(scope, generation)) return
      replaceRemotePlan(result.plan)
      if (activePlanId === plan.id) useRoadmapStore.getState().loadSnapshot(result.plan.snapshot)
      const refreshed = await planApi.versions(plan.remoteId, 1, 25, controller.signal)
      if (isCurrentScope(scope, generation)) { setVersions(refreshed.versions); setTotal(refreshed.total); setPage(1); setSelected(null) }
    } catch (reason) { if (!controller.signal.aborted && isCurrentScope(scope, generation)) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (isCurrentScope(scope, generation)) setRestoring(false) }
  }

  return <ModalPortal><div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-shell plan-history-modal" role="dialog" aria-modal="true" aria-labelledby="plan-history-title">
      <header className="modal-header"><div><h2 id="plan-history-title">{t.versionHistory}</h2><p>{t.versionHistoryDescription}</p></div><button type="button" className="btn btn-ghost" onClick={onClose} aria-label={t.cancel}>×</button></header>
      <div className="plan-history-layout">
        <div className="plan-history-list" aria-busy={loading}>{versions.map((version) => <button type="button" key={version.id} className={selected?.revision === version.revision ? 'plan-history-row is-selected' : 'plan-history-row'} onClick={() => void inspect(version)} disabled={plan.remoteAccess === 'viewer'}><span><strong>{t.revision} {version.revision}</strong>{version.isCurrent ? <small>{t.currentVersion}</small> : null}</span><span>{t[sourceKey[version.source]]}</span><time>{new Date(version.createdAt).toLocaleString(locale)}</time>{version.actorDisplayName ? <small>{t.versionActor}: {version.actorDisplayName}</small> : null}</button>)}</div>
        <div className="plan-history-detail">{error ? <p className="auth-error">{error}</p> : null}{loading && !versions.length ? <p>{t.versionHistoryLoading}</p> : null}{plan.remoteAccess === 'viewer' ? <p>{t.versionHistoryViewerNotice}</p> : selected ? <><h3>{t.versionDetails}</h3><dl><div><dt>{t.title}</dt><dd>{selected.summary.title}</dd></div><div><dt>{t.startDate}</dt><dd>{selected.summary.startDate}</dd></div><div><dt>{t.endDate}</dt><dd>{selected.summary.endDate}</dd></div><div><dt>{t.activities}</dt><dd>{selected.summary.activities}</dd></div><div><dt>{t.milestones}</dt><dd>{selected.summary.milestones}</dd></div></dl><button type="button" className="btn btn-primary" disabled={restoring || selected.revision === plan.remoteRevision} onClick={() => void restoreSelected()}>{restoring ? t.versionHistoryRestoring : t.restoreVersion}</button></> : <p>{t.versionHistorySelect}</p>}</div>
      </div>
      {versions.length < total ? <footer className="modal-footer"><button type="button" className="btn" disabled={loading} onClick={() => void loadMore()}>{t.loadMore}</button></footer> : null}
    </section>
  </div></ModalPortal>
}
