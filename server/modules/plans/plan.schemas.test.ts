import { describe, expect, it } from 'vitest'
import { createPlanSchema, importPlansSchema, planPayloadSchema, updatePlanSchema } from './plan.schemas.js'
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
})
