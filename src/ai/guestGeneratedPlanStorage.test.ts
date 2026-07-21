import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanonicalPlanFixture } from '../../shared/plan-contract/index.js'
import { setIdentityScope, GUEST_SCOPE } from '../persistence/identityScope'
import { MemoryStorage } from '../persistence/testStorage'
import { forgePlanFromAiSnapshot, readGuestGeneratedPlans, saveGuestGeneratedPlan } from './guestGeneratedPlanStorage'

describe('session-only guest AI plans', () => {
  const storage = new MemoryStorage()
  beforeEach(() => { storage.clear(); setIdentityScope(GUEST_SCOPE); vi.useRealTimers() })

  it('survives refresh in the same tab but not a new browser session', () => {
    const plan = forgePlanFromAiSnapshot(createCanonicalPlanFixture(), 'operation-1')
    saveGuestGeneratedPlan(plan, storage)
    expect(readGuestGeneratedPlans(storage).map((item) => item.id)).toEqual([plan.id])
    expect(readGuestGeneratedPlans(new MemoryStorage())).toEqual([])
  })

  it('keeps canonical schema v8 and local-only transport metadata outside the snapshot', () => {
    const plan = forgePlanFromAiSnapshot(createCanonicalPlanFixture(), 'operation-2')
    expect(plan.snapshot.schemaVersion).toBe(8)
    expect(plan.remoteId).toBeUndefined()
    expect(plan.snapshot).not.toHaveProperty('sync')
  })
})
