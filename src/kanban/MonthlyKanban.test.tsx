import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Activity, ActivityStatusDefinition } from '../types/roadmap'
import { MonthlyKanban } from './MonthlyKanban'

const statuses: ActivityStatusDefinition[] = [
  { id: 'planned', label: 'Planned', colorKey: 'slate', order: 0, isDefault: true },
  { id: 'completed', label: 'Completed', colorKey: 'green', order: 1 },
]

const activity: Activity = {
  id: 'activity-1', title: 'Visible task', description: 'Kanban task', category: 'general', priority: 'medium', relationshipMode: 'independent', startDate: '2026-08-01', endDate: '2026-08-31', linkedActivityIds: [], dependencyIds: [], milestone: false, colorKey: 'blue', statusId: 'planned', notes: '', subtasks: [], comments: [], history: [], monthlyEntries: { '2026-08': { monthId: '2026-08', status: 'planned', progress: 0 } },
}

describe('MonthlyKanban', () => {
  it('renders monthly activities and a localized accessible name', () => {
    const markup = renderToStaticMarkup(<MonthlyKanban monthId="2026-08" activities={[activity]} statuses={statuses} locale="es" onOpen={vi.fn()} />)
    expect(markup).toContain('Kanban de 2026-08')
    expect(markup).toContain('Visible task')
    expect(markup).toContain('Planned')
  })
})
