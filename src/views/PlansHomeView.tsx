import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { copy } from '../i18n'
import type { Locale } from '../i18n'
import { getProjectYears, buildYearMonths, activitiesForMonth } from '../utils/dateUtils'
import { getAverageProgress } from '../utils/progressUtils'
import type { ForgePlan, PlanTemplateKey, PlanningMode } from '../types/forgePlanner'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import { LocaleThemeControls } from '../ui/LocaleThemeControls'
import { PlanSavingsConfig } from '../ui/PlanSavingsConfig'
import { PlanCategoryEditor } from '../ui/PlanCategoryEditor'
import type { CategoryMeta } from '../types/roadmap'
import { getCategoryMeta } from '../data/northstarMockData'
import {
  ArchiveIcon,
  CopyIcon,
  DownloadIcon,
  EyeOffIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
} from '../ui/icons'

type PlansFilter = 'active' | 'hidden' | 'archived' | 'deleted'

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

function buildPlanPreview(plan: ForgePlan): PlanPreviewYear[] {
  const years = getProjectYears(plan.startDate, plan.endDate)
  return years.map((year) => {
    const yearMonths = buildYearMonths(year, plan.startDate, plan.endDate, plan.snapshot.locale)
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

function PlanPreviewCarousel({ plan, years, onOpenYear, onOpenMonth }: {
  plan: ForgePlan
  years: PlanPreviewYear[]
  onOpenYear: (plan: ForgePlan, year: number) => void
  onOpenMonth: (plan: ForgePlan, monthId: string) => void
}) {
  const todayId = new Date().toISOString().slice(0, 7)
  const previewLocale = plan.snapshot.locale === 'es' ? 'es-MX' : 'en-US'
  const monthLabel = (monthId: string) => new Intl.DateTimeFormat(previewLocale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${monthId}-01T00:00:00Z`)).replace('.', '')
  const activeMonths = years.flatMap((year) => year.months.filter((month) => month.active).map((month) => ({ ...month, year: year.year })))
  const initialYearIndex = Math.max(0, years.findIndex((year) => year.year >= Number(todayId.slice(0, 4))))
  const initialMonthIndex = Math.max(0, activeMonths.findIndex((month) => month.id >= todayId))
  const [index, setIndex] = useState(plan.planningMode === 'monthly' ? initialMonthIndex : initialYearIndex)
  const itemCount = plan.planningMode === 'monthly' ? activeMonths.length : years.length
  const safeIndex = Math.min(index, Math.max(0, itemCount - 1))
  const year = years[safeIndex]
  const month = activeMonths[safeIndex]

  if (!itemCount) return <div className="plan-preview-empty">Sin periodos activos</div>

  return (
    <div className="plan-preview-carousel">
      <button type="button" className="plan-preview-arrow" aria-label="Anterior" disabled={safeIndex === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>‹</button>
      <div className="plan-preview-single">
        {plan.planningMode === 'monthly' && month ? (
          <button type="button" className="plan-preview-month-detail" onClick={() => onOpenMonth(plan, month.id)}>
            <strong>{month.label} {month.year}</strong>
            <span>{month.count} actividades · {month.progress}%</span>
            <small>{plan.snapshot.activities.filter((activity) => activity.monthlyEntries[month.id]).slice(0, 3).map((activity) => activity.title).join(' · ') || 'Sin actividades todavía'}</small>
          </button>
        ) : year ? (
          <div className="plan-preview-year-single">
            <button type="button" className="plan-preview-single__year" onClick={() => onOpenYear(plan, year.year)}>{year.year}</button>
            <div className="plan-preview-month-grid">
              {year.months.map((entry) => (
                <button key={entry.id} type="button" className={`plan-preview-month plan-preview-month--${entry.count ? 2 : 0} ${entry.active && entry.count ? '' : 'is-locked'}`} aria-label={`${monthLabel(entry.id)}: ${entry.count} elementos`} title={`${entry.count} elementos`} onClick={() => onOpenMonth(plan, entry.id)}>
                  <span>{monthLabel(entry.id)}</span><small className="plan-preview-count">{entry.count}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <span className="plan-preview-position">{safeIndex + 1} / {itemCount}</span>
      </div>
      <button type="button" className="plan-preview-arrow" aria-label="Siguiente" disabled={safeIndex >= itemCount - 1} onClick={() => setIndex((current) => Math.min(itemCount - 1, current + 1))}>›</button>
    </div>
  )
}

export function PlansHomeView() {
  const navigate = useNavigate()
  const locale = useRoadmapStore((state) => state.locale)
  const theme = useRoadmapStore((state) => state.theme)
  const setLocale = useRoadmapStore((state) => state.setLocale)
  const setTheme = useRoadmapStore((state) => state.setTheme)
  const setSelectedYear = useRoadmapStore((state) => state.setSelectedYear)
  const plans = useForgePlannerStore((state) => state.plans)
  const archivedPlanIds = useForgePlannerStore((state) => state.archivedPlanIds)
  const hiddenPlanIds = useForgePlannerStore((state) => state.hiddenPlanIds)
  const deletedPlans = useForgePlannerStore((state) => state.deletedPlans)
  const openPlan = useForgePlannerStore((state) => state.openPlan)
  const quickEditPlan = useForgePlannerStore((state) => state.quickEditPlan)
  const duplicatePlan = useForgePlannerStore((state) => state.duplicatePlan)
  const hidePlan = useForgePlannerStore((state) => state.hidePlan)
  const unhidePlan = useForgePlannerStore((state) => state.unhidePlan)
  const archivePlan = useForgePlannerStore((state) => state.archivePlan)
  const unarchivePlan = useForgePlannerStore((state) => state.unarchivePlan)
  const deletePlan = useForgePlannerStore((state) => state.deletePlan)
  const restoreDeletedPlan = useForgePlannerStore((state) => state.restoreDeletedPlan)
  const createPlan = useForgePlannerStore((state) => state.createPlan)

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
  const [undoDelete, setUndoDelete] = useState<{ deletedId: string; title: string } | null>(null)

  const t = copy[locale]
  const activePlans = useMemo(
    () => plans.filter((plan) => !archivedPlanIds.includes(plan.id) && !hiddenPlanIds.includes(plan.id)),
    [plans, archivedPlanIds, hiddenPlanIds],
  )
  const hiddenPlans = useMemo(() => plans.filter((plan) => hiddenPlanIds.includes(plan.id)), [plans, hiddenPlanIds])
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
      next.set(plan.id, buildPlanPreview(plan))
    }
    return next
  }, [activePlans])

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
    downloadJson(`${safeName}.json`, plan.snapshot)
  }

  function handleCreatePlan() {
    if (!createDraft.title.trim()) {
      return
    }

    const planId = createPlan({ ...createDraft, title: createDraft.title.trim() })
    setShowCreate(false)
    setCreateDraft(defaultDraft(locale))
    navigate(`/plans/${planId}/roadmap`)
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

  function handleDeletePlan(plan: ForgePlan) {
    deletePlan(plan.id)
    const deleted = useForgePlannerStore.getState().deletedPlans.find((item) => item.plan.id === plan.id)
    if (!deleted) return
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoDelete({ deletedId: deleted.id, title: plan.title })
    undoTimerRef.current = window.setTimeout(() => setUndoDelete(null), 5000)
  }

  function undoLastDelete() {
    if (!undoDelete) return
    restoreDeletedPlan(undoDelete.deletedId)
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoDelete(null)
  }

  function dismissUndo() {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    setUndoDelete(null)
  }

  return (
    <div className="app-bg plans-page">
      <div className="shell plans-home-shell">
        <header className="app-header plans-home-header card">
          <div className="plans-home-topbar">
            <div className="plans-brand">
              <div className="plans-brand-mark">FP</div>
              <div>
                <p className="eyebrow">{t.appName}</p>
                <h1>{t.yourPlans}</h1>
              </div>
            </div>
            <LocaleThemeControls
              locale={locale}
              theme={theme}
              onToggleLocale={() => setLocale(locale === 'es' ? 'en' : 'es')}
              onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              switchToEnglishLabel={t.languageSwitchToEnglish}
              switchToSpanishLabel={t.languageSwitchToSpanish}
              switchToDarkLabel={t.switchToDarkMode}
              switchToLightLabel={t.switchToLightMode}
            />
          </div>
        </header>

        <nav className="plans-filter-tabs" aria-label="Filtrar planes">
          {([
            ['active', t.yourPlans, activePlans.length],
            ['hidden', t.hidden, hiddenPlans.length],
            ['archived', t.archived, archivedPlans.length],
            ['deleted', t.recentlyDeleted, deletedPlans.length],
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

                return (
                  <article
                    key={plan.id}
                    className="plan-card card"
                    role="link"
                    tabIndex={0}
                    aria-label={`${plan.title}. ${t.openPlanTooltip}`}
                    onClick={() => openSelectedPlan(plan)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openSelectedPlan(plan)
                      }
                    }}
                  >
                    <header className="plan-card__header">
                      <div className="plan-card__title-block">
                        <p className="plan-card__kicker">{plan.planningMode === 'monthly' ? t.monthlyView : t.annualView}</p>
                        <h2 onDoubleClick={(event) => editPlan(event, plan)} title="Doble clic para editar">{plan.title}</h2>
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
                            <button type="button" onClick={() => { setQuickEditTarget(plan); closeMenu() }}><PencilIcon width={16} height={16} /> {t.edit}</button>
                            <button type="button" onClick={() => { duplicatePlan(plan.id); closeMenu() }}><CopyIcon width={16} height={16} /> {t.duplicate}</button>
                            <button type="button" onClick={() => { hidePlan(plan.id); closeMenu() }}><EyeOffIcon width={16} height={16} /> {t.hide}</button>
                            <button type="button" onClick={() => { archivePlan(plan.id); closeMenu() }}><ArchiveIcon width={16} height={16} /> {t.archive}</button>
                            <button type="button" onClick={() => { handleExportPlan(plan); closeMenu() }}><DownloadIcon width={16} height={16} /> {t.export}</button>
                            <button type="button" className="danger" onClick={() => { handleDeletePlan(plan); closeMenu() }}><TrashIcon width={16} height={16} /> {t.delete}</button>
                          </div>
                        ) : null}
                      </div>
                    </header>

                    <p className="plan-card__description" onDoubleClick={(event) => editPlan(event, plan)} title="Doble clic para editar">{plan.description || t.noPlans}</p>
                    <div className="plan-card__preview-head"><span>{locale === 'es' ? 'Calendario' : 'Calendar'}</span><small>{locale === 'es' ? 'Actualizado' : 'Updated'}: {new Date(plan.updatedAt).toLocaleDateString()}</small></div>
                    <div className="plan-card__preview" onClick={(event) => event.stopPropagation()}>
                      <PlanPreviewCarousel plan={plan} years={previewYears} onOpenYear={openPlanYear} onOpenMonth={openPlanMonth} />
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
              {plansFilter === 'hidden' && (hiddenPlans.length ? hiddenPlans.map((plan) => (
                <Card key={plan.id} className="compact-plan-card filtered-plan-card">
                  <div><strong>{plan.title}</strong><p>{plan.description || t.noHidden}</p></div>
                  <IconButton label={t.unhide} onClick={() => unhidePlan(plan.id)}><EyeOffIcon width={16} height={16} /></IconButton>
                </Card>
              )) : <div className="empty-state">{t.noHidden}</div>)}
              {plansFilter === 'archived' && (archivedPlans.length ? archivedPlans.map((plan) => (
                <Card key={plan.id} className="compact-plan-card filtered-plan-card">
                  <div><strong>{plan.title}</strong><p>{plan.description || t.noArchived}</p></div>
                  <IconButton label={t.unarchive} onClick={() => unarchivePlan(plan.id)}><ArchiveIcon width={16} height={16} /></IconButton>
                </Card>
              )) : <div className="empty-state">{t.noArchived}</div>)}
              {plansFilter === 'deleted' && (deletedPlans.length ? deletedPlans.map((item) => (
                <Card key={item.id} className="compact-plan-card filtered-plan-card">
                  <div><strong>{item.plan.title}</strong><p>{item.plan.description || t.noDeleted}</p><small>{item.deletedAt.slice(0, 10)} · {item.expiresAt.slice(0, 10)}</small></div>
                  <IconButton label={t.restore} onClick={() => restoreDeletedPlan(item.id)}><DownloadIcon width={16} height={16} /></IconButton>
                </Card>
              )) : <div className="empty-state">{t.noDeleted}</div>)}
            </section>
          ) : null}
        </main>
        {showBackToTop ? <button type="button" className="plans-back-to-top" aria-label="Volver arriba" onClick={() => plansScrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}><ChevronUpIcon width={20} height={20} /></button> : null}
        <footer className="domoforge-footer">Diseñado y desarrollado por <a href="https://domoforge.com" target="_blank" rel="noreferrer">Domoforge</a></footer>
      </div>

      {undoDelete ? (
        <div className="undo-toast" role="status" onTouchStart={(event) => { touchStartXRef.current = event.touches[0]?.clientX ?? null }} onTouchEnd={(event) => { const endX = event.changedTouches[0]?.clientX; if (touchStartXRef.current !== null && endX !== undefined && Math.abs(endX - touchStartXRef.current) > 60) dismissUndo(); touchStartXRef.current = null }}>
          <span><strong>{undoDelete.title}</strong> {locale === 'es' ? 'se eliminó' : 'was deleted'}</span>
          <button type="button" className="undo-toast__action" onClick={undoLastDelete}>{locale === 'es' ? 'Deshacer' : 'Undo'}</button>
          <button type="button" className="undo-toast__close" aria-label="Cerrar" onClick={dismissUndo}>×</button>
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
              </div>
            </div>
            <footer className="modal-footer">
              <Button variant="ghost" type="button" onClick={() => setQuickEditTarget(null)}>{t.cancel}</Button>
              <Button variant="primary" type="button" onClick={handleSaveQuickEdit}>{t.save}</Button>
            </footer>
          </div>
        </div>
      ) : null}

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
              <Button variant="primary" type="button" onClick={handleCreatePlan}>{t.createPlan}</Button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
