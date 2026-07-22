import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Activity } from '../types/roadmap'
import { RoadmapDayPreview } from './RoadmapDayPreview'

function activity(index: number): Activity {
  return {
    id: `task-${index}`, title: `Tarea ${index}`, description: '', category: 'work', priority: 'medium', relationshipMode: 'independent',
    startDate: '2026-08-03', endDate: '2026-08-03', linkedActivityIds: [], dependencyIds: [], milestone: false, colorKey: 'blue',
    statusId: 'planned', notes: '', subtasks: [], comments: [], history: [], monthlyEntries: { '2026-08': { monthId: '2026-08', status: 'planned', progress: 0 } },
  }
}

describe('RoadmapDayPreview', () => {
  it('identifies the selected date and keeps all tasks in an internally scrollable list', () => {
    const markup = renderToStaticMarkup(<RoadmapDayPreview date="2026-08-03" activities={[1, 2, 3, 4, 5, 6].map(activity)} locale="es" onOpenActivity={vi.fn()} />)
    expect(markup).toContain('lunes, 3 de agosto de 2026')
    expect(markup).toContain('6 actividades')
    expect(markup).toContain('roadmap-day-preview-scroll')
    expect(markup).toContain('Tarea 6')
    expect(markup).toContain('2 más abajo')
  })
})
