import { describe, expect, it } from 'vitest'
import { createPlanSchema, importPlansSchema, planPayloadSchema, updatePlanSchema } from './plan.schemas.js'

const plan = {
  importKey: 'local-plan',
  name: 'Plan',
  objective: '',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  snapshot: { schemaVersion: 7, project: { id: 'local-plan' }, activities: [] },
}
describe('plan payload validation', () => {
  it('accepts versioned JSON snapshots for idempotent import', () => expect(importPlansSchema.parse({ plans: [plan] }).plans[0].importKey).toBe('local-plan'))
  it('requires a dedicated UUID mutation ID for normal creation', () => {
    expect(createPlanSchema.parse({ ...plan, clientMutationId: '11111111-1111-4111-8111-111111111111' }).clientMutationId).toMatch(/1111/)
    expect(() => createPlanSchema.parse(plan)).toThrow()
  })
  it('rejects inverted plan windows', () => expect(() => planPayloadSchema.parse({ ...plan, startDate: '2027-01-01' })).toThrow())
  it('requires a positive revision for updates', () => {
    expect(updatePlanSchema.parse({ name: 'Updated', expectedRevision: 2 }).expectedRevision).toBe(2)
    expect(() => updatePlanSchema.parse({ name: 'Unsafe update' })).toThrow()
  })
})
