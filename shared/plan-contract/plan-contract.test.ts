import { describe, expect, it } from 'vitest'
import { canonicalPlanJsonSchema, canonicalPlanSchema, createCanonicalPlanFixture, migrateToLatest, parsePlanDocument, safeValidateCanonicalPlan, validatePlanSemantics } from './index.js'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function v7Fixture(version = 7) {
  const current = createCanonicalPlanFixture()
  const statuses = current.project.statusDefinitions.map((status) => ({ id: status.id, label: status.label, colorKey: status.colorKey, order: status.order, ...(status.isDefault ? { isDefault: true } : {}) }))
  return { schemaVersion: version, project: { ...current.project, selectedYear: 2026, statusDefinitions: statuses }, activities: current.activities, trash: current.trash, relationships: current.relationships, selectedYear: 2026, selectedMonthId: '2026-01', locale: 'en', theme: 'dark', _forge: { planningMode: 'annual', templateKey: 'career-roadmap', categories: ['general'], monthlyViewPreference: 'kanban' } }
}

describe('canonical NorthStar plan contract', () => {
  it('accepts minimal, full and multilingual visible content', () => {
    expect(safeValidateCanonicalPlan(createCanonicalPlanFixture()).success).toBe(true)
    const mixed = createCanonicalPlanFixture({ summary: 'Plan de career growth', metadata: { ...createCanonicalPlanFixture().metadata, contentLanguage: 'mixed' } })
    expect(safeValidateCanonicalPlan(mixed).success).toBe(true)
  })
  it('accepts portable savings, subtasks, comments and history', () => {
    const base = createCanonicalPlanFixture()
    const full = createCanonicalPlanFixture({
      metadata: { ...base.metadata, contentLanguage: 'es' },
      project: { ...base.project, name: 'Plan de ahorro', savingsPlan: { currency: 'CAD', enabled: true, mode: 'monthly-target', defaultMonthlyTarget: 300, targetTotal: 300, monthlyEntries: [{ monthId: '2026-01', target: 300, actual: 125, notes: 'Primer aporte', updatedAt: '2026-01-15T00:00:00.000Z' }] } },
      activities: [{ ...base.activities[0], title: 'Preparar evidencia', subtasks: [{ id: 'subtask-one', title: 'Guardar recibo', completed: true, weight: 2 }], comments: [{ id: 'comment-one', author: 'Usuario', message: 'Documento agregado.', createdAt: '2026-01-15T00:00:00.000Z' }] }],
    })
    expect(safeValidateCanonicalPlan(full).success).toBe(true)
  })
  it('rejects unknown and protected root properties', () => {
    for (const injected of [{ syncState: 'synced' }, { ownerUserId: 'someone' }, { sharingEnabled: true }, { prompt: 'hidden' }, { learningProfile: {} }]) expect(safeValidateCanonicalPlan({ ...createCanonicalPlanFixture(), ...injected }).success).toBe(false)
  })
  it('bounds intelligence-ready fields', () => {
    expect(safeValidateCanonicalPlan(createCanonicalPlanFixture({ summary: 'x'.repeat(4_001) })).success).toBe(false)
    expect(safeValidateCanonicalPlan(createCanonicalPlanFixture({ estimatedHoursPerWeek: 169 })).success).toBe(false)
    expect(safeValidateCanonicalPlan(createCanonicalPlanFixture({ difficulty: 'impossible' as 'light' })).success).toBe(false)
    expect(safeValidateCanonicalPlan(createCanonicalPlanFixture({ constraints: [{ id: 'c-1', type: 'budget', description: 'Maximum budget', isNonNegotiable: true }], warnings: [{ id: 'w-1', code: 'BUDGET_LIMIT', message: 'Review budget.', severity: 'warning' }] })).success).toBe(true)
  })
  it('validates references, duplicates, self references and dependency cycles', () => {
    const base = createCanonicalPlanFixture(); const second = { ...base.activities[0], id: 'activity-second', title: 'Second', history: [], monthlyEntries: {}, dependencyIds: ['activity-main'] }
    expect(validatePlanSemantics({ ...base, activities: [base.activities[0], second] })).toEqual([])
    const cycle = { ...base, activities: [{ ...base.activities[0], dependencyIds: ['activity-second'] }, second] }
    expect(validatePlanSemantics(cycle).some((item) => item.code === 'DEPENDENCY_CYCLE')).toBe(true)
    expect(validatePlanSemantics({ ...base, activities: [{ ...base.activities[0], dependencyIds: ['activity-main'] }] }).some((item) => item.code === 'SELF_ACTIVITY_REFERENCE')).toBe(true)
    expect(validatePlanSemantics({ ...base, activities: [base.activities[0], { ...base.activities[0] }] }).some((item) => item.code === 'DUPLICATE_ACTIVITY_ID')).toBe(true)
  })
  it('validates relationship semantics without treating links as dependency cycles', () => {
    const base = createCanonicalPlanFixture(); const second = { ...base.activities[0], id: 'activity-second', title: 'Second', linkedActivityIds: ['activity-main'], history: [], monthlyEntries: {} }
    const linked = { ...base, activities: [base.activities[0], second], relationships: [{ id: 'rel-link', sourceActivityId: 'activity-main', targetActivityId: 'activity-second', type: 'linked' as const, relationshipMode: 'soft-linked' as const }] }
    expect(validatePlanSemantics(linked)).toEqual([])
    expect(validatePlanSemantics({ ...linked, relationships: [...linked.relationships, linked.relationships[0]] }).some((item) => item.code === 'DUPLICATE_RELATIONSHIP')).toBe(true)
    expect(validatePlanSemantics({ ...base, relationships: [{ id: 'rel-bad', sourceActivityId: 'missing', targetActivityId: 'activity-main', type: 'linked', relationshipMode: 'soft-linked' }] }).some((item) => item.code === 'UNKNOWN_ACTIVITY_REFERENCE')).toBe(true)
    const contradiction = { ...base, activities: [{ ...base.activities[0], dependencyIds: ['activity-second'] }, second], relationships: [{ id: 'rel-reverse', sourceActivityId: 'activity-main', targetActivityId: 'activity-second', type: 'dependency' as const, relationshipMode: 'independent' as const }] }
    expect(validatePlanSemantics(contradiction).some((item) => item.code === 'DEPENDENCY_CYCLE')).toBe(true)
  })
  it('rejects invalid dates, status/category references and monthly key mismatches', () => {
    const base = createCanonicalPlanFixture()
    expect(safeValidateCanonicalPlan({ ...base, project: { ...base.project, endDate: '2025-01-01' } }).success).toBe(false)
    expect(safeValidateCanonicalPlan({ ...base, activities: [{ ...base.activities[0], statusId: 'missing' }] }).success).toBe(false)
    expect(safeValidateCanonicalPlan({ ...base, activities: [{ ...base.activities[0], monthlyEntries: { '2026-01': { monthId: '2026-02', status: 'planned', progress: 0 } } }] }).success).toBe(false)
  })
  it('migrates v7 without mutation and extracts UI-only _forge values', () => {
    const input = v7Fixture(); const before = clone(input); const result = parsePlanDocument(input)
    expect(input).toEqual(before); expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.plan.schemaVersion).toBe(8); expect(result.plan.metadata.planningMode).toBe('annual'); expect(result.plan.metadata.templateKey).toBe('career-roadmap')
    expect(result.plan).not.toHaveProperty('_forge'); expect(result.plan).not.toHaveProperty('selectedYear'); expect(result.extractedUiState?.monthlyViewPreference).toBe('kanban')
    expect(result.issues.some((item) => item.code === 'UI_FIELD_EXTRACTED')).toBe(true)
    expect(result.plan.project.statusDefinitions.every((item) => item.isSystem)).toBe(true)
    expect(result.plan.project.statusDefinitions.filter((item) => item.isDefault).map((item) => item.id)).toEqual(['planned'])
  })
  it('separates built-in status identity from the configurable default status', () => {
    const input = v7Fixture()
    input.project.statusDefinitions.push({ id: 'review', label: 'Review', colorKey: 'amber', order: 2, isDefault: true })
    const result = parsePlanDocument(input)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.plan.project.statusDefinitions.find((item) => item.id === 'review')).toMatchObject({ isDefault: true })
    expect(result.plan.project.statusDefinitions.find((item) => item.id === 'review')).not.toHaveProperty('isSystem')
    expect(result.plan.project.statusDefinitions.find((item) => item.id === 'planned')).toMatchObject({ isSystem: true })
    expect(result.plan.project.statusDefinitions.find((item) => item.id === 'planned')).not.toHaveProperty('isDefault')
  })
  it('accepts recognizable mislabeled versions and rejects unrecognized or future versions', () => {
    const recognized = parsePlanDocument(v7Fixture(5)); expect(recognized.success).toBe(true); if (recognized.success) expect(recognized.issues.some((item) => item.code === 'MISLABELED_LEGACY_VERSION')).toBe(true)
    expect(parsePlanDocument({ schemaVersion: 5, unexpected: true }).success).toBe(false)
    expect(parsePlanDocument({ ...createCanonicalPlanFixture(), schemaVersion: 99 }).success).toBe(false)
  })
  it('migrates the recognized unversioned monthlyPlans format', () => {
    const legacy = {
      project: { id: 'legacy-project', name: 'Plan legado', objective: 'Migrar sin pérdida.', startDate: '2026-01-01', endDate: '2026-12-31', selectedYear: 2026, goals: [], milestones: [], savingsPlan: [] },
      activities: [{ id: 'legacy-activity', title: 'Actividad', description: '', category: 'general', status: 'not-started', priority: 'medium', relationshipMode: 'independent', startDate: '2026-01-01', endDate: '2026-02-28', targetMonth: '2026-01', linkedActivityIds: [], dependencyIds: [], milestone: false, notes: '', subtasks: [], comments: [], monthlyPlans: { '2026-01': { monthId: '2026-01', progress: 0, status: 'not-started', isDeferred: false } }, moveHistory: [{ id: 'move-one', fromMonthId: '2026-01', toMonthId: '2026-02', movedAt: '2026-01-20T00:00:00.000Z', reason: 'Reprogramada' }] }],
      relationships: [], selectedYear: 2026, selectedMonthId: '2026-01', locale: 'es', theme: 'dark',
    }
    const before = clone(legacy); const result = parsePlanDocument(legacy)
    expect(legacy).toEqual(before); expect(result.success).toBe(true)
    if (result.success) {
      expect(result.detectedVersion).toBe('legacy')
      expect(result.plan.activities[0].monthlyEntries['2026-01']).toMatchObject({ status: 'skipped', isSkipped: true })
      expect(result.plan.activities[0].monthlyEntries['2026-02']).toMatchObject({ status: 'continued', continuedFromMonthId: '2026-01', notes: 'Reprogramada' })
      expect(result.plan.activities[0].history.some((entry) => entry.id === 'move-one')).toBe(true)
      expect(result.plan.metadata.origin).toBe('import')
    }
  })
  it('exports a strict JSON Schema with no arbitrary root properties', () => {
    expect(canonicalPlanJsonSchema.type).toBe('object')
    expect(canonicalPlanJsonSchema.additionalProperties).toBe(false)
    expect(canonicalPlanJsonSchema.required).toContain('metadata')
    expect(canonicalPlanSchema.safeParse({ ...createCanonicalPlanFixture(), arbitrary: true }).success).toBe(false)
  })
  it('accepts optional exact colors while preserving schema version 8', () => {
    const plan = createCanonicalPlanFixture()
    plan.project.categoryDefinitions[0].colorHex = '#123abc'
    plan.activities[0].colorHex = '#fedcba'
    const result = safeValidateCanonicalPlan(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.plan.schemaVersion).toBe(8)
      expect(result.plan.activities[0].colorHex).toBe('#fedcba')
    }
  })
  it('round trips canonical JSON without identity or operation metadata', () => {
    const exported = JSON.stringify(createCanonicalPlanFixture()); const imported = parsePlanDocument(JSON.parse(exported))
    expect(imported.success).toBe(true); if (!imported.success) return
    expect(imported.plan).toEqual(createCanonicalPlanFixture()); expect(exported).not.toMatch(/ownerUserId|clientMutationId|syncState|prompt|learningProfile/)
  })
  it('is stable across migration, serialization and repeated migration', () => {
    const migrated = migrateToLatest(v7Fixture())
    expect(migrateToLatest(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated)
    expect(migrateToLatest(migrateToLatest(v7Fixture()))).toEqual(migrated)
  })
})
