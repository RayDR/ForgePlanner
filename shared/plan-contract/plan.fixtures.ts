import { CURRENT_PLAN_SCHEMA_VERSION, PLANNER_CONTRACT_VERSION } from './plan.constants.js'
import type { CanonicalPlan } from './plan.types.js'

export function createCanonicalPlanFixture(overrides: Partial<CanonicalPlan> = {}): CanonicalPlan {
  const base: CanonicalPlan = {
    schemaVersion: CURRENT_PLAN_SCHEMA_VERSION,
    metadata: { origin: 'manual', planningMode: 'annual', contentLanguage: 'en', plannerContractVersion: PLANNER_CONTRACT_VERSION },
    project: {
      id: 'project-fixture', name: 'Fixture plan', objective: 'Validate the canonical NorthStar contract.', startDate: '2026-01-01', plannedStartDate: '2026-01-01', endDate: '2026-12-31', plannedEndDate: '2026-12-31', actualEndDate: '2026-12-31',
      goals: [{ id: 'goal-main', title: 'Main goal', description: 'Complete the plan.', targetDate: '2026-12-31', category: 'general' }],
      milestones: [{ id: 'milestone-main', title: 'First delivery', monthId: '2026-06', category: 'general', activityId: 'activity-main' }],
      statusDefinitions: [{ id: 'planned', label: 'Planned', colorKey: 'slate', order: 0, isSystem: true, isDefault: true }, { id: 'done', label: 'Done', colorKey: 'green', order: 1, isSystem: true }],
      categoryDefinitions: [{ key: 'general', label: 'General', tone: 'slate', isDefault: true }],
      savingsPlan: { currency: 'USD', enabled: false, mode: 'free', targetTotal: 0, monthlyEntries: [] },
    },
    activities: [{ id: 'activity-main', title: 'First activity', description: 'A valid activity.', category: 'general', sequenceNumber: 1, priority: 'medium', relationshipMode: 'independent', startDate: '2026-01-01', endDate: '2026-01-31', linkedActivityIds: [], dependencyIds: [], milestone: false, colorKey: 'slate', statusId: 'planned', progressMode: 'completion', notes: '', subtasks: [], comments: [], history: [{ id: 'history-main', activityId: 'activity-main', type: 'created', message: 'Activity created.', occurredAt: '2026-01-01T00:00:00.000Z' }], monthlyEntries: { '2026-01': { monthId: '2026-01', status: 'planned', progress: 0 } } }],
    trash: [], relationships: [], summary: 'A compact valid plan.', assumptions: [], constraints: [], warnings: [], tags: ['fixture'], estimatedHoursPerWeek: 5, difficulty: 'light',
  }
  return { ...base, ...overrides, metadata: overrides.metadata ?? base.metadata, project: overrides.project ?? base.project, activities: overrides.activities ?? base.activities, trash: overrides.trash ?? base.trash, relationships: overrides.relationships ?? base.relationships }
}
