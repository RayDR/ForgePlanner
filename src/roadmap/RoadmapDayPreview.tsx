import { useEffect, useRef, useState } from 'react'
import type { Activity } from '../types/roadmap'
import { customColorClass } from '../ui/customColor'

interface RoadmapDayPreviewProps {
  date: string
  activities: Activity[]
  locale: 'es' | 'en'
  onOpenActivity: (activityId: string) => void
}

const VISIBLE_ROWS = 4

export function RoadmapDayPreview({ date, activities, locale, onOpenActivity }: RoadmapDayPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(0)
  const [below, setBelow] = useState(Math.max(0, activities.length - VISIBLE_ROWS))
  const dateLabel = new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

  function updateOverflow() {
    const element = scrollRef.current
    if (!element) return
    const row = element.firstElementChild as HTMLElement | null
    const rowHeight = row ? row.offsetHeight + 3 : 52
    const hiddenAbove = Math.max(0, Math.floor((element.scrollTop + 1) / rowHeight))
    setAbove(hiddenAbove)
    setBelow(Math.max(0, activities.length - hiddenAbove - VISIBLE_ROWS))
  }

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = 0
    // The selected date owns a new preview scroll position.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAbove(0)
    setBelow(Math.max(0, activities.length - VISIBLE_ROWS))
  }, [activities.length, date])

  function scroll(direction: number) {
    const element = scrollRef.current
    if (!element) return
    element.scrollBy({ top: direction * Math.max(52, element.clientHeight * 0.75), behavior: 'smooth' })
  }

  return (
    <aside className="roadmap-day-preview" aria-label={locale === 'es' ? `Actividades del ${dateLabel}` : `Activities for ${dateLabel}`}>
      <header>
        <strong>{dateLabel}</strong>
        <span>{activities.length} {locale === 'es' ? (activities.length === 1 ? 'actividad' : 'actividades') : (activities.length === 1 ? 'activity' : 'activities')}</span>
      </header>
      {above > 0 ? <button type="button" className="roadmap-day-preview-more" onClick={() => scroll(-1)}>↑ {above} {locale === 'es' ? 'más arriba' : 'more above'}</button> : null}
      <div ref={scrollRef} className="roadmap-day-preview-scroll" tabIndex={0} onScroll={updateOverflow}>
        {activities.map((activity) => (
          <button key={activity.id} type="button" onClick={() => onOpenActivity(activity.id)}>
            <i className={`roadmap-task-dot-${activity.colorKey} ${customColorClass(activity.colorHex)}`} />
            <span><strong>{activity.title}</strong><small>{activity.category}{activity.description ? ` · ${activity.description}` : ''}</small></span>
          </button>
        ))}
      </div>
      {below > 0 ? <button type="button" className="roadmap-day-preview-more" onClick={() => scroll(1)}>↓ {below} {locale === 'es' ? 'más abajo' : 'more below'}</button> : null}
    </aside>
  )
}
