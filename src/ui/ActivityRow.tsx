import type { Activity } from '../types/roadmap'
import {
  getActivityGlobalProgress,
  getActivityGlobalStatus,
  getActivityProgressForMonth,
  getActivityStatusForMonth,
} from '../utils/roadmapModel'
import { CategoryPill } from './CategoryPill'
import { MonthlyActionMenu } from './MonthlyActionMenu'
import { StatusPill } from './StatusPill'

interface ActivityRowProps {
  activity: Activity
  monthId?: string
  onOpen: (activityId: string) => void
}

export function ActivityRow({ activity, monthId, onOpen }: ActivityRowProps) {
  const status = monthId ? getActivityStatusForMonth(activity, monthId) ?? getActivityGlobalStatus(activity) : getActivityGlobalStatus(activity)
  const monthProgress = monthId ? getActivityProgressForMonth(activity, monthId) : 0
  const globalProgress = getActivityGlobalProgress(activity)

  return (
    <article className="activity-row activity-card">
      <div className="activity-row-main">
        <div className="activity-row-title-wrap">
          <button className="activity-row-title" onClick={() => onOpen(activity.id)}>
            {activity.title}
          </button>
        </div>
        <p className="activity-row-copy">{activity.description}</p>
        <div className="activity-row-meta">
          <CategoryPill category={activity.category} />
          <StatusPill status={status} />
          {activity.dependencyIds.length ? <span className="badge badge-slate">dep {activity.dependencyIds.length}</span> : null}
          {activity.linkedActivityIds.length ? <span className="badge badge-slate">link {activity.linkedActivityIds.length}</span> : null}
          {activity.milestone ? <span className="badge badge-amber">milestone</span> : null}
        </div>
      </div>
      <div className="activity-row-side">
        <div className="activity-progress-copy">
          {monthId ? <span>Month {monthProgress}%</span> : null}
          <span>Global {globalProgress}%</span>
          <span>
            {activity.subtasks.filter((subtask) => subtask.completed).length}/{activity.subtasks.length} subtasks
          </span>
        </div>
        {monthId ? <MonthlyActionMenu activity={activity} monthId={monthId} onOpen={onOpen} /> : null}
      </div>
    </article>
  )
}