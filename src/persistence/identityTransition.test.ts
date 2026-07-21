import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from './testStorage'
import { scopedKey, userIdentityScope } from './identityScope'

const USER_A = userIdentityScope('11111111-1111-4111-8111-111111111111')
const USER_B = userIdentityScope('22222222-2222-4222-8222-222222222222')
const storage = new MemoryStorage()

let transitionBrowserIdentity: typeof import('./identityTransition').transitionBrowserIdentity
let clearBrowserIdentityMemory: typeof import('./identityTransition').clearBrowserIdentityMemory
let useForgePlannerStore: typeof import('../hooks/useForgePlannerStore').useForgePlannerStore

function persistedPlan(id: string) {
  return JSON.stringify({
    state: {
      schemaVersion: 1,
      activePlanId: id,
      plans: [{ id, title: id }],
      archivedPlanIds: [], hiddenPlanIds: [], deletedPlans: [],
    },
    version: 1,
  })
}

describe('browser identity transitions', () => {
  beforeAll(async () => {
    vi.stubGlobal('window', { localStorage: storage, sessionStorage: new MemoryStorage() })
    ;({ transitionBrowserIdentity, clearBrowserIdentityMemory } = await import('./identityTransition'))
    ;({ useForgePlannerStore } = await import('../hooks/useForgePlannerStore'))
  })

  beforeEach(() => {
    storage.clear()
    clearBrowserIdentityMemory()
  })

  it('clears sensitive memory before another identity is hydrated', async () => {
    storage.setItem(scopedKey(USER_A, 'forge-planner-state'), persistedPlan('A-private'))
    storage.setItem(scopedKey(USER_B, 'forge-planner-state'), persistedPlan('B-private'))

    await transitionBrowserIdentity(USER_A)
    expect(useForgePlannerStore.getState().plans.map((plan) => plan.id)).toEqual(['A-private'])

    clearBrowserIdentityMemory()
    expect(useForgePlannerStore.getState().plans).toEqual([])
    expect(useForgePlannerStore.getState().activePlanId).toBeUndefined()

    await transitionBrowserIdentity(USER_B)
    expect(useForgePlannerStore.getState().plans.map((plan) => plan.id)).toEqual(['B-private'])
    await transitionBrowserIdentity(USER_A)
    expect(useForgePlannerStore.getState().plans.map((plan) => plan.id)).toEqual(['A-private'])
  })

  it('ignores a forged global browser cache for an authenticated user', async () => {
    storage.setItem('forge-planner-state', persistedPlan('forged-owner'))
    await transitionBrowserIdentity(USER_B)
    expect(useForgePlannerStore.getState().plans).toEqual([])
  })
})
