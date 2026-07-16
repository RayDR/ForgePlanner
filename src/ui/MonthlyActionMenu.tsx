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
  const locale = useRoadmapStore((state) => state.locale)
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
  const t = locale === 'es'
    ? { actions: 'Acciones', open: 'Abrir detalles', next: 'Continuar el próximo mes', skip: 'Omitir este mes', pause: 'Pausar', complete: 'Completar', cancel: 'Cancelar', continueIn: 'Continuar en…', resumeIn: 'Reanudar en…', copy: 'Copiar estructura mensual', add: 'Agregar instancia mensual' }
    : { actions: 'Actions', open: 'Open details', next: 'Continue next month', skip: 'Skip this month', pause: 'Pause', complete: 'Complete', cancel: 'Cancel', continueIn: 'Continue in…', resumeIn: 'Resume in…', copy: 'Copy monthly structure', add: 'Add monthly instance' }

  return (
    <details className="activity-actions-menu">
      <summary>{t.actions}</summary>
      <div className="activity-actions-body">
        <div className="activity-actions-grid">
          <Button variant="ghost" onClick={() => onOpen(activity.id)}>{t.open}</Button>
          <Button variant="ghost" onClick={() => continueActivityNextMonth(activity.id, monthId)}>{t.next}</Button>
          <Button variant="ghost" onClick={() => skipActivityMonth(activity.id, monthId, targetMonthId || undefined)}>{t.skip}</Button>
          <Button variant="ghost" onClick={() => pauseActivityMonth(activity.id, monthId)}>{t.pause}</Button>
          <Button variant="ghost" onClick={() => completeActivityMonth(activity.id, monthId)}>{t.complete}</Button>
          <Button variant="ghost" onClick={() => cancelActivityMonth(activity.id, monthId)}>{t.cancel}</Button>
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
              {t.continueIn}
            </Button>
            <Button variant="secondary" onClick={() => targetMonthId && resumeActivityInMonth(activity.id, monthId, targetMonthId)}>
              {t.resumeIn}
            </Button>
            <Button variant="secondary" onClick={() => targetMonthId && copyMonthlyStructure(activity.id, monthId, targetMonthId)}>
              {t.copy}
            </Button>
            <Button variant="secondary" onClick={() => targetMonthId && addMonthlyEntry(activity.id, targetMonthId, 'planned')}>
              {t.add}
            </Button>
          </div>
        </div>
      </div>
    </details>
  )
}
