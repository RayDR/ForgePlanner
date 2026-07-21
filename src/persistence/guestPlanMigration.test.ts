import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForgePlannerState } from '../types/forgePlanner'
import { GUEST_SCOPE, scopedKey } from './identityScope'
import { readGuestPlanCandidates, removeImportedGuestPlans } from './guestPlanMigration'
import { MemoryStorage } from './testStorage'

describe('explicit guest plan migration', () => {
  const storage = new MemoryStorage()
  const guestState = {
    schemaVersion: 1,
    activePlanId: 'guest-plan',
    plans: [{ id: 'guest-plan' }, { id: 'guest-plan-2' }, { id: 'already-remote', remoteId: 'remote-id' }],
    archivedPlanIds: [], hiddenPlanIds: [], deletedPlans: [{ id: 'guest-trash', plan: { id: 'deleted-guest' }, deletedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z' }],
  } as unknown as ForgePlannerState

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', { localStorage: storage })
    storage.setItem(scopedKey(GUEST_SCOPE, 'forge-planner-state'), JSON.stringify({ state: guestState, version: 1 }))
  })

  it('only exposes unsaved guest plans as explicit candidates without importing them', () => {
    expect(readGuestPlanCandidates().map((plan) => plan.id)).toEqual(['guest-plan', 'guest-plan-2'])
    expect(JSON.parse(storage.getItem(scopedKey(GUEST_SCOPE, 'forge-planner-state'))!).state.plans).toHaveLength(3)
  })

  it('removes guest candidates only after the explicit import completion step', () => {
    removeImportedGuestPlans([{ id: 'guest-plan' }])
    const persisted = JSON.parse(storage.getItem(scopedKey(GUEST_SCOPE, 'forge-planner-state'))!) as { state: ForgePlannerState }
    expect(persisted.state.plans.map((plan) => plan.id)).toEqual(['guest-plan-2', 'already-remote'])
    expect(persisted.state.activePlanId).toBeUndefined()
    expect(persisted.state.deletedPlans.map((item) => item.id)).toEqual(['guest-trash'])
  })
})
