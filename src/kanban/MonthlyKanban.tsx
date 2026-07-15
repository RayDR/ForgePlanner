import type { Activity, ActivityStatusDefinition } from '../types/roadmap'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { StepForwardIcon } from '../ui/icons'

interface MonthlyKanbanProps {
  monthId: string
  activities: Activity[]
  statuses: ActivityStatusDefinition[]
  onOpen: (activityId: string) => void
}

export function MonthlyKanban({ monthId, activities, statuses, onOpen }: MonthlyKanbanProps) {
  const setActivityStatus = useRoadmapStore((state) => state.setActivityStatus)
  const orderedStatuses = [...statuses].sort((left, right) => left.order - right.order)
  const fallbackStatusId = orderedStatuses[0]?.id ?? 'planned'
  const byStatus = new Map(orderedStatuses.map((status) => [status.id, [] as Activity[]]))

  for (const activity of activities) {
    const statusId = byStatus.has(activity.statusId) ? activity.statusId : fallbackStatusId
    const lane = byStatus.get(statusId)

    if (lane) {
      lane.push(activity)
    }
  }

  return (
    <section className="kanban-scroll" aria-label={`Kanban for ${monthId}`}>
      <div className="kanban-board">
        {orderedStatuses.map((status, index) => {
          const laneItems = byStatus.get(status.id) ?? []
          const nextStatusId = orderedStatuses[index + 1]?.id ?? null

          return (
            <article key={status.id} className="kanban-lane">
              <header className="kanban-lane-head">
                <span className={`badge badge-${status.colorKey}`}>{status.label}</span>
                <span className="month-tab-count">{laneItems.length}</span>
              </header>

              <div className="lane-body">
                {laneItems.map((activity) => (
                  <article key={activity.id} className="kanban-card">
                    <button className="activity-row-title" onClick={() => onOpen(activity.id)}>
                      {activity.title}
                    </button>
                    <p className="activity-row-copy">{activity.description}</p>
                    <div className="row-between">
                      <span className="muted">{activity.monthlyEntries[monthId]?.progress ?? 0}%</span>
                      {nextStatusId ? (
                        <button
                          className="status-step-btn"
                          aria-label={`Move ${activity.title} to next status`}
                          onClick={() => setActivityStatus(activity.id, nextStatusId)}
                        >
                          <StepForwardIcon width={14} height={14} />
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
