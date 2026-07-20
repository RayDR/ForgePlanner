import { describe, expect, it } from 'vitest'
import { createPlanSchema, importPlansSchema, planLifecycleSchema, planPayloadSchema, trashQuerySchema, updatePlanSchema } from './plan.schemas.js'
import { createCanonicalPlanFixture } from '../../../shared/plan-contract/index.js'

const plan = {
  importKey: 'local-plan',
  snapshot: createCanonicalPlanFixture(),
}
describe('plan payload validation', () => {
  it('accepts versioned JSON snapshots for idempotent import', () => expect(importPlansSchema.parse({ plans: [plan] }).plans[0].importKey).toBe('local-plan'))
  it('requires a dedicated UUID mutation ID for normal creation', () => {
    expect(createPlanSchema.parse({ snapshot: plan.snapshot, clientMutationId: '11111111-1111-4111-8111-111111111111' }).clientMutationId).toMatch(/1111/)
    expect(() => createPlanSchema.parse(plan)).toThrow()
  })
  it('rejects protected relational fields', () => expect(() => planPayloadSchema.parse({ ...plan, name: 'Conflicting' })).toThrow())
  it('requires a positive revision for updates', () => {
    expect(updatePlanSchema.parse({ snapshot: plan.snapshot, expectedRevision: 2 }).expectedRevision).toBe(2)
    expect(() => updatePlanSchema.parse({ snapshot: plan.snapshot })).toThrow()
  })
  it('validates lifecycle revisions and bounded trash pagination', () => {
    expect(planLifecycleSchema.parse({ expectedRevision: 3 })).toEqual({ expectedRevision: 3 })
    expect(trashQuerySchema.parse({})).toEqual({ page: 1, limit: 50 })
    expect(() => planLifecycleSchema.parse({ expectedRevision: 0 })).toThrow()
    expect(() => trashQuerySchema.parse({ limit: 101 })).toThrow()
  })
})
