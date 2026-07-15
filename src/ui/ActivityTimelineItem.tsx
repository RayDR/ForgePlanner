import type { Activity } from '../types/roadmap'
import { getActivityGlobalProgress, getActivityProgressForMonth, getActivityStatusForMonth } from '../utils/roadmapModel'
import { CategoryPill } from './CategoryPill'
import { MonthlyActionMenu } from './MonthlyActionMenu'
import { StatusPill } from './StatusPill'

interface ActivityTimelineItemProps {
  activity: Activity
  monthId: string
  onSelect: (activityId: string) => void
}

export function ActivityTimelineItem({ activity, monthId, onSelect }: ActivityTimelineItemProps) {
  const monthStatus = getActivityStatusForMonth(activity, monthId) ?? 'planned'
  const monthProgress = getActivityProgressForMonth(activity, monthId)
  const globalProgress = getActivityGlobalProgress(activity)

  return (
    <article className="timeline-item">
      <header>
        <button className="timeline-item-title" onClick={() => onSelect(activity.id)}>
          {activity.title}
        </button>
        <div className="timeline-item-badges">
          <CategoryPill category={activity.category} />
          <StatusPill status={monthStatus} />
        </div>
      </header>
      <p>{activity.description}</p>
      <div className="row-wrap">
        <span className="muted">Month progress {monthProgress}%</span>
        <span className="muted">Global progress {globalProgress}%</span>
      </div>
      <MonthlyActionMenu activity={activity} monthId={monthId} onOpen={onSelect} />
    </article>
  )
}