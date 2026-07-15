import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { activityTouchesMonth, buildYearMonths, getProjectDurationMonths, shiftActivityToDate } from '../utils/dateUtils'
import { activityOccursOnDate, getActivityProgressForMonth, getActivityStatusForMonth, getEffectiveMonthlySavingsTarget, getSavingsEntry, isSavingsTrackingEnabled } from '../utils/roadmapModel'
import { CalendarIcon, ListIcon } from '../ui/icons'
import { MonthCard } from './MonthCard'

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
  const quickEditPlan = useForgePlannerStore((state) => state.quickEditPlan)
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
  const updateActivity = useRoadmapStore((state) => state.updateActivity)
  const { planId } = useParams()
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window === 'undefined' ? 1200 : window.innerWidth)
  const [monthOrder, setMonthOrder] = useState<Record<string, string[]>>({})
  const [page, setPage] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const initializedRoadmapKey = useRef('')
  const [draggedCalendarActivityId, setDraggedCalendarActivityId] = useState<string | null>(null)

  const months = useMemo(
    () => buildYearMonths(selectedYear, project.startDate, project.endDate, locale),
    [selectedYear, project.startDate, project.endDate, locale],
  )
  const automaticMode = getProjectDurationMonths(project.startDate, project.endDate) <= 6 ? 'monthly' : 'annual'
  const roadmapMode = activePlan?.planningMode === 'monthly' || activePlan?.planningMode === 'annual' ? activePlan.planningMode : automaticMode
  const pageSize = viewportWidth <= 425 ? 2 : viewportWidth <= 768 ? 4 : 12;
  const modeMonths = roadmapMode === 'annual' ? months : months.filter((month) => month.active)
  const totalPages = Math.max(1, Math.ceil(modeMonths.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const visibleMonths = modeMonths.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const weekdayLabels = locale === 'es' ? ['D', 'L', 'M', 'M', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  function setRoadmapMode(mode: 'annual' | 'monthly') {
    setPage(0)
    if (activePlan) quickEditPlan(activePlan.id, { planningMode: mode })
  }

  function movePage(direction: number) {
    setPage((current) => Math.max(0, Math.min(totalPages - 1, current + direction)))
  }

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const initializationKey = `${selectedYear}-${pageSize}-${roadmapMode}`
    if (initializedRoadmapKey.current === initializationKey || activities.length === 0) return

    const firstMonthWithData = modeMonths.findIndex((month) =>
      activities.some((activity) => activityTouchesMonth(activity, month.id)),
    )
    const initialPage = viewportWidth <= 768 && firstMonthWithData >= 0
      ? Math.floor(firstMonthWithData / pageSize)
      : 0

    setPage(initialPage)
    initializedRoadmapKey.current = initializationKey
  }, [activities, modeMonths, pageSize, roadmapMode, selectedYear, viewportWidth])

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
    const byId = new Map(activities.map((activity) => [activity.id, activity]))
    return Object.fromEntries(
      months.map((month) => {
        const order = monthOrder[month.id] ?? []
        const orderedActivities = order.map((id) => byId.get(id)).filter((item): item is typeof activities[number] => Boolean(item))
        const fallback = activities.filter(
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
  }, [activities, months, monthOrder])

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
      <div className="roadmap-controls">
      <div className="roadmap-mode-toggle" role="group" aria-label={locale === 'es' ? 'Vista del roadmap' : 'Roadmap view'}>
        <button type="button" className={roadmapMode === 'annual' ? 'is-active' : ''} title={locale === 'es' ? 'Vista anual' : 'Annual view'} onClick={() => setRoadmapMode('annual')}><ListIcon width={18} height={18} /><span>{locale === 'es' ? 'Anual' : 'Annual'}</span></button>
        <button type="button" className={roadmapMode === 'monthly' ? 'is-active' : ''} title={locale === 'es' ? 'Vista mensual' : 'Monthly view'} onClick={() => setRoadmapMode('monthly')}><CalendarIcon width={18} height={18} /><span>{locale === 'es' ? 'Mensual' : 'Monthly'}</span></button>
      </div>
      <div className="roadmap-pagination" aria-label={locale === 'es' ? 'Navegar periodos' : 'Navigate periods'}>
        <button type="button" disabled={safePage === 0} onClick={() => movePage(-1)}>‹</button>
        <span>{safePage + 1} / {totalPages}</span>
        <button type="button" disabled={safePage >= totalPages - 1} onClick={() => movePage(1)}>›</button>
      </div>
      </div>
      <div className="roadmap-page" onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null }} onTouchEnd={(event) => { const endX = event.changedTouches[0]?.clientX; if (touchStartX.current !== null && endX !== undefined && Math.abs(endX - touchStartX.current) > 55) movePage(endX < touchStartX.current ? 1 : -1); touchStartX.current = null }}>
      {roadmapMode === 'annual' ? (
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
      ) : (
        <section className="roadmap-monthly-calendars">
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
                    const dayEntries = activities.filter((activity) => activityOccursOnDate(activity, date))
                    return (
                      <div key={day} className="roadmap-day-cell" title={dayEntries.map((activity) => activity.title).join("\n")} onDragOver={(event) => { if (draggedCalendarActivityId) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); const activity = activities.find((item) => item.id === draggedCalendarActivityId); if (activity) { const sourceMonthId = activity.startDate.slice(0, 7); updateActivity(activity.id, shiftActivityToDate(activity, date)); if (sourceMonthId !== month.id && activity.monthlyEntries[sourceMonthId]) moveMonthlyEntry(activity.id, sourceMonthId, month.id) } setDraggedCalendarActivityId(null) }}>
                        <button type="button" className="roadmap-day-number" onClick={() => dayEntries[0] && openActivity(dayEntries[0].id)}>{day}</button>
                        <span>{dayEntries.slice(0, 3).map((activity) => <button type="button" draggable key={activity.id} className={`roadmap-task-dot roadmap-task-dot-${activity.colorKey}`} aria-label={activity.title} title={activity.title} onDragStart={(event) => { setDraggedCalendarActivityId(activity.id); event.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDraggedCalendarActivityId(null)} onClick={() => openActivity(activity.id)} />)}</span>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </section>
      )}
      </div>
    </div>
  )
}
