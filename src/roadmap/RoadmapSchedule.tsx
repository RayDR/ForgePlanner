import { useEffect, useMemo, useRef, useState } from 'react'
import type { Activity, MonthBucket } from '../types/roadmap'
import { activityOccursOnDate } from '../utils/roadmapModel'
import { customColorClass } from '../ui/customColor'

interface RoadmapScheduleProps {
  month: MonthBucket
  activities: Activity[]
  locale: 'es' | 'en'
  onOpenActivity: (activityId: string) => void
}

interface WeekDay {
  date: string
  inMonth: boolean
  activities: Activity[]
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function ScheduleAllDayColumn({ day, locale, onOpenActivity }: { day: WeekDay; locale: 'es' | 'en'; onOpenActivity: (activityId: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [indicators, setIndicators] = useState({ above: 0, below: 0 })

  function updateIndicators() {
    const container = scrollRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    let above = 0
    let below = 0
    container.querySelectorAll<HTMLElement>('[data-schedule-activity]').forEach((item) => {
      const itemRect = item.getBoundingClientRect()
      if (itemRect.bottom <= containerRect.top + 1) above += 1
      else if (itemRect.top >= containerRect.bottom - 1) below += 1
    })
    setIndicators((current) => current.above === above && current.below === below ? current : { above, below })
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateIndicators)
    const container = scrollRef.current
    const observer = container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateIndicators) : null
    if (container) observer?.observe(container)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [day.activities])

  return (
    <div className={day.inMonth ? 'roadmap-week-all-day-shell' : 'roadmap-week-all-day-shell is-outside'}>
      {indicators.above > 0 ? <button type="button" className="month-scroll-indicator month-scroll-indicator-top roadmap-week-scroll-indicator" onClick={() => scrollRef.current?.scrollBy({ top: -scrollRef.current.clientHeight * .75, behavior: 'smooth' })} aria-label={locale === 'es' ? `${indicators.above} actividades arriba` : `${indicators.above} activities above`}>↑ {indicators.above}</button> : null}
      <div ref={scrollRef} className="roadmap-week-all-day" tabIndex={day.activities.length ? 0 : -1} onScroll={updateIndicators}>
        {day.activities.map((activity) => (
          <button data-schedule-activity key={activity.id} type="button" className={`roadmap-schedule-task roadmap-schedule-task-${activity.colorKey} ${customColorClass(activity.colorHex)}`} onClick={() => onOpenActivity(activity.id)}>
            <strong>{activity.title}</strong>
            {activity.estimatedHours ? <small>{activity.estimatedHours} h · {locale === 'es' ? 'sin hora fija' : 'unscheduled'}</small> : null}
          </button>
        ))}
      </div>
      {indicators.below > 0 ? <button type="button" className="month-scroll-indicator month-scroll-indicator-bottom roadmap-week-scroll-indicator" onClick={() => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * .75, behavior: 'smooth' })} aria-label={locale === 'es' ? `${indicators.below} actividades abajo` : `${indicators.below} activities below`}>↓ {indicators.below}</button> : null}
    </div>
  )
}

export function RoadmapSchedule({ month, activities, locale, onOpenActivity }: RoadmapScheduleProps) {
  const touchStartX = useRef<number | null>(null)
  const weeks = useMemo(() => {
    const first = new Date(`${month.startDate}T00:00:00Z`)
    const last = new Date(`${month.endDate}T00:00:00Z`)
    const gridStart = new Date(first)
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay())
    const gridEnd = new Date(last)
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()))
    const result: WeekDay[][] = []

    for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
      result.push(Array.from({ length: 7 }, (_, index) => {
        const day = new Date(cursor)
        day.setUTCDate(day.getUTCDate() + index)
        const date = toIsoDate(day)
        return {
          date,
          inMonth: date.startsWith(month.id),
          activities: activities.filter((activity) => activityOccursOnDate(activity, date)),
        }
      }))
    }
    return result
  }, [activities, month.endDate, month.id, month.startDate])
  const firstWeekWithData = Math.max(0, weeks.findIndex((week) => week.some((day) => day.inMonth && day.activities.length > 0)))
  const [weekIndex, setWeekIndex] = useState(firstWeekWithData)
  const safeWeekIndex = Math.min(weekIndex, Math.max(0, weeks.length - 1))
  const week = weeks[safeWeekIndex] ?? []
  const dayName = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', { weekday: 'short', timeZone: 'UTC' })
  const dayNumber = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })

  useEffect(() => {
    // A new month starts at its first useful week instead of retaining an unrelated page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekIndex(firstWeekWithData)
  }, [firstWeekWithData, month.id])

  function moveWeek(direction: number) {
    setWeekIndex((current) => Math.max(0, Math.min(weeks.length - 1, current + direction)))
  }

  return (
    <section
      className="roadmap-schedule"
      aria-label={locale === 'es' ? `Agenda semanal de ${month.longLabel}` : `${month.longLabel} weekly schedule`}
      onTouchStart={(event) => { event.stopPropagation(); touchStartX.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={(event) => {
        event.stopPropagation()
        const endX = event.changedTouches[0]?.clientX
        if (touchStartX.current !== null && endX !== undefined && Math.abs(endX - touchStartX.current) > 45) moveWeek(endX < touchStartX.current ? 1 : -1)
        touchStartX.current = null
      }}
    >
      <header className="roadmap-schedule-header">
        <div><h2>{month.longLabel}</h2><p>{locale === 'es' ? 'Las actividades sin una hora programada aparecen en Todo el día.' : 'Activities without a scheduled time appear in All day.'}</p></div>
        <nav className="roadmap-week-navigation" aria-label={locale === 'es' ? 'Navegar semanas' : 'Navigate weeks'}>
          <button type="button" disabled={safeWeekIndex === 0} onClick={() => moveWeek(-1)} aria-label={locale === 'es' ? 'Semana anterior' : 'Previous week'}>‹</button>
          <span>{locale === 'es' ? 'Semana' : 'Week'} {safeWeekIndex + 1} / {weeks.length}</span>
          <button type="button" disabled={safeWeekIndex >= weeks.length - 1} onClick={() => moveWeek(1)} aria-label={locale === 'es' ? 'Semana siguiente' : 'Next week'}>›</button>
        </nav>
      </header>
      <div className="roadmap-week" role="grid">
        <div className="roadmap-week-corner" aria-hidden="true" />
        {week.map((day) => (
          <time key={`head-${day.date}`} className={day.inMonth ? 'roadmap-week-day-heading' : 'roadmap-week-day-heading is-outside'} dateTime={day.date}>
            <span>{dayName.format(new Date(`${day.date}T00:00:00Z`))}</span><strong>{dayNumber.format(new Date(`${day.date}T00:00:00Z`))}</strong>
          </time>
        ))}
        <div className="roadmap-week-all-day-label">{locale === 'es' ? 'Todo el día' : 'All day'}</div>
        {week.map((day) => (
          <ScheduleAllDayColumn key={`all-${day.date}`} day={day} locale={locale} onOpenActivity={onOpenActivity} />
        ))}
        <div className="roadmap-week-time-axis" aria-hidden="true">
          {[8, 10, 12, 14, 16, 18, 20].map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
        </div>
        {week.map((day) => (
          <div key={`hours-${day.date}`} className={day.inMonth ? 'roadmap-week-hours' : 'roadmap-week-hours is-outside'} aria-label={locale === 'es' ? `Horario del ${day.date}` : `Schedule for ${day.date}`}>
            {[8, 10, 12, 14, 16, 18].map((hour) => <span key={hour} aria-hidden="true" />)}
          </div>
        ))}
      </div>
    </section>
  )
}
