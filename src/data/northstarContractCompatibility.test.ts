import { describe, expect, it } from 'vitest'
import { CURRENT_PLAN_SCHEMA_VERSION, PLANNER_CONTRACT_VERSION, migrateToLatest, parsePlanDocument, safeValidateCanonicalPlan } from '../../shared/plan-contract/index.js'
import { northstarActivities, northstarProject, northstarRelationships } from './northstarMockData'

describe('Project NorthStar exported-plan compatibility', () => {
  it('migrates the representative Canada plan with custom statuses, dependencies, savings and bilingual content', () => {
    const activities = northstarActivities.map((activity, index) => index === 0 ? {
      ...activity,
      title: `${activity.title} / Preparar documentación`,
      comments: [...activity.comments, { id: 'comentario-migracion', author: 'Usuario', message: 'Revisar evidencia en español.', createdAt: '2026-08-01T00:00:00.000Z' }],
    } : activity)
    const legacyStatuses = [
      ...northstarProject.statusDefinitions.map((status) => ({ id: status.id, label: status.label, colorKey: status.colorKey, order: status.order, isDefault: status.id === 'planned' })),
      { id: 'review', label: 'Review / Revisión', colorKey: 'amber' as const, order: 5, isDefault: true },
    ]
    const legacy = {
      schemaVersion: 7,
      project: { ...northstarProject, selectedYear: 2026, statusDefinitions: legacyStatuses },
      activities,
      trash: [],
      relationships: northstarRelationships,
      selectedYear: 2026,
      selectedMonthId: '2026-08',
      locale: 'es' as const,
      theme: 'dark' as const,
      _forge: { planningMode: 'annual' as const, templateKey: 'immigration-plan' as const, monthlyViewPreference: 'list' as const },
    }

    const result = parsePlanDocument(legacy)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.plan.schemaVersion).toBe(CURRENT_PLAN_SCHEMA_VERSION)
    expect(result.plan.metadata.plannerContractVersion).toBe(PLANNER_CONTRACT_VERSION)
    expect(result.plan.project.statusDefinitions.find((status) => status.id === 'review')).toMatchObject({ isDefault: true })
    expect(result.plan.project.statusDefinitions.find((status) => status.id === 'review')).not.toHaveProperty('isSystem')
    expect(result.plan.activities.some((activity) => activity.dependencyIds.length > 0)).toBe(true)
    expect(result.plan.relationships.some((relationship) => relationship.type === 'dependency')).toBe(true)
    expect(result.plan.project.savingsPlan.monthlyEntries.length).toBeGreaterThan(0)
    expect(result.plan.activities[0].comments.at(-1)?.message).toContain('español')
    expect(result.extractedUiState).toMatchObject({ selectedYear: 2026, selectedMonthId: '2026-08', locale: 'es', theme: 'dark', monthlyViewPreference: 'list' })
    expect(safeValidateCanonicalPlan(result.plan).success).toBe(true)
    expect(migrateToLatest(JSON.parse(JSON.stringify(result.plan)))).toEqual(result.plan)
    expect(migrateToLatest(migrateToLatest(legacy))).toEqual(result.plan)
  })
})
