import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { activityTouchesMonth, buildYearMonths, getProjectDurationMonths } from '../utils/dateUtils'
import { activityOccursOnDate, getActivityProgressForMonth, getActivityStatusForMonth, getEffectiveMonthlySavingsTarget, getSavingsEntry, isSavingsTrackingEnabled } from '../utils/roadmapModel'
import { CalendarIcon, ClockIcon, ListIcon } from '../ui/icons'
import { MonthCard } from './MonthCard'
import { CategoryFilter } from '../ui/CategoryFilter'
import { RoadmapSchedule } from './RoadmapSchedule'
import { RoadmapDayPreview } from './RoadmapDayPreview'
import { readRoadmapCalendarPageSize, recommendedRoadmapCalendarPageSize, resolveRoadmapCalendarPageSize, writeRoadmapCalendarPageSize, type RoadmapCalendarPageSize } from '../persistence/roadmapCalendarPreference'
import { customColorClass } from '../ui/customColor'

function getSavingsToneClass(target: number, actual: number) {
  if (target <= 0 && actual <= 0) {
    return 'savings-state-strong-red'
  }

  const difference = actual - target
  if (actual === 0) {
    return 'savings-state-strong-red'
  }

  if (target > 0) {
    const ratio = (actual / target) * 100
    if (ratio > 0 && ratio <= 25) {
      return 'savings-state-red'
    }
    if (ratio > 25 && ratio < 70) {
      return 'savings-state-soft-red'
    }
    if (ratio >= 70 && ratio < 100) {
      return 'savings-state-orange'
    }
    if (ratio === 100) {
      return 'savings-state-neutral'
    }
    if (ratio > 100) {
      return difference >= 100 ? 'savings-state-strong-green' : 'savings-state-light-green'
    }
  }

  return 'savings-state-strong-red'
}

export function AnnualRoadmap() {
  const navigate = useNavigate()
  const project = useRoadmapStore((state) => state.project)
  const activities = useRoadmapStore((state) => state.activities)
  const locale = useRoadmapStore((state) => state.locale)
  const activePlan = useForgePlannerStore((state) => state.activePlanId ? state.plans.find((plan) => plan.id === state.activePlanId) : undefined)
  const createActivity = useRoadmapStore((state) => state.createActivity)
  const selectedYear = useRoadmapStore((state) => state.selectedYear)
  const setSelectedMonthId = useRoadmapStore((state) => state.setSelectedMonthId)
  const openActivity = useRoadmapStore((state) => state.openActivity)
  const skipActivityMonth = useRoadmapStore((state) => state.skipActivityMonth)
  const pauseActivityMonth = useRoadmapStore((state) => state.pauseActivityMonth)
  const continueActivityInMonth = useRoadmapStore((state) => state.continueActivityInMonth)
  const resumeActivityInMonth = useRoadmapStore((state) => state.resumeActivityInMonth)
  const moveMonthlyEntry = useRoadmapStore((state) => state.moveMonthlyEntry)
  const updateSavingsEntry = useRoadmapStore((state) => state.updateSavingsEntry)
  const { planId } = useParams()
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window === 'undefined' ? 1200 : window.innerWidth)
  const [monthOrder, setMonthOrder] = useState<Record<string, string[]>>({})
  const [page, setPage] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const roadmapPageRef = useRef<HTMLDivElement>(null)
  const initializedRoadmapKey = useRef('')
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [roadmapView, setRoadmapView] = useState<'overview' | 'calendar' | 'schedule'>(() => activePlan?.planningMode === 'monthly' || (activePlan?.planningMode === 'auto' && getProjectDurationMonths(project.startDate, project.endDate) <= 6) ? 'calendar' : 'overview')
  const [initialCalendarPageSize] = useState<{ value: RoadmapCalendarPageSize; customized: boolean }>(() => {
    const stored = typeof window === 'undefined' ? null : readRoadmapCalendarPageSize()
    return { value: stored ?? recommendedRoadmapCalendarPageSize(viewportWidth), customized: stored !== null }
  })
  const calendarPageSizeCustomized = useRef(initialCalendarPageSize.customized)
  const [calendarPageSize, setCalendarPageSize] = useState(initialCalendarPageSize.value)
  const availableCategories = project.categoryDefinitions ?? []
  const visibleActivities = useMemo(
    () => categoryFilters.length ? activities.filter((activity) => categoryFilters.includes(activity.category)) : activities,
    [activities, categoryFilters],
  )

  const months = useMemo(
    () => buildYearMonths(selectedYear, project.startDate, project.endDate, locale),
    [selectedYear, project.startDate, project.endDate, locale],
  )
  const effectiveRoadmapView = roadmapView
  const effectiveCalendarPageSize = resolveRoadmapCalendarPageSize(viewportWidth, calendarPageSize)
  const pageSize = effectiveRoadmapView === 'schedule' ? 1 : effectiveRoadmapView === 'calendar' ? effectiveCalendarPageSize : viewportWidth <= 425 ? 2 : viewportWidth <= 768 ? 4 : 12
  const modeMonths = effectiveRoadmapView === 'overview' ? months : months.filter((month) => month.active)
  const totalPages = Math.max(1, Math.ceil(modeMonths.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const visibleMonths = modeMonths.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const weekdayLabels = locale === 'es' ? ['D', 'L', 'M', 'M', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  function setRoadmapMode(mode: 'overview' | 'calendar' | 'schedule') {
    setPage(0)
    setRoadmapView(mode)
    window.requestAnimationFrame(() => {
      const pageElement = roadmapPageRef.current
      pageElement?.focus({ preventScroll: true })
      pageElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function selectCalendarPageSize(next: RoadmapCalendarPageSize) {
    const firstVisibleMonth = safePage * effectiveCalendarPageSize
    calendarPageSizeCustomized.current = true
    setCalendarPageSize(next)
    setPage(Math.floor(firstVisibleMonth / next))
    writeRoadmapCalendarPageSize(next)
  }

  function movePage(direction: number) {
    setPage((current) => Math.max(0, Math.min(totalPages - 1, current + direction)))
  }

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth)
      if (!calendarPageSizeCustomized.current) setCalendarPageSize(recommendedRoadmapCalendarPageSize(window.innerWidth))
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const initializationKey = `${selectedYear}-${pageSize}-${effectiveRoadmapView}-${categoryFilters.join(',')}`
    if (initializedRoadmapKey.current === initializationKey || visibleActivities.length === 0) return

    const firstMonthWithData = modeMonths.findIndex((month) =>
      visibleActivities.some((activity) => activityTouchesMonth(activity, month.id)),
    )
    const initialPage = viewportWidth <= 768 && firstMonthWithData >= 0
      ? Math.floor(firstMonthWithData / pageSize)
      : 0

    setPage(initialPage)
    initializedRoadmapKey.current = initializationKey
  }, [categoryFilters, effectiveRoadmapView, modeMonths, pageSize, selectedYear, viewportWidth, visibleActivities])

  useEffect(() => {
    // Keep user-defined ordering while reconciling reactive store updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonthOrder((current) => {
      const next: Record<string, string[]> = {}
      for (const month of months) {
        const monthActivityIds = activities.filter((activity) => activityTouchesMonth(activity, month.id)).map((activity) => activity.id)
        const existing = current[month.id] ?? []
        const preserved = existing.filter((id) => monthActivityIds.includes(id))
        const missing = monthActivityIds.filter((id) => !preserved.includes(id))
        next[month.id] = [...preserved, ...missing]
      }

      const currentMonthIds = Object.keys(current)
      const nextMonthIds = Object.keys(next)
      const unchanged =
        currentMonthIds.length === nextMonthIds.length &&
        nextMonthIds.every((monthId) => {
          const currentOrder = current[monthId] ?? []
          const nextOrder = next[monthId]
          return currentOrder.length === nextOrder.length && currentOrder.every((id, index) => id === nextOrder[index])
        })

      return unchanged ? current : next
    })
  }, [activities, months])

  const entriesByMonth = useMemo(() => {
    const byId = new Map(visibleActivities.map((activity) => [activity.id, activity]))
    return Object.fromEntries(
      months.map((month) => {
        const order = monthOrder[month.id] ?? []
        const orderedActivities = order.map((id) => byId.get(id)).filter((item): item is typeof activities[number] => Boolean(item))
        const fallback = visibleActivities.filter(
          (activity) => activityTouchesMonth(activity, month.id) && !order.includes(activity.id),
        )

        const rows = [...orderedActivities, ...fallback]
          .filter((activity) => activityTouchesMonth(activity, month.id))
          .map((activity) => ({
            activity,
            status: getActivityStatusForMonth(activity, month.id) ?? 'planned',
            progress: getActivityProgressForMonth(activity, month.id),
          }))

        return [month.id, rows]
      }),
    )
  }, [months, monthOrder, visibleActivities])

  function createMonthActivity(monthId: string, title: string, category: string) {
    const month = months.find((item) => item.id === monthId)
    if (!month) {
      return
    }

    createActivity({
      title,
      description: '',
      category,
      priority: 'medium',
      relationshipMode: 'independent',
      startDate: month.startDate,
      endDate: month.endDate,
      firstMonthId: month.id,
      initialStatus: 'planned',
      dependencyIds: [],
      linkedActivityIds: [],
      milestone: false,
      notes: '',
      subtasks: [],
    })
    setSelectedMonthId(monthId)
  }

  return (
    <div className="roadmap-stack">
      <div className="roadmap-view-toolbar">
      <div className="roadmap-controls">
      <div className="roadmap-mode-toggle" role="group" aria-label={locale === 'es' ? 'Vista del roadmap' : 'Roadmap view'}>
        <button type="button" className={effectiveRoadmapView === 'overview' ? 'is-active' : ''} title={locale === 'es' ? 'Panorama de los 12 meses' : 'Twelve-month overview'} onClick={() => setRoadmapMode('overview')}><ListIcon width={18} height={18} /><span>{locale === 'es' ? 'Panorama' : 'Overview'}</span></button>
        <button type="button" className={effectiveRoadmapView === 'calendar' ? 'is-active' : ''} title={locale === 'es' ? 'Calendario por días' : 'Calendar by day'} onClick={() => setRoadmapMode('calendar')}><CalendarIcon width={18} height={18} /><span>{locale === 'es' ? 'Calendario' : 'Calendar'}</span></button>
        <button type="button" className={effectiveRoadmapView === 'schedule' ? 'is-active' : ''} title={locale === 'es' ? 'Agenda semanal' : 'Weekly schedule'} onClick={() => setRoadmapMode('schedule')}><ClockIcon width={18} height={18} /><span>{locale === 'es' ? 'Agenda' : 'Schedule'}</span></button>
      </div>
      </div>
      <div className="roadmap-filter-bar">
        <div className="roadmap-filter-options">
          <CategoryFilter multiple categories={availableCategories} values={categoryFilters} locale={locale} onChange={(values) => { setCategoryFilters(values); setPage(0) }} />
        </div>
        {effectiveRoadmapView !== 'calendar' && totalPages > 1 ? <div className="roadmap-pagination" aria-label={locale === 'es' ? 'Navegar periodos' : 'Navigate periods'}>
          <button type="button" disabled={safePage === 0} onClick={() => movePage(-1)}>‹</button>
          <span>{safePage + 1} / {totalPages}</span>
          <button type="button" disabled={safePage >= totalPages - 1} onClick={() => movePage(1)}>›</button>
        </div> : null}
      </div>
      </div>
      {effectiveRoadmapView === 'calendar' ? <div className="roadmap-calendar-navigation-row">
        {viewportWidth > 1024 ? <label className="roadmap-calendar-density">
          <span>{locale === 'es' ? 'Meses por página' : 'Months per page'}</span>
          <select value={calendarPageSize} onChange={(event) => selectCalendarPageSize(Number(event.target.value) as RoadmapCalendarPageSize)}>
            {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label> : <span aria-hidden="true" />}
        {totalPages > 1 ? <div className="roadmap-pagination" aria-label={locale === 'es' ? 'Navegar periodos' : 'Navigate periods'}>
          <button type="button" disabled={safePage === 0} onClick={() => movePage(-1)}>‹</button>
          <span>{safePage + 1} / {totalPages}</span>
          <button type="button" disabled={safePage >= totalPages - 1} onClick={() => movePage(1)}>›</button>
        </div> : null}
      </div> : null}
      <div ref={roadmapPageRef} className="roadmap-page" tabIndex={-1} onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null }} onTouchEnd={(event) => { const endX = event.changedTouches[0]?.clientX; if (touchStartX.current !== null && endX !== undefined && Math.abs(endX - touchStartX.current) > 55) movePage(endX < touchStartX.current ? 1 : -1); touchStartX.current = null }}>
      {effectiveRoadmapView === 'overview' ? (
      <section className="annual-month-grid">
        {visibleMonths.map((month) => {
          const savings = getSavingsEntry(project, month.id)
          const entries = entriesByMonth[month.id] ?? []
          const savingsEnabled = isSavingsTrackingEnabled(project)
          const savingsMode = project.savingsPlan.mode ?? 'monthly-target'
          const effectiveSavingsTarget = getEffectiveMonthlySavingsTarget(project, month.id)
          const savingsActual = savings?.actual ?? 0

          return (
            <MonthCard
              key={month.id}
              month={month}
              monthOptions={months}
              entries={entries}
              savings={{
                enabled: savingsEnabled,
                registered: Boolean(savings && (savings.target > 0 || savings.actual > 0 || savings.notes?.trim())),
                mode: savingsMode,
                target: effectiveSavingsTarget,
                actual: savingsActual,
                notes: savings?.notes,
              }}
              savingsToneClass={getSavingsToneClass(effectiveSavingsTarget, savingsActual)}
              onOpenActivity={openActivity}
              onSkip={skipActivityMonth}
              onPause={pauseActivityMonth}
              onContinueIn={continueActivityInMonth}
              onResumeIn={resumeActivityInMonth}
              onMoveEntry={moveMonthlyEntry}
              onSaveSavings={updateSavingsEntry}
              onCreateActivity={(title, category) => createMonthActivity(month.id, title, category)}
            />
          )
        })}
      </section>
      ) : effectiveRoadmapView === 'calendar' ? (
        <section className={`roadmap-monthly-calendars roadmap-columns-${effectiveCalendarPageSize}`}>
          {visibleMonths.map((month) => {
            const firstWeekday = new Date(`${month.id}-01T00:00:00Z`).getUTCDay()
            const daysInMonth = Number(month.endDate.slice(8, 10))
            const cells = Array.from({ length: 42 }, (_, index) => index < firstWeekday || index >= firstWeekday + daysInMonth ? null : index - firstWeekday + 1)
            return (
              <article key={month.id} className="roadmap-calendar-card">
                <button type="button" className="roadmap-calendar-title" onClick={() => navigate(planId ? `/plans/${planId}/monthly/${month.id}` : `/monthly/${month.id}`)}>{month.longLabel}</button>
                <div className="roadmap-day-calendar">
                  {weekdayLabels.map((label, index) => <span key={`${label}-${index}`} className="roadmap-day-weekday">{label}</span>)}
                  {cells.map((day, index) => {
                    if (day === null) return <span key={`empty-${index}`} className="roadmap-day-cell is-empty" />
                    const date = `${month.id}-${String(day).padStart(2, "0")}`
                    const dayEntries = visibleActivities.filter((activity) => activityOccursOnDate(activity, date))
                    return (
                      <div key={day} className="roadmap-day-cell">
                        <button type="button" className="roadmap-day-number" onClick={() => dayEntries[0] && openActivity(dayEntries[0].id)}>{day}</button>
                        <span>{dayEntries.slice(0, 3).map((activity) => <button type="button" key={activity.id} className={`roadmap-task-dot roadmap-task-dot-${activity.colorKey} ${customColorClass(activity.colorHex)}`} aria-label={activity.title} title={activity.title} onClick={() => openActivity(activity.id)} />)}</span>
                        {dayEntries.length ? <RoadmapDayPreview date={date} activities={dayEntries} locale={locale} onOpenActivity={openActivity} /> : null}
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </section>
      ) : visibleMonths[0] ? <RoadmapSchedule month={visibleMonths[0]} activities={visibleActivities} locale={locale} onOpenActivity={openActivity} /> : null}
      </div>
    </div>
  )
}
