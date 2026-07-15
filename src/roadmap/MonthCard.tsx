import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import type { Activity, MonthBucket } from '../types/roadmap'
import { CalendarIcon, ChevronRightIcon } from '../ui/icons'
import { InlineSavingsValue } from './InlineSavingsValue'
import { getActivityDisplayId, shouldShowMonthlySavings } from '../utils/roadmapModel'

interface MonthEntry {
  activity: Activity
  progress: number
  status: string
}

interface MonthCardProps {
  month: MonthBucket
  entries: MonthEntry[]
  monthOptions: MonthBucket[]
  savings: {
    enabled: boolean
    registered: boolean
    mode: 'free' | 'monthly-target'
    target: number
    actual: number
    notes?: string
  }
  savingsToneClass: string
  onOpenActivity: (activityId: string) => void
  onSkip: (activityId: string, monthId: string) => void
  onPause: (activityId: string, monthId: string) => void
  onContinueIn: (activityId: string, monthId: string, targetMonthId: string) => void
  onResumeIn: (activityId: string, monthId: string, targetMonthId: string) => void
  onMoveEntry: (activityId: string, sourceMonthId: string, targetMonthId: string) => void
  onSaveSavings: (monthId: string, target: number, actual: number, notes?: string) => void
  onCreateActivity: (title: string, category: string) => void
}

function monthIndex(monthId: string) {
  return Number(monthId.slice(5, 7))
}

function clampActivityTitle(title: string) {
  return title.length > 72 ? `${title.slice(0, 69)}...` : title
}

export function MonthCard({
  month,
  entries,
  monthOptions,
  savings,
  savingsToneClass,
  onOpenActivity,
  onSkip,
  onPause,
  onContinueIn,
  onResumeIn,
  onMoveEntry,
  onSaveSavings,
  onCreateActivity,
}: MonthCardProps) {
  const navigate = useNavigate()
  const { planId } = useParams()
  const activities = useRoadmapStore((state) => state.activities)
  const project = useRoadmapStore((state) => state.project)
  const locale = useRoadmapStore((state) => state.locale)
  const setSelectedPeriod = useRoadmapStore((state) => state.setSelectedPeriod)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const availableCategories = project.categoryDefinitions?.length ? project.categoryDefinitions : [{ key: 'general', label: 'General', tone: 'slate' as const }]
  const defaultCategoryKey = availableCategories.find((category) => category.isDefault)?.key ?? availableCategories[0].key
  const [draftCategory, setDraftCategory] = useState(defaultCategoryKey)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollIndicators, setScrollIndicators] = useState({ above: 0, below: 0 })

  function updateScrollIndicators() {
    const container = scrollRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const activityItems = container.querySelectorAll<HTMLElement>('[data-month-activity]')
    let above = 0
    let below = 0
    activityItems.forEach((item) => {
      const itemRect = item.getBoundingClientRect()
      if (itemRect.bottom <= containerRect.top + 1) above += 1
      else if (itemRect.top >= containerRect.bottom - 1) below += 1
    })
    setScrollIndicators((current) => current.above === above && current.below === below ? current : { above, below })
  }

  useEffect(() => {
    if (creating) {
      titleInputRef.current?.focus()
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [creating])

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateScrollIndicators)
    const container = scrollRef.current
    const observer = container && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateScrollIndicators)
      : null
    if (container) observer?.observe(container)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [entries, creating])
  const outsidePlanRange = !month.active
  const hasSavingsData = savings.enabled && savings.registered
  const showSavingsFooter = shouldShowMonthlySavings({
    savingsEnabled: savings.enabled,
    insidePlanWindow: month.active,
    activityCount: entries.length,
    target: savings.registered && savings.mode === 'monthly-target' ? savings.target : 0,
    actual: savings.actual,
    notes: savings.notes,
  })
  const t = locale === 'es' ? { open: 'Abrir', earlier: 'Mover antes', skip: 'Omitir', pause: 'Pausar', continueIn: 'Continuar en', resumeIn: 'Reanudar en', empty: 'Sin objetivos registrados', create: 'Crear actividad', more: 'más', target: 'Objetivo', actual: 'Real', notes: 'Notas', cancel: 'Cancelar', save: 'Guardar', of: 'de', editSavings: 'Editar ahorro' } : { open: 'Open', earlier: 'Move earlier', skip: 'Skip', pause: 'Pause', continueIn: 'Continue in', resumeIn: 'Resume in', empty: 'No objectives registered', create: 'Create activity', more: 'more', target: 'Target', actual: 'Actual', notes: 'Notes', cancel: 'Cancel', save: 'Save', of: 'of', editSavings: 'Edit savings' }
  const previousActiveMonth = [...monthOptions].filter((item) => item.active && item.id < month.id).at(-1)

  const monthDependencies = useMemo(() => {
    const blockers = new Map<string, string>()

    for (const { activity } of entries) {
      for (const dependencyId of activity.dependencyIds) {
        const dependency = activities.find((candidate) => candidate.id === dependencyId)
        if (!dependency) {
          continue
        }

        const dependencyMonthIds = Object.keys(dependency.monthlyEntries).sort()
        const dependencyLatestMonth = dependencyMonthIds.at(-1)
        if (!dependencyLatestMonth) {
          continue
        }

        const currentMonthIndex = monthIndex(month.id)
        const dependencyMonthIndex = monthIndex(dependencyLatestMonth)
        if (dependencyMonthIndex >= currentMonthIndex) {
          blockers.set(activity.id, dependency.title)
        }
      }
    }

    return blockers
  }, [activities, entries, month.id])


  function openMonth() {
    setSelectedPeriod(month.id)
    navigate(planId ? `/plans/${planId}/monthly/${month.id}` : `/monthly/${month.id}`)
  }

  function openPreviousMonth(activity: Activity) {
    if (!previousActiveMonth) {
      return
    }

    onMoveEntry(activity.id, month.id, previousActiveMonth.id)
  }

  function cancelCreation() {
    setCreating(false)
    setDraftTitle('')
    setDraftCategory(defaultCategoryKey)
  }

  function saveCreation() {
    const title = draftTitle.trim()
    if (!title) {
      cancelCreation()
      return
    }
    onCreateActivity(title, draftCategory)
    cancelCreation()
  }

  return (
    <article className={`month-card${outsidePlanRange ? ' month-card-outside-range' : ''}${!entries.length && !hasSavingsData ? ' month-card-empty' : ''}`}>
      <div className="month-card-head">
        <button className="month-card-title" onClick={openMonth}>{month.shortLabel}</button>
        <span className="month-card-head-icons">
          <CalendarIcon width={14} height={14} />
          <button type="button" className="month-card-create" onClick={() => setCreating(true)} aria-label={t.create}>+</button>
        </span>
      </div>

      <div className="month-card-body">
        <div className="month-card-scroll-shell">
        {scrollIndicators.above > 0 ? <button type="button" className="month-scroll-indicator month-scroll-indicator-top" aria-label={locale === 'es' ? `${scrollIndicators.above} actividades arriba` : `${scrollIndicators.above} activities above`} onClick={() => scrollRef.current?.scrollBy({ top: -scrollRef.current.clientHeight * .75, behavior: 'smooth' })}>↑ {scrollIndicators.above} {locale === 'es' ? 'más' : 'more'}</button> : null}
        <div ref={scrollRef} className="month-card-scroll" tabIndex={0} aria-label={`${month.longLabel}: ${t.open}`} onScroll={updateScrollIndicators}>
        {entries.length || creating ? (
          <ul className="month-entry-list">
            {entries.map(({ activity, progress, status }) => {
              const blocker = monthDependencies.get(activity.id)
              const targetMonthId = previousActiveMonth?.id ?? month.id
              return (
                <li key={activity.id} data-month-activity className={`month-entry-item month-entry-${activity.colorKey}`}>
                  <div className="month-entry-main">
                    <button
                      className="month-entry-handle"
                      disabled={Boolean(blocker) || !previousActiveMonth}
                      title={blocker ? `Blocked by ${blocker}` : previousActiveMonth ? 'Move entry backward' : 'No earlier month available'}
                      onClick={() => openPreviousMonth(activity)}
                    >
                      {blocker ? <span className="lock-icon">Lock</span> : <ChevronRightIcon className="move-earlier-icon" width={14} height={14} />}
                    </button>
                    <button className="month-entry-title" onClick={() => onOpenActivity(activity.id)} title={activity.title}>
                      {clampActivityTitle(activity.title)}
                    </button>
                    <button className="month-entry-menu-trigger" onClick={() => setOpenMenuId((current) => (current === activity.id ? null : activity.id))}>
                      ⋮
                    </button>
                  </div>
                  <div className="month-entry-meta">
                    <span className="month-entry-category">{activity.category}</span>
                    <span className="month-entry-key">{getActivityDisplayId(activity, project, activities)}</span>
                    <span className="month-entry-status">{status}</span>
                    <span className="month-entry-progress">{progress}%</span>
                  </div>

                  {openMenuId === activity.id ? (
                    <div className="month-entry-menu">
                      <button onClick={() => onOpenActivity(activity.id)}>{t.open}</button>
                      <button onClick={() => openPreviousMonth(activity)} disabled={!previousActiveMonth || Boolean(blocker)}>{t.earlier}</button>
                      <button onClick={() => onSkip(activity.id, month.id)}>{t.skip}</button>
                      <button onClick={() => onPause(activity.id, month.id)}>{t.pause}</button>
                      <button onClick={() => onContinueIn(activity.id, month.id, targetMonthId)}>{t.continueIn}</button>
                      <button onClick={() => onResumeIn(activity.id, month.id, targetMonthId)}>{t.resumeIn}</button>
                    </div>
                  ) : null}
                </li>
              )
            })}
            {creating ? <li className="month-entry-item month-entry-create">
              <input ref={titleInputRef} className="field-input-inline" value={draftTitle} placeholder={locale === 'es' ? 'Título de la actividad' : 'Activity title'} aria-label={locale === 'es' ? 'Título de la actividad' : 'Activity title'} onChange={(event) => setDraftTitle(event.target.value)} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null) && draftTitle.trim()) saveCreation() }} onKeyDown={(event) => { if (event.key === 'Enter') saveCreation(); if (event.key === 'Escape') cancelCreation() }} />
              <select className="field-input-inline" aria-label={locale === 'es' ? 'Categoría' : 'Category'} value={draftCategory} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => setDraftCategory(event.target.value)} onBlur={() => { if (draftTitle.trim()) saveCreation() }}>{availableCategories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select>
            </li> : null}
          </ul>
        ) : (
          <div className="month-empty-state">
            <span>{t.empty}</span>
            <button className="month-empty-add" onClick={() => setCreating(true)} aria-label={t.create}>
              +
            </button>
          </div>
        )}
        </div>
        {scrollIndicators.below > 0 ? <button type="button" className="month-scroll-indicator month-scroll-indicator-bottom" aria-label={locale === 'es' ? `${scrollIndicators.below} actividades abajo` : `${scrollIndicators.below} activities below`} onClick={() => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * .75, behavior: 'smooth' })}>↓ {scrollIndicators.below} {locale === 'es' ? 'más' : 'more'}</button> : null}
        </div>
        {showSavingsFooter ? <footer className={`month-savings-footer ${savings.mode === 'free' ? 'savings-state-neutral' : savingsToneClass}`}>
          <div className="month-savings-inline" onClick={(event) => event.stopPropagation()}>
            <span>{locale === 'es' ? 'Ahorro:' : 'Savings:'}</span>
            <InlineSavingsValue value={savings.actual} label={t.actual} onSave={(actual) => onSaveSavings(month.id, savings.target, actual, savings.notes)} />
            {savings.mode === 'monthly-target' ? <><span>/</span><InlineSavingsValue value={savings.target} label={t.target} onSave={(target) => onSaveSavings(month.id, target, savings.actual, savings.notes)} /></> : null}
          </div>
        </footer> : null}
      </div>
    </article>
  )
}
