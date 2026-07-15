import { useState } from 'react'
import type { Activity } from '../types/roadmap'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { Button } from './Button'

interface MonthlyActionMenuProps {
  activity: Activity
  monthId: string
  onOpen: (activityId: string) => void
}

export function MonthlyActionMenu({ activity, monthId, onOpen }: MonthlyActionMenuProps) {
  const continueActivityNextMonth = useRoadmapStore((state) => state.continueActivityNextMonth)
  const continueActivityInMonth = useRoadmapStore((state) => state.continueActivityInMonth)
  const skipActivityMonth = useRoadmapStore((state) => state.skipActivityMonth)
  const pauseActivityMonth = useRoadmapStore((state) => state.pauseActivityMonth)
  const resumeActivityInMonth = useRoadmapStore((state) => state.resumeActivityInMonth)
  const completeActivityMonth = useRoadmapStore((state) => state.completeActivityMonth)
  const cancelActivityMonth = useRoadmapStore((state) => state.cancelActivityMonth)
  const copyMonthlyStructure = useRoadmapStore((state) => state.copyMonthlyStructure)
  const addMonthlyEntry = useRoadmapStore((state) => state.addMonthlyEntry)
  const [targetMonthId, setTargetMonthId] = useState('')

  return (
    <details className="activity-actions-menu">
      <summary>Actions</summary>
      <div className="activity-actions-body">
        <div className="activity-actions-grid">
          <Button variant="ghost" onClick={() => onOpen(activity.id)}>Open details</Button>
          <Button variant="ghost" onClick={() => continueActivityNextMonth(activity.id, monthId)}>Continue next month</Button>
          <Button variant="ghost" onClick={() => skipActivityMonth(activity.id, monthId, targetMonthId || undefined)}>Skip this month</Button>
          <Button variant="ghost" onClick={() => pauseActivityMonth(activity.id, monthId)}>Pause</Button>
          <Button variant="ghost" onClick={() => completeActivityMonth(activity.id, monthId)}>Complete</Button>
          <Button variant="ghost" onClick={() => cancelActivityMonth(activity.id, monthId)}>Cancel</Button>
        </div>
        <div className="activity-actions-target">
          <input
            className="field-input"
            placeholder="YYYY-MM"
            value={targetMonthId}
            onChange={(event) => setTargetMonthId(event.target.value)}
          />
          <div className="activity-actions-grid">
            <Button variant="secondary" onClick={() => targetMonthId && continueActivityInMonth(activity.id, monthId, targetMonthId)}>
              Continue in...
            </Button>
            <Button variant="secondary" onClick={() => targetMonthId && resumeActivityInMonth(activity.id, monthId, targetMonthId)}>
              Resume in...
            </Button>
            <Button variant="secondary" onClick={() => targetMonthId && copyMonthlyStructure(activity.id, monthId, targetMonthId)}>
              Copy monthly structure
            </Button>
            <Button variant="secondary" onClick={() => targetMonthId && addMonthlyEntry(activity.id, targetMonthId, 'planned')}>
              Add monthly instance
            </Button>
          </div>
        </div>
      </div>
    </details>
  )
}