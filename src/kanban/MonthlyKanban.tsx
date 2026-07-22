import { useState } from 'react'
import type { ReactNode } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { Activity, ActivityStatusDefinition } from '../types/roadmap'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { StepForwardIcon } from '../ui/icons'
import { getCalculatedActivityProgress } from '../utils/roadmapModel'

interface MonthlyKanbanProps {
  monthId: string
  activities: Activity[]
  statuses: ActivityStatusDefinition[]
  locale: 'es' | 'en'
  onOpen: (activityId: string) => void
}

function KanbanCardContent({ activity, locale, nextStatusId, onOpen, onAdvance }: { activity: Activity; locale: 'es' | 'en'; nextStatusId: string | null; onOpen: () => void; onAdvance: () => void }) {
  return <>
    <button className="activity-row-title" onClick={onOpen}>{activity.title}</button>
    <p className="activity-row-copy">{activity.description}</p>
    <div className="row-between"><span className="muted">{getCalculatedActivityProgress(activity)}%</span>{nextStatusId ? <button className="status-step-btn" aria-label={locale === 'es' ? `Mover ${activity.title} al siguiente estado` : `Move ${activity.title} to next status`} onClick={onAdvance}><StepForwardIcon width={14} height={14} /></button> : null}</div>
  </>
}

function DraggableKanbanCard({ activity, locale, nextStatusId, onOpen, onAdvance }: { activity: Activity; locale: 'es' | 'en'; nextStatusId: string | null; onOpen: () => void; onAdvance: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: activity.id })
  return <article ref={setNodeRef} className={isDragging ? 'kanban-card is-dragging' : 'kanban-card'} {...listeners} {...attributes}><KanbanCardContent activity={activity} locale={locale} nextStatusId={nextStatusId} onOpen={onOpen} onAdvance={onAdvance} /></article>
}

function KanbanLane({ status, children }: { status: ActivityStatusDefinition; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${status.id}` })
  return <article ref={setNodeRef} className={isOver ? 'kanban-lane is-drop-target' : 'kanban-lane'}>{children}</article>
}

export function MonthlyKanban({ monthId, activities, statuses, locale, onOpen }: MonthlyKanbanProps) {
  const setActivityStatus = useRoadmapStore((state) => state.setActivityStatus)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const orderedStatuses = [...statuses].sort((left, right) => left.order - right.order)
  const fallbackStatusId = orderedStatuses[0]?.id ?? 'planned'
  const byStatus = new Map(orderedStatuses.map((status) => [status.id, [] as Activity[]]))
  for (const activity of activities) byStatus.get(byStatus.has(activity.statusId) ? activity.statusId : fallbackStatusId)?.push(activity)
  const activeActivity = activities.find((activity) => activity.id === activeId) ?? null

  function handleDragEnd(event: DragEndEvent) {
    const target = String(event.over?.id ?? '')
    const statusId = target.startsWith('lane:') ? target.slice(5) : ''
    if (statusId && statuses.some((status) => status.id === statusId)) setActivityStatus(String(event.active.id), statusId)
    setActiveId(null)
  }

  return (
    <section className="kanban-scroll monthly-kanban" aria-label={locale === 'es' ? `Kanban de ${monthId}` : `Kanban for ${monthId}`}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {orderedStatuses.map((status, index) => {
            const laneItems = byStatus.get(status.id) ?? []
            const nextStatusId = orderedStatuses[index + 1]?.id ?? null
            return <KanbanLane key={status.id} status={status}>
              <header className="kanban-lane-head"><span className={`badge badge-${status.colorKey}`}>{status.label}</span><span className="month-tab-count">{laneItems.length}</span></header>
              <div className="lane-body">{laneItems.map((activity) => <DraggableKanbanCard key={activity.id} activity={activity} locale={locale} nextStatusId={nextStatusId} onOpen={() => onOpen(activity.id)} onAdvance={() => nextStatusId && setActivityStatus(activity.id, nextStatusId)} />)}</div>
            </KanbanLane>
          })}
        </div>
        <DragOverlay>{activeActivity ? <article className="kanban-card kanban-card-overlay"><KanbanCardContent activity={activeActivity} locale={locale} nextStatusId={null} onOpen={() => undefined} onAdvance={() => undefined} /></article> : null}</DragOverlay>
      </DndContext>
    </section>
  )
}
