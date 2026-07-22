import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Activity, MonthBucket } from '../types/roadmap'
import { RoadmapSchedule } from './RoadmapSchedule'

const month: MonthBucket = { id: '2026-08', year: 2026, monthIndex: 7, shortLabel: 'ago', longLabel: 'agosto de 2026', startDate: '2026-08-01', endDate: '2026-08-31', active: true }
const activity: Activity = { id: 'task-1', title: 'Preparar entrega', description: '', category: 'work', priority: 'medium', relationshipMode: 'independent', startDate: '2026-08-03', endDate: '2026-08-03', estimatedHours: 3, linkedActivityIds: [], dependencyIds: [], milestone: false, colorKey: 'blue', statusId: 'planned', notes: '', subtasks: [], comments: [], history: [], monthlyEntries: { '2026-08': { monthId: '2026-08', status: 'planned', progress: 0 } } }

describe('RoadmapSchedule', () => {
  it('shows unscheduled tasks in the all-day area without inventing a start time', () => {
    const markup = renderToStaticMarkup(<RoadmapSchedule month={month} activities={[activity]} locale="es" onOpenActivity={vi.fn()} />)
    expect(markup).toContain('Preparar entrega')
    expect(markup).toContain('3 h · sin hora fija')
    expect(markup).toContain('Todo el día')
    expect(markup).toContain('Agenda semanal de agosto de 2026')
    expect(markup).toContain('Semana 2 / 6')
  })
})
