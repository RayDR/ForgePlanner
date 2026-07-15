import { describe, expect, it } from 'vitest'
import type { Activity, Project } from '../types/roadmap'
import { contractProjectTimelineAfterRemoval, inferPlannedStartDate } from './projectTimeline'

function activity(monthId: string): Activity {
  return { monthlyEntries: { [monthId]: { monthId, status: 'planned', progress: 0 } } } as Activity
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    startDate: '2026-02-01',
    endDate: '2028-07-31',
    plannedEndDate: '2028-07-31',
    savingsPlan: { currency: 'USD', enabled: false, targetTotal: 0, monthlyEntries: [] },
    ...overrides,
  } as Project
}

describe('contractProjectTimelineAfterRemoval', () => {
  it('removes a stale expanded start month from legacy plans', () => {
    expect(contractProjectTimelineAfterRemoval(project(), [activity('2026-08')]).startDate).toBe('2026-08-01')
  })

  it('preserves an explicitly configured planned start', () => {
    expect(contractProjectTimelineAfterRemoval(
      project({ plannedStartDate: '2026-01-01' }),
      [activity('2026-08')],
    ).startDate).toBe('2026-01-01')
  })

  it('keeps the current window when no dated information remains', () => {
    expect(contractProjectTimelineAfterRemoval(project(), []).startDate).toBe('2026-02-01')
  })

  it('migrates a legacy expanded start to its first remaining activity month', () => {
    expect(inferPlannedStartDate(project(), [activity('2026-08')])).toBe('2026-08-01')
  })
})
