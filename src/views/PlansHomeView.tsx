import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createForgePlanDraft, useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { copy } from '../i18n'
import type { Locale } from '../i18n'
import { getProjectYears, buildYearMonths, activitiesForMonth } from '../utils/dateUtils'
import { getAverageProgress } from '../utils/progressUtils'
import type { ForgePlan, PlanTemplateKey, PlanningMode, ServerTrashPlan } from '../types/forgePlanner'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import { PlanSavingsConfig } from '../ui/PlanSavingsConfig'
import { PlanCategoryEditor } from '../ui/PlanCategoryEditor'
import type { CategoryMeta } from '../types/roadmap'
import { getCategoryMeta } from '../data/northstarMockData'
import { useSession } from '../auth/SessionProvider'
import { LocalPlanMigration } from '../plans/LocalPlanMigration'
import { PlanInvitations } from '../plans/PlanInvitations'
import { PlanSharingDialog } from '../plans/PlanSharingDialog'
import { sharingApi } from '../plans/sharingApi'
import { planApi, PlanRequestError } from '../plans/planApi'
import { getIdentityScope, getScopeGeneration, isCurrentScope } from '../persistence/identityScope'
import { parsePlanDocument } from '../../shared/plan-contract/index.js'
import {
  ArchiveIcon,
  CopyIcon,
  DownloadIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  UsersIcon,
  LockIcon,
  ShareIcon,
} from '../ui/icons'
import { HeaderActions } from '../layout/HeaderActions'

type PlansFilter = 'active' | 'archived' | 'deleted'

interface PlanDraft {
  title: string
  description: string
  startDate: string
  endDate: string
  planningMode: PlanningMode
  templateKey: PlanTemplateKey
  savingsEnabled: boolean
  savingsMode: 'free' | 'monthly-target'
  defaultMonthlyTarget: number
  categoryDefinitions: CategoryMeta[]
}

interface PlanPreviewMonth {
  id: string
  label: string
  count: number
  progress: number
  milestoneCount: number
  active: boolean
}

interface PlanPreviewYear {
  year: number
  months: PlanPreviewMonth[]
  activeCount: number
  milestoneCount: number
}

const templateOptions = (locale: Locale) => [
  { key: 'blank', label: copy[locale].blankTemplate },
  { key: 'career-roadmap', label: copy[locale].careerTemplate },
  { key: 'certification-plan', label: copy[locale].certificationTemplate },
  { key: 'savings-goal', label: copy[locale].savingsTemplate },
  { key: 'health-lifestyle', label: copy[locale].healthTemplate },
  { key: 'immigration-plan', label: copy[locale].immigrationTemplate },
] as const

function defaultDraft(locale: Locale): PlanDraft {
  const today = new Date()
  const end = new Date(today)
  end.setMonth(end.getMonth() + 6)

  return {
    title: '',
    description: '',
    startDate: today.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    planningMode: 'annual',
    templateKey: 'blank',
    savingsEnabled: false,
    savingsMode: 'free',
    defaultMonthlyTarget: 0,
    categoryDefinitions: [
      { key: 'general', label: 'General', tone: 'slate', isDefault: true },
      { key: 'personal', label: 'Personal', tone: 'blue' },
      { key: 'work', label: locale === 'es' ? 'Trabajo' : 'Work', tone: 'green' },
    ],
  }
}

function buildPlanPreview(plan: ForgePlan, locale: Locale): PlanPreviewYear[] {
  const years = getProjectYears(plan.startDate, plan.endDate)
  return years.map((year) => {
    const yearMonths = buildYearMonths(year, plan.startDate, plan.endDate, locale)
    const months = yearMonths.map((month) => {
      const monthActivities = activitiesForMonth(plan.snapshot.activities, month.id)
      const progress = getAverageProgress(plan.snapshot.activities, month.id)
      return {
        id: month.id,
        label: month.shortLabel,
        count: monthActivities.length,
        progress,
        milestoneCount: plan.snapshot.project.milestones.filter((milestone) => milestone.monthId === month.id).length,
        active: month.active,
      }
    })

    return {
      year,
      months,
      activeCount: months.reduce((sum, month) => sum + month.count, 0),
      milestoneCount: months.reduce((sum, month) => sum + month.milestoneCount, 0),
    }
  })
}

function getPlanCategoryDefinitions(plan: ForgePlan) {
  if (plan.snapshot.project.categoryDefinitions?.length) return plan.snapshot.project.categoryDefinitions
  return [...new Map(plan.snapshot.activities.map((activity) => [activity.category, { ...getCategoryMeta(activity.category), key: activity.category }])).values()]
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function PlanPreviewCarousel({ plan, years, locale, onOpenYear, onOpenMonth }: {
  plan: ForgePlan
  years: PlanPreviewYear[]
  locale: 'es' | 'en'
  onOpenYear: (plan: ForgePlan, year: number) => void
  onOpenMonth: (plan: ForgePlan, monthId: string) => void
}) {
  const todayId = new Date().toISOString().slice(0, 7)
  const previewLocale = locale === 'es' ? 'es-MX' : 'en-US'
  const labels = locale === 'es'
    ? { empty: 'Sin periodos activos', previous: 'Anterior', next: 'Siguiente', activities: 'actividades', noActivities: 'Sin actividades todavía', items: 'elementos' }
    : { empty: 'No active periods', previous: 'Previous', next: 'Next', activities: 'activities', noActivities: 'No activities yet', items: 'items' }
  const monthLabel = (monthId: string) => new Intl.DateTimeFormat(previewLocale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${monthId}-01T00:00:00Z`)).replace('.', '')
  const activeMonths = years.flatMap((year) => year.months.filter((month) => month.active).map((month) => ({ ...month, year: year.year })))
  const initialYearIndex = Math.max(0, years.findIndex((year) => year.year >= Number(todayId.slice(0, 4))))
  const initialMonthIndex = Math.max(0, activeMonths.findIndex((month) => month.id >= todayId))
  const [index, setIndex] = useState(plan.planningMode === 'monthly' ? initialMonthIndex : initialYearIndex)
  const itemCount = plan.planningMode === 'monthly' ? activeMonths.length : years.length
  const safeIndex = Math.min(index, Math.max(0, itemCount - 1))
  const year = years[safeIndex]
  const month = activeMonths[safeIndex]

  if (!itemCount) return <div className="plan-preview-empty">{labels.empty}</div>

  return (
    <div className="plan-preview-carousel">
      <button type="button" className="plan-preview-arrow" aria-label={labels.previous} disabled={safeIndex === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>‹</button>
      <div className="plan-preview-single">
        {plan.planningMode === 'monthly' && month ? (
          <button type="button" className="plan-preview-month-detail" onClick={() => onOpenMonth(plan, month.id)}>
            <strong>{month.label} {month.year}</strong>
            <span>{month.count} {labels.activities} · {month.progress}%</span>
            <small>{plan.snapshot.activities.filter((activity) => activity.monthlyEntries[month.id]).slice(0, 3).map((activity) => activity.title).join(' · ') || labels.noActivities}</small>
          </button>
        ) : year ? (
          <div className="plan-preview-year-single">
            <button type="button" className="plan-preview-single__year" onClick={() => onOpenYear(plan, year.year)}>{year.year}</button>
            <div className="plan-preview-month-grid">
              {year.months.map((entry) => (
                <button key={entry.id} type="button" className={`plan-preview-month plan-preview-month--${entry.count ? 2 : 0} ${entry.active && entry.count ? '' : 'is-locked'}`} aria-label={`${monthLabel(entry.id)}: ${entry.count} ${labels.items}`} title={`${entry.count} ${labels.items}`} onClick={() => onOpenMonth(plan, entry.id)}>
                  <span>{monthLabel(entry.id)}</span><small className="plan-preview-count">{entry.count}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <span className="plan-preview-position">{safeIndex + 1} / {itemCount}</span>
      </div>
      <button type="button" className="plan-preview-arrow" aria-label={labels.next} disabled={safeIndex >= itemCount - 1} onClick={() => setIndex((current) => Math.min(itemCount - 1, current + 1))}>›</button>
    </div>
  )
}

export function PlansHomeView() {
  const { setAppearance, session } = useSession()
  const navigate = useNavigate()
  const locale = useRoadmapStore((state) => state.locale)
  const theme = useRoadmapStore((state) => state.theme)
  const setLocale = useRoadmapStore((state) => state.setLocale)
  const setTheme = useRoadmapStore((state) => state.setTheme)
  const setSelectedYear = useRoadmapStore((state) => state.setSelectedYear)
  const plans = useForgePlannerStore((state) => state.plans)
  const archivedPlanIds = useForgePlannerStore((state) => state.archivedPlanIds)
  const deletedPlans = useForgePlannerStore((state) => state.deletedPlans)
  const openPlan = useForgePlannerStore((state) => state.openPlan)
  const quickEditPlan = useForgePlannerStore((state) => state.quickEditPlan)
  const duplicatePlan = useForgePlannerStore((state) => state.duplicatePlan)
  const archivePlan = useForgePlannerStore((state) => state.archivePlan)
  const unarchivePlan = useForgePlannerStore((state) => state.unarchivePlan)
  const deletePlan = useForgePlannerStore((state) => state.deletePlan)
  const restoreDeletedPlan = useForgePlannerStore((state) => state.restoreDeletedPlan)
  const permanentlyDeletePlan = useForgePlannerStore((state) => state.permanentlyDeletePlan)
  const clearDeletedPlans = useForgePlannerStore((state) => state.clearDeletedPlans)
  const createPlan = useForgePlannerStore((state) => state.createPlan)
  const mergeRemotePlans = useForgePlannerStore((state) => state.mergeRemotePlans)
  const setRemoteSharingEnabled = useForgePlannerStore((state) => state.setRemoteSharingEnabled)
  const syncByPlanId = useForgePlannerStore((state) => state.syncByPlanId)
  const retainFailedCreate = useForgePlannerStore((state) => state.retainFailedCreate)
  const acceptServerPlan = useForgePlannerStore((state) => state.acceptServerPlan)
  const setPlanSync = useForgePlannerStore((state) => state.setPlanSync)
  const removeConfirmedRemotePlan = useForgePlannerStore((state) => state.removeConfirmedRemotePlan)

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [quickEditTarget, setQuickEditTarget] = useState<ForgePlan | null>(null)
  const [quickEditDraft, setQuickEditDraft] = useState<PlanDraft | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [plansFilter, setPlansFilter] = useState<PlansFilter>('active')
  const [createDraft, setCreateDraft] = useState<PlanDraft>(() => defaultDraft(locale))
  const menuRef = useRef<HTMLDivElement | null>(null)
  const plansScrollerRef = useRef<HTMLElement | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [undoDelete, setUndoDelete] = useState<{ kind: 'local'; deletedId: string; title: string } | { kind: 'remote'; remoteId: string; revision: number; title: string } | null>(null)
  const [accountTrash, setAccountTrash] = useState<ServerTrashPlan[]>([])
  const [accountTrashTotal, setAccountTrashTotal] = useState(0)
  const [trashPage, setTrashPage] = useState(1)
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashError, setTrashError] = useState('')
  const [sharingPlan, setSharingPlan] = useState<ForgePlan | null>(null)
  const [confirmClearDeleted, setConfirmClearDeleted] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState('')
  const createRequestRef = useRef<AbortController | null>(null)

  const t = copy[locale]
  const activePlans = useMemo(
    () => plans.filter((plan) => !archivedPlanIds.includes(plan.id)),
    [plans, archivedPlanIds],
  )
  const archivedPlans = useMemo(() => plans.filter((plan) => archivedPlanIds.includes(plan.id)), [plans, archivedPlanIds])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!menuRef.current) {
        return
      }

      const target = event.target as Node | null
      if (target && !menuRef.current.contains(target)) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  useEffect(() => () => createRequestRef.current?.abort(), [])

  useEffect(() => {
    if (!session) return
    const scope = getIdentityScope(); const generation = getScopeGeneration(); const controller = new AbortController()
    if (!scope) return
    // Clear the prior in-memory response before loading this identity's server trash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccountTrash([]); setAccountTrashTotal(0); setTrashPage(1); setTrashLoading(true); setTrashError('')
    void planApi.trash(controller.signal).then((result) => {
      if (isCurrentScope(scope, generation)) { setAccountTrash(result.plans); setAccountTrashTotal(result.total) }
    }).catch((reason) => {
      if (!controller.signal.aborted && isCurrentScope(scope, generation)) setTrashError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { if (isCurrentScope(scope, generation)) setTrashLoading(false) })
    return () => controller.abort()
  }, [session])

  useEffect(() => {
    if (quickEditTarget) {
      // Initialize the editor when its selected persisted plan changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuickEditDraft({
        title: quickEditTarget.title,
        description: quickEditTarget.description,
        startDate: quickEditTarget.startDate,
        endDate: quickEditTarget.endDate,
        planningMode: quickEditTarget.planningMode,
        templateKey: quickEditTarget.templateKey ?? 'blank',
        savingsEnabled: quickEditTarget.snapshot.project.savingsPlan.enabled === true,
        savingsMode: quickEditTarget.snapshot.project.savingsPlan.mode ?? 'monthly-target',
        defaultMonthlyTarget: quickEditTarget.snapshot.project.savingsPlan.defaultMonthlyTarget ?? 0,
        categoryDefinitions: getPlanCategoryDefinitions(quickEditTarget),
      })
    } else {
      setQuickEditDraft(null)
    }
  }, [quickEditTarget])

  const previewByPlan = useMemo(() => {
    const next = new Map<string, PlanPreviewYear[]>()
    for (const plan of activePlans) {
      next.set(plan.id, buildPlanPreview(plan, locale))
    }
    return next
  }, [activePlans, locale])

  function openSelectedPlan(plan: ForgePlan) {
    openPlan(plan.id)
    navigate(`/plans/${plan.id}/roadmap`)
  }

  function openPlanYear(plan: ForgePlan, year: number) {
    openPlan(plan.id)
    setSelectedYear(year)
    navigate(`/plans/${plan.id}/roadmap?year=${year}`)
  }

  function openPlanMonth(plan: ForgePlan, monthId: string) {
    openPlan(plan.id)
    navigate(`/plans/${plan.id}/monthly/${monthId}`, { state: { highlightMonthId: monthId } })
  }

  function handleExportPlan(plan: ForgePlan) {
    const safeName = plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'plan'
    const canonical = parsePlanDocument(plan.snapshot)
    if (canonical.success) downloadJson(`${safeName}.json`, canonical.plan)
  }

  function failedSyncMetadata(reason: unknown, clientMutationId: string) {
    const offline = reason instanceof TypeError
    return {
      state: offline ? 'offline' as const : 'failed' as const,
      clientMutationId,
      error: {
        code: reason instanceof PlanRequestError ? reason.code : offline ? 'NETWORK_UNAVAILABLE' : 'PLAN_CREATE_FAILED',
        message: reason instanceof Error ? reason.message : (locale === 'es' ? 'No fue posible guardar el plan.' : 'The plan could not be saved.'),
      },
    }
  }

  async function handleCreatePlan() {
    if (!createDraft.title.trim()) {
      return
    }

    const normalizedDraft = { ...createDraft, title: createDraft.title.trim() }
    if (!session) {
      const planId = createPlan(normalizedDraft)
      setShowCreate(false); setCreateDraft(defaultDraft(locale)); navigate(`/plans/${planId}/roadmap`)
      return
    }

    const clientMutationId = crypto.randomUUID()
    const preparedPlan = createForgePlanDraft(normalizedDraft, locale, theme)
    const draftPlan = { ...preparedPlan, id: `outbox:${clientMutationId}` }
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    if (!scope) return
    const controller = new AbortController(); createRequestRef.current?.abort(); createRequestRef.current = controller
    setCreateSaving(true); setCreateError('')
    try {
      const result = await planApi.create(draftPlan, clientMutationId, controller.signal)
      if (!isCurrentScope(scope, generation)) return
      acceptServerPlan(result.plan)
      setShowCreate(false); setCreateDraft(defaultDraft(locale))
      navigate(`/plans/${result.plan.id}/roadmap`)
    } catch (reason) {
      if (controller.signal.aborted || !isCurrentScope(scope, generation)) return
      const metadata = failedSyncMetadata(reason, clientMutationId)
      retainFailedCreate(draftPlan, metadata)
      setCreateError(metadata.error.message)
    } finally {
      if (isCurrentScope(scope, generation)) setCreateSaving(false)
      if (createRequestRef.current === controller) createRequestRef.current = null
    }
  }

  async function retryCreate(plan: ForgePlan) {
    const metadata = syncByPlanId[plan.id]
    if (!metadata?.clientMutationId) return
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    if (!scope) return
    const controller = new AbortController(); createRequestRef.current?.abort(); createRequestRef.current = controller
    setPlanSync(plan.id, { state: 'saving', clientMutationId: metadata.clientMutationId })
    try {
      const result = await planApi.create(plan, metadata.clientMutationId, controller.signal)
      if (!isCurrentScope(scope, generation)) return
      acceptServerPlan(result.plan, plan.id)
      navigate(`/plans/${result.plan.id}/roadmap`)
    } catch (reason) {
      if (!controller.signal.aborted && isCurrentScope(scope, generation)) setPlanSync(plan.id, failedSyncMetadata(reason, metadata.clientMutationId))
    } finally { if (createRequestRef.current === controller) createRequestRef.current = null }
  }

  function handleSaveQuickEdit() {
    if (!quickEditTarget || !quickEditDraft) {
      return
    }

    quickEditPlan(quickEditTarget.id, {
      title: quickEditDraft.title.trim(),
      description: quickEditDraft.description,
      startDate: quickEditDraft.startDate,
      endDate: quickEditDraft.endDate,
      planningMode: quickEditDraft.planningMode,
      templateKey: quickEditDraft.templateKey,
      savingsEnabled: quickEditDraft.savingsEnabled,
      savingsMode: quickEditDraft.savingsMode,
      defaultMonthlyTarget: quickEditDraft.defaultMonthlyTarget,
      categoryDefinitions: quickEditDraft.categoryDefinitions,
    })
    setQuickEditTarget(null)
  }

  function closeMenu() {
    setOpenMenuId(null)
  }

  function editPlan(event: React.MouseEvent, plan: ForgePlan) {
    event.stopPropagation()
    setQuickEditTarget(plan)
  }

  async function handleDeletePlan(plan: ForgePlan) {
    if (session && plan.remoteId) {
      if (syncByPlanId[plan.id]?.state === 'deleting') return
      const scope = getIdentityScope(); const generation = getScopeGeneration()
      if (!scope) return
      setPlanSync(plan.id, { state: 'deleting' })
      try {
        const result = await planApi.remove(plan.remoteId, plan.remoteRevision ?? 1)
        if (!isCurrentScope(scope, generation)) return
        removeConfirmedRemotePlan(plan.remoteId)
        const alreadyInTrash = accountTrash.some((item) => item.remoteId === result.plan.remoteId)
        setAccountTrash((current) => [result.plan, ...current.filter((item) => item.remoteId !== result.plan.remoteId)])
        if (!alreadyInTrash) setAccountTrashTotal((total) => total + 1)
        if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
        setUndoDelete({ kind: 'remote', remoteId: plan.remoteId, revision: result.plan.remoteRevision ?? plan.remoteRevision ?? 1, title: plan.title })
        undoTimerRef.current = window.setTimeout(() => setUndoDelete(null), 5000)
      } catch (reason) {
        if (isCurrentScope(scope, generation)) {
          setPlanSync(plan.id, { state: 'synced' })
          setTrashError(reason instanceof Error ? reason.message : String(reason))
        }
      }
      return
    }
    deletePlan(plan.id)
    const deleted = useForgePlannerStore.getState().deletedPlans.find((item) => item.plan.id === plan.id)
    if (!deleted) return
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoDelete({ kind: 'local', deletedId: deleted.id, title: plan.title })
    undoTimerRef.current = window.setTimeout(() => setUndoDelete(null), 5000)
  }

  async function handleArchivePlan(plan: ForgePlan) {
    archivePlan(plan.id)
    if (plan.remoteId) await sharingApi.setSharingEnabled(plan.remoteId, false).then(() => setRemoteSharingEnabled(plan.id, false)).catch(() => undefined)
  }

  async function handleUnarchivePlan(plan: ForgePlan) {
    unarchivePlan(plan.id)
  }

  async function togglePlanSharing(plan: ForgePlan) {
    if (!plan.remoteId) return
    const enabled = plan.remoteSharingEnabled === false
    await sharingApi.setSharingEnabled(plan.remoteId, enabled)
    setRemoteSharingEnabled(plan.id, enabled)
  }

  async function permanentlyRemoveLocal(item: typeof deletedPlans[number]) {
    if (!window.confirm(locale === 'es' ? `“${item.plan.title}” se eliminará definitivamente. Esta acción no se puede deshacer.` : `“${item.plan.title}” will be permanently deleted. This cannot be undone.`)) return
    permanentlyDeletePlan(item.id)
  }

  async function permanentlyRemoveRemote(item: ServerTrashPlan) {
    if (!item.remoteId || !window.confirm(locale === 'es' ? `“${item.title}” se eliminará definitivamente. Esta acción no se puede deshacer.` : `“${item.title}” will be permanently deleted. This cannot be undone.`)) return
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    if (!scope) return
    try {
      await planApi.purge(item.remoteId, item.remoteRevision ?? 1)
      if (!isCurrentScope(scope, generation)) return
      setAccountTrash((current) => current.filter((plan) => plan.remoteId !== item.remoteId))
      setAccountTrashTotal((total) => Math.max(0, total - 1))
    } catch (reason) { if (isCurrentScope(scope, generation)) setTrashError(reason instanceof Error ? reason.message : String(reason)) }
  }

  async function permanentlyRemoveAll() {
    setConfirmClearDeleted(false)
    if (session) {
      const scope = getIdentityScope(); const generation = getScopeGeneration()
      if (!scope) return
      const first = await planApi.trash(undefined, 1, 100); const all = [...first.plans]
      for (let page = 2; all.length < first.total; page += 1) all.push(...(await planApi.trash(undefined, page, 100)).plans)
      if (!isCurrentScope(scope, generation)) return
      const results = await Promise.allSettled(all.filter((item) => item.remoteId).map((item) => planApi.purge(item.remoteId!, item.remoteRevision ?? 1)))
      if (!isCurrentScope(scope, generation)) return
      if (results.some((result) => result.status === 'rejected')) setTrashError(locale === 'es' ? 'Algunos planes no pudieron eliminarse.' : 'Some plans could not be deleted.')
      const result = await planApi.trash(); setAccountTrash(result.plans); setAccountTrashTotal(result.total)
    } else clearDeletedPlans()
  }

  async function undoLastDelete() {
    if (!undoDelete) return
    if (undoDelete.kind === 'remote') {
      const scope = getIdentityScope(); const generation = getScopeGeneration()
      if (!scope) return
      try {
        const result = await planApi.restore(undoDelete.remoteId, undoDelete.revision)
        if (!isCurrentScope(scope, generation)) return
        acceptServerPlan(result.plan); setAccountTrash((current) => current.filter((item) => item.remoteId !== undoDelete.remoteId)); setAccountTrashTotal((total) => Math.max(0, total - 1))
      } catch (reason) { if (isCurrentScope(scope, generation)) setTrashError(reason instanceof Error ? reason.message : String(reason)); return }
    } else restoreDeletedPlan(undoDelete.deletedId)
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoDelete(null)
  }

  async function restoreLocalPlan(item: typeof deletedPlans[number]) {
    restoreDeletedPlan(item.id)
  }

  async function restoreRemotePlan(item: ServerTrashPlan) {
    if (!item.remoteId) return
    const scope = getIdentityScope(); const generation = getScopeGeneration()
    if (!scope) return
    try {
      const result = await planApi.restore(item.remoteId, item.remoteRevision ?? 1)
      if (!isCurrentScope(scope, generation)) return
      acceptServerPlan(result.plan); setAccountTrash((current) => current.filter((plan) => plan.remoteId !== item.remoteId)); setAccountTrashTotal((total) => Math.max(0, total - 1))
    } catch (reason) { if (isCurrentScope(scope, generation)) setTrashError(reason instanceof Error ? reason.message : String(reason)) }
  }

  function dismissUndo() {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoDelete(null)
  }

  return (
    <div className="app-bg plans-page">
      <div className="shell plans-home-shell">
        <header className="app-header plans-home-header card">
          <div className="plans-home-topbar global-app-bar">
            <div className="plans-brand">
              <div className="plans-brand-mark">FP</div>
              <div>
                <p className="eyebrow">{t.appName}</p>
                <h1>{t.yourPlans}</h1>
              </div>
            </div>
            <HeaderActions
              locale={locale}
              theme={theme}
              onToggleLocale={() => { const next = locale === 'es' ? 'en' : 'es'; setLocale(next); void setAppearance({ locale: next }) }}
              onToggleTheme={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); void setAppearance({ theme: next }) }}
              switchToEnglishLabel={t.languageSwitchToEnglish}
              switchToSpanishLabel={t.languageSwitchToSpanish}
              switchToDarkLabel={t.switchToDarkMode}
              switchToLightLabel={t.switchToLightMode}
            />
          </div>
        </header>

        <LocalPlanMigration />
        <PlanInvitations locale={locale} onAccepted={() => { void planApi.list().then(mergeRemotePlans) }} />

        <nav className="plans-filter-tabs" aria-label={locale === 'es' ? 'Filtrar planes' : 'Filter plans'}>
          {([
            ['active', t.yourPlans, activePlans.length],
            ['archived', t.archived, archivedPlans.length],
            ['deleted', t.recentlyDeleted, session ? accountTrashTotal : deletedPlans.length],
          ] as const).map(([filter, label, count]) => (
            <button key={filter} type="button" className={plansFilter === filter ? 'plans-filter-tab is-active' : 'plans-filter-tab'} onClick={() => setPlansFilter(filter)}>
              {label}<span>{count}</span>
            </button>
          ))}
        </nav>

        <main ref={plansScrollerRef} className="plans-main-grid" onScroll={(event) => setShowBackToTop(event.currentTarget.scrollTop > 180)}>
          <section className="plans-grid" aria-label={t.yourPlans} hidden={plansFilter !== 'active'}>
            {activePlans.length ? (
              activePlans.map((plan) => {
                const previewYears = previewByPlan.get(plan.id) ?? []
                const sync = syncByPlanId[plan.id]
                const createPending = !plan.remoteId && sync?.clientMutationId

                return (
                  <article
                    key={plan.id}
                    className="plan-card card"
                    role={createPending ? undefined : 'link'}
                    tabIndex={createPending ? -1 : 0}
                    aria-label={`${plan.title}. ${t.openPlanTooltip}`}
                    onClick={() => { if (!createPending) openSelectedPlan(plan) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        if (!createPending) openSelectedPlan(plan)
                      }
                    }}
                  >
                    <header className="plan-card__header">
                      <div className="plan-card__title-block">
                        <p className="plan-card__kicker">{plan.planningMode === 'monthly' ? t.monthlyView : t.annualView}</p>
                        <h2 onDoubleClick={(event) => editPlan(event, plan)} title={locale === 'es' ? 'Doble clic para editar' : 'Double-click to edit'}>{plan.title}</h2>
                        {sync && sync.state !== 'synced' ? <span className={`plan-access-badge plan-sync-${sync.state}`}>{sync.state === 'saving' ? (locale === 'es' ? 'Guardando…' : 'Saving…') : sync.state === 'deleting' ? (locale === 'es' ? 'Eliminando…' : 'Deleting…') : sync.state === 'offline' ? (locale === 'es' ? 'Sin conexión' : 'Offline') : sync.state === 'failed' ? (locale === 'es' ? 'Error al guardar' : 'Save failed') : sync.state}</span> : null}
                        {plan.remoteAccess && plan.remoteAccess !== 'owner' ? <span className="plan-access-badge">{plan.remoteAccess === 'editor' ? (locale === 'es' ? 'Compartido · editor' : 'Shared · editor') : (locale === 'es' ? 'Compartido · lectura' : 'Shared · view')}</span> : null}
                      </div>
                      <div className="plan-card__actions" ref={openMenuId === plan.id ? menuRef : undefined}>
                        <IconButton label={t.menu} onClick={(event) => {
                          event.stopPropagation()
                          setOpenMenuId((current) => (current === plan.id ? null : plan.id))
                        }}>
                          <MoreVerticalIcon width={18} height={18} />
                        </IconButton>
                        {openMenuId === plan.id ? (
                          <div className="plan-card__menu" onClick={(event) => event.stopPropagation()}>
                            {plan.remoteAccess !== 'viewer' ? <button type="button" onClick={() => { setQuickEditTarget(plan); closeMenu() }}><PencilIcon width={16} height={16} /> {t.edit}</button> : null}
                            {plan.remoteAccess === 'owner' && plan.remoteId ? <button type="button" onClick={() => { setSharingPlan(plan); closeMenu() }}><ShareIcon width={16} height={16} /> {t.share}</button> : null}
                            {plan.remoteAccess === 'owner' && plan.remoteId ? <button type="button" onClick={() => { void togglePlanSharing(plan); closeMenu() }}><LockIcon width={16} height={16} /> {plan.remoteSharingEnabled === false ? t.unlockAccess : t.makePrivate}</button> : null}
                            <button type="button" onClick={() => { duplicatePlan(plan.id); closeMenu() }}><CopyIcon width={16} height={16} /> {t.duplicate}</button>
                            {plan.remoteAccess === 'owner' || !plan.remoteAccess ? <button type="button" onClick={() => { void handleArchivePlan(plan); closeMenu() }}><ArchiveIcon width={16} height={16} /> {t.archive}</button> : null}
                            <button type="button" onClick={() => { handleExportPlan(plan); closeMenu() }}><DownloadIcon width={16} height={16} /> {t.export}</button>
                            {plan.remoteAccess === 'owner' || !plan.remoteAccess ? <button type="button" className="danger" disabled={sync?.state === 'deleting'} onClick={() => { void handleDeletePlan(plan); closeMenu() }}><TrashIcon width={16} height={16} /> {t.delete}</button> : null}
                          </div>
                        ) : null}
                      </div>
                    </header>

                    <p className="plan-card__description" onDoubleClick={(event) => editPlan(event, plan)} title={locale === 'es' ? 'Doble clic para editar' : 'Double-click to edit'}>{plan.description || t.noPlans}</p>
                    {createPending ? <div className="plan-sync-actions" onClick={(event) => event.stopPropagation()}><span>{sync?.error?.message}</span><button className="btn btn-primary" type="button" disabled={sync?.state === 'saving'} onClick={() => void retryCreate(plan)}>{locale === 'es' ? 'Reintentar' : 'Retry'}</button></div> : null}
                    <div className="plan-card__preview-head"><span>{locale === 'es' ? 'Calendario' : 'Calendar'}</span><small>{locale === 'es' ? 'Actualizado' : 'Updated'}: {new Date(plan.updatedAt).toLocaleDateString()}</small></div>
                    <div className="plan-card__preview" onClick={(event) => event.stopPropagation()}>
                      <PlanPreviewCarousel plan={plan} years={previewYears} locale={locale} onOpenYear={openPlanYear} onOpenMonth={openPlanMonth} />
                    </div>
                    <footer className="plan-card__footer"><span>{locale === 'es' ? 'Finaliza' : 'Ends'}</span><strong>{plan.endDate}</strong></footer>
                  </article>
                )
              })
            ) : (
              <Card className="empty-state">
                <h2>{t.noPlans}</h2>
                <p>{t.createPlanSubtitle}</p>
              </Card>
            )}

            <button
              type="button"
              className="plan-card plan-card-create card create-plan-card"
              onClick={() => {
                setCreateDraft(defaultDraft(locale))
                setShowCreate(true)
              }}
            >
              <span className="create-plan-card__icon"><PlusIcon width={48} height={48} /></span>
              <span className="create-plan-tooltip" role="tooltip">{t.createPlan}</span>
            </button>
          </section>

          {plansFilter !== 'active' ? (
            <section className="filtered-plans-grid" aria-live="polite">
              {plansFilter === 'archived' && (archivedPlans.length ? archivedPlans.map((plan) => (
                <Card key={plan.id} className="compact-plan-card filtered-plan-card">
                  <div><strong>{plan.title}</strong><small>{plan.endDate}</small></div>
                  <div className="compact-plan-card__actions">
                    {plan.remoteId && (plan.remoteAccess === 'owner' || !plan.remoteAccess) ? <><IconButton label={t.manageAccess} onClick={() => setSharingPlan(plan)}><UsersIcon width={16} height={16} /></IconButton><IconButton label={plan.remoteSharingEnabled === false ? t.unlockAccess : t.makePrivate} onClick={() => void togglePlanSharing(plan)}><LockIcon width={16} height={16} /></IconButton></> : null}
                    <IconButton label={t.unarchive} onClick={() => void handleUnarchivePlan(plan)}><ArchiveIcon width={16} height={16} /></IconButton>
                    <IconButton label={t.delete} onClick={() => void handleDeletePlan(plan)}><TrashIcon width={16} height={16} /></IconButton>
                  </div>
                </Card>
              )) : <div className="empty-state">{t.noArchived}</div>)}
              {plansFilter === 'deleted' && session && (trashLoading
                ? <div className="empty-state" aria-live="polite">{locale === 'es' ? 'Cargando papelera…' : 'Loading trash…'}</div>
                : trashError
                  ? <div className="empty-state"><p className="auth-error">{trashError}</p><button type="button" className="btn" onClick={() => { const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return; setTrashLoading(true); void planApi.trash().then((result) => { if (isCurrentScope(scope, generation)) { setAccountTrash(result.plans); setAccountTrashTotal(result.total); setTrashPage(1); setTrashError('') } }).catch((reason) => { if (isCurrentScope(scope, generation)) setTrashError(reason instanceof Error ? reason.message : String(reason)) }).finally(() => { if (isCurrentScope(scope, generation)) setTrashLoading(false) }) }}>{locale === 'es' ? 'Reintentar' : 'Retry'}</button></div>
                  : accountTrash.length ? <><div className="filtered-plans-toolbar"><span>{accountTrashTotal} {locale === 'es' ? 'planes en la papelera de la cuenta' : 'plans in account trash'}</span><button type="button" className="btn btn-danger" onClick={() => setConfirmClearDeleted(true)}>{locale === 'es' ? 'Borrar todo' : 'Delete all'}</button></div>{accountTrash.map((item) => (
                    <Card key={item.remoteId ?? item.id} className="compact-plan-card filtered-plan-card filtered-plan-card--deleted">
                      <div><strong>{item.title}</strong><small>{locale === 'es' ? 'Eliminado' : 'Deleted'}: {item.deletedAt.slice(0, 10)} · {locale === 'es' ? 'Se purga' : 'Purges'}: {item.purgeAfter.slice(0, 10)}</small></div>
                      <div className="compact-plan-card__actions"><IconButton label={t.restore} disabled={!item.restoreEligible} onClick={() => void restoreRemotePlan(item)}><DownloadIcon width={16} height={16} /></IconButton><IconButton label={locale === 'es' ? 'Borrar definitivamente' : 'Delete permanently'} onClick={() => void permanentlyRemoveRemote(item)}><TrashIcon width={16} height={16} /></IconButton></div>
                    </Card>
                  ))}{accountTrash.length < accountTrashTotal ? <button type="button" className="btn" onClick={() => { const scope = getIdentityScope(); const generation = getScopeGeneration(); const nextPage = trashPage + 1; if (!scope) return; void planApi.trash(undefined, nextPage, 50).then((result) => { if (isCurrentScope(scope, generation)) { setTrashPage(nextPage); setAccountTrash((current) => [...current, ...result.plans.filter((item) => !current.some((existing) => existing.remoteId === item.remoteId))]) } }) }}>{locale === 'es' ? 'Cargar más' : 'Load more'}</button> : null}</> : <div className="empty-state">{t.noDeleted}</div>)}
              {plansFilter === 'deleted' && !session && (deletedPlans.length ? <><div className="filtered-plans-toolbar"><span>{deletedPlans.length} {locale === 'es' ? 'planes en la papelera local' : 'plans in local trash'}</span><button type="button" className="btn btn-danger" onClick={() => setConfirmClearDeleted(true)}>{locale === 'es' ? 'Borrar todo' : 'Delete all'}</button></div>{deletedPlans.map((item) => (
                <Card key={item.id} className="compact-plan-card filtered-plan-card filtered-plan-card--deleted">
                  <div><strong>{item.plan.title}</strong><small>{locale === 'es' ? 'Se elimina automáticamente' : 'Automatically removed'}: {item.expiresAt.slice(0, 10)}</small></div>
                  <div className="compact-plan-card__actions"><IconButton label={t.restore} onClick={() => void restoreLocalPlan(item)}><DownloadIcon width={16} height={16} /></IconButton><IconButton label={locale === 'es' ? 'Borrar definitivamente' : 'Delete permanently'} onClick={() => void permanentlyRemoveLocal(item)}><TrashIcon width={16} height={16} /></IconButton></div>
                </Card>
              ))}</> : <div className="empty-state">{t.noDeleted}</div>)}
            </section>
          ) : null}
        </main>
        {showBackToTop ? <button type="button" className="plans-back-to-top" aria-label={locale === 'es' ? 'Volver arriba' : 'Back to top'} onClick={() => plansScrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}><ChevronUpIcon width={20} height={20} /></button> : null}
        <footer className="domoforge-footer">{locale === 'es' ? 'Diseñado y desarrollado por' : 'Designed and developed by'} <a href="https://domoforge.com" target="_blank" rel="noreferrer">Domoforge</a></footer>
      </div>

      {undoDelete ? (
        <div className="undo-toast" role="status" onTouchStart={(event) => { touchStartXRef.current = event.touches[0]?.clientX ?? null }} onTouchEnd={(event) => { const endX = event.changedTouches[0]?.clientX; if (touchStartXRef.current !== null && endX !== undefined && Math.abs(endX - touchStartXRef.current) > 60) dismissUndo(); touchStartXRef.current = null }}>
          <span><strong>{undoDelete.title}</strong> {locale === 'es' ? 'se eliminó' : 'was deleted'}</span>
          <button type="button" className="undo-toast__action" onClick={() => void undoLastDelete()}>{locale === 'es' ? 'Deshacer' : 'Undo'}</button>
          <button type="button" className="undo-toast__close" aria-label={locale === 'es' ? 'Cerrar' : 'Close'} onClick={dismissUndo}>×</button>
          <span className="undo-toast__timer" aria-hidden="true" />
        </div>
      ) : null}

      {quickEditTarget && quickEditDraft ? (
        <div className="modal-overlay">
          <div className="modal-shell modal-shell--plans">
            <header className="modal-header">
              <h2>{t.modalEditTitle}</h2>
              <button className="btn btn-ghost" type="button" onClick={() => setQuickEditTarget(null)}>{t.cancel}</button>
            </header>
            <div className="modal-body">
              <div className="stack-sm">
                <label className="field-wrap">
                  <span>{t.title}</span>
                  <input className="field-input" value={quickEditDraft.title} onChange={(event) => setQuickEditDraft((current) => current ? { ...current, title: event.target.value } : current)} />
                </label>
                <label className="field-wrap">
                  <span>{t.description}</span>
                  <textarea className="field-input" value={quickEditDraft.description} onChange={(event) => setQuickEditDraft((current) => current ? { ...current, description: event.target.value } : current)} />
                </label>
                <div className="form-grid form-grid-compact">
                  <label className="field-wrap">
                    <span>{t.startDate}</span>
                    <input className="field-input" type="date" value={quickEditDraft.startDate} onChange={(event) => setQuickEditDraft((current) => current ? { ...current, startDate: event.target.value } : current)} />
                  </label>
                  <label className="field-wrap">
                    <span>{t.endDate}</span>
                    <input className="field-input" type="date" value={quickEditDraft.endDate} onChange={(event) => setQuickEditDraft((current) => current ? { ...current, endDate: event.target.value } : current)} />
                  </label>
                </div>
                <div className="form-grid form-grid-compact">
                  <label className="field-wrap">
                    <span>{t.defaultView}</span>
                    <select className="field-input" value={quickEditDraft.planningMode} onChange={(event) => setQuickEditDraft((current) => current ? { ...current, planningMode: event.target.value as PlanningMode } : current)}>
                      <option value="annual">{t.annualView}</option>
                      <option value="monthly">{t.monthlyView}</option>
                      <option value="auto">{t.automaticView}</option>
                    </select>
                  </label>
                  <label className="field-wrap">
                    <span>{t.template}</span>
                    <select className="field-input" value={quickEditDraft.templateKey} onChange={(event) => setQuickEditDraft((current) => current ? { ...current, templateKey: event.target.value as PlanTemplateKey } : current)}>
                      {templateOptions(locale).map((template) => (
                        <option key={template.key} value={template.key}>{template.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <PlanSavingsConfig
                  locale={locale}
                  value={quickEditDraft}
                  onChange={(settings) => setQuickEditDraft((current) => current ? { ...current, ...settings } : current)}
                />
                <PlanCategoryEditor
                  locale={locale}
                  value={quickEditDraft.categoryDefinitions}
                  sources={plans.filter((plan) => plan.id !== quickEditTarget.id).map((plan) => ({ id: plan.id, title: plan.title, categories: getPlanCategoryDefinitions(plan) }))}
                  onChange={(categoryDefinitions) => setQuickEditDraft((current) => current ? { ...current, categoryDefinitions } : current)}
                />
                {quickEditTarget.remoteId && quickEditTarget.remoteAccess === 'owner' ? <section className="plan-settings-access"><div><UsersIcon width={20} /><span><strong>{locale === 'es' ? 'Acceso y personas' : 'Access and people'}</strong><small>{locale === 'es' ? 'Agrega o elimina personas y define si pueden ver o editar.' : 'Add or remove people and choose whether they can view or edit.'}</small></span></div><button type="button" className="btn" onClick={() => { setQuickEditTarget(null); setSharingPlan(quickEditTarget) }}><ShareIcon width={16} /> {t.manageAccess}</button></section> : null}
              </div>
            </div>
            <footer className="modal-footer">
              <Button variant="ghost" type="button" onClick={() => setQuickEditTarget(null)}>{t.cancel}</Button>
              <Button variant="primary" type="button" onClick={handleSaveQuickEdit}>{t.save}</Button>
            </footer>
          </div>
        </div>
      ) : null}

      {sharingPlan ? <PlanSharingDialog plan={sharingPlan} locale={locale} onClose={() => setSharingPlan(null)} /> : null}

      {confirmClearDeleted ? <div className="modal-overlay" role="presentation"><section className="modal-shell compact-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-deleted-title"><header className="modal-header"><h2 id="clear-deleted-title">{locale === 'es' ? 'Borrar todos los planes' : 'Delete all plans'}</h2><button className="btn btn-ghost" onClick={() => setConfirmClearDeleted(false)} aria-label={locale === 'es' ? 'Cerrar' : 'Close'}>×</button></header><div className="modal-body"><p>{locale === 'es' ? 'Todos los planes eliminados se borrarán definitivamente y no podrán recuperarse.' : 'All deleted plans will be permanently erased and cannot be recovered.'}</p></div><footer className="modal-footer"><button className="btn" onClick={() => setConfirmClearDeleted(false)}>{t.cancel}</button><button className="btn btn-danger" onClick={() => void permanentlyRemoveAll()}>{locale === 'es' ? 'Borrar definitivamente' : 'Delete permanently'}</button></footer></section></div> : null}

      {showCreate ? (
        <div className="modal-overlay">
          <div className="modal-shell modal-shell--plans">
            <header className="modal-header">
              <h2>{t.modalCreateTitle}</h2>
              <button className="btn btn-ghost" type="button" onClick={() => setShowCreate(false)}>{t.cancel}</button>
            </header>
            <div className="modal-body">
              <div className="stack-sm">
                <label className="field-wrap">
                  <span>{t.title}</span>
                  <input className="field-input" value={createDraft.title} onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="field-wrap">
                  <span>{t.description}</span>
                  <textarea className="field-input" value={createDraft.description} onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <div className="form-grid form-grid-compact">
                  <label className="field-wrap">
                    <span>{t.startDate}</span>
                    <input className="field-input" type="date" value={createDraft.startDate} onChange={(event) => setCreateDraft((current) => ({ ...current, startDate: event.target.value }))} />
                  </label>
                  <label className="field-wrap">
                    <span>{t.endDate}</span>
                    <input className="field-input" type="date" value={createDraft.endDate} onChange={(event) => setCreateDraft((current) => ({ ...current, endDate: event.target.value }))} />
                  </label>
                </div>
                <div className="form-grid form-grid-compact">
                  <label className="field-wrap">
                    <span>{t.defaultView}</span>
                    <select className="field-input" value={createDraft.planningMode} onChange={(event) => setCreateDraft((current) => ({ ...current, planningMode: event.target.value as PlanningMode }))}>
                      <option value="annual">{t.annualView}</option>
                      <option value="monthly">{t.monthlyView}</option>
                      <option value="auto">{t.automaticView}</option>
                    </select>
                  </label>
                  <label className="field-wrap">
                    <span>{t.template}</span>
                    <select className="field-input" value={createDraft.templateKey} onChange={(event) => setCreateDraft((current) => ({ ...current, templateKey: event.target.value as PlanTemplateKey }))}>
                      {templateOptions(locale).map((template) => (
                        <option key={template.key} value={template.key}>{template.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <PlanSavingsConfig locale={locale} value={createDraft} onChange={(settings) => setCreateDraft((current) => ({ ...current, ...settings }))} />
                <PlanCategoryEditor locale={locale} value={createDraft.categoryDefinitions} sources={plans.map((plan) => ({ id: plan.id, title: plan.title, categories: getPlanCategoryDefinitions(plan) }))} onChange={(categoryDefinitions) => setCreateDraft((current) => ({ ...current, categoryDefinitions }))} />
              </div>
            </div>
            <footer className="modal-footer">
              <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>{t.cancel}</Button>
              {createError ? <p className="auth-error" role="alert">{createError}</p> : null}
              <Button variant="primary" type="button" disabled={createSaving} onClick={() => void handleCreatePlan()}>{createSaving ? (locale === 'es' ? 'Guardando…' : 'Saving…') : t.createPlan}</Button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
