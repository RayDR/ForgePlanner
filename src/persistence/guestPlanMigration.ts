import type { ForgePlan, ForgePlannerState } from '../types/forgePlanner'
import { GUEST_SCOPE } from './identityScope'
import { readScopedPersistedState, writeScopedPersistedState } from './scopedStorage'
import { readGuestGeneratedPlans, removeGuestGeneratedPlans } from '../ai/guestGeneratedPlanStorage'

const PLANNER_STORE_NAME = 'forge-planner-state'
const PLANNER_STORE_VERSION = 1
const GUEST_PLANS_EVENT = 'northstar:guest-plans-changed'

export function readGuestPlanCandidates() {
  const persisted = readScopedPersistedState<ForgePlannerState>(GUEST_SCOPE, PLANNER_STORE_NAME)?.plans.filter((plan) => !plan.remoteId) ?? []
  const generated = readGuestGeneratedPlans()
  return [...generated, ...persisted.filter((plan) => !generated.some((item) => item.id === plan.id))]
}

export function removeImportedGuestPlans(importedPlans: Pick<ForgePlan, 'id'>[]) {
  const importedIds = new Set(importedPlans.map((plan) => plan.id))
  removeGuestGeneratedPlans(importedIds)
  const guestState = readScopedPersistedState<ForgePlannerState>(GUEST_SCOPE, PLANNER_STORE_NAME)
  if (guestState) writeScopedPersistedState(GUEST_SCOPE, PLANNER_STORE_NAME, {
      ...guestState,
      activePlanId: guestState.activePlanId && importedIds.has(guestState.activePlanId) ? undefined : guestState.activePlanId,
      plans: guestState.plans.filter((plan) => !importedIds.has(plan.id)),
    }, PLANNER_STORE_VERSION)
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(GUEST_PLANS_EVENT))
}

export function subscribeGuestPlanCandidates(listener: () => void) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined
  window.addEventListener(GUEST_PLANS_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(GUEST_PLANS_EVENT, listener); window.removeEventListener('storage', listener) }
}
