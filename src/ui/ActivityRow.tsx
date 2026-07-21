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
import { useRoadmapStore } from '../hooks/useRoadmapStore'

interface ActivityRowProps {
  activity: Activity
  monthId?: string
  onOpen: (activityId: string) => void
}

export function ActivityRow({ activity, monthId, onOpen }: ActivityRowProps) {
  const locale = useRoadmapStore((state) => state.locale)
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
          {activity.dependencyIds.length ? <span className="badge badge-slate">{locale === 'es' ? 'dep.' : 'dep.'} {activity.dependencyIds.length}</span> : null}
          {activity.linkedActivityIds.length ? <span className="badge badge-slate">{locale === 'es' ? 'vínc.' : 'link'} {activity.linkedActivityIds.length}</span> : null}
          {activity.milestone ? <span className="badge badge-amber">{locale === 'es' ? 'hito' : 'milestone'}</span> : null}
        </div>
      </div>
      <div className="activity-row-side">
        <div className="activity-progress-copy">
          {monthId ? <span>{locale === 'es' ? 'Mes' : 'Month'} {monthProgress}%</span> : null}
          <span>{locale === 'es' ? 'Global' : 'Global'} {globalProgress}%</span>
          <span>
            {activity.subtasks.filter((subtask) => subtask.completed).length}/{activity.subtasks.length} {locale === 'es' ? 'subtareas' : 'subtasks'}
          </span>
        </div>
        {monthId ? <MonthlyActionMenu activity={activity} monthId={monthId} onOpen={onOpen} /> : null}
      </div>
    </article>
  )
}
