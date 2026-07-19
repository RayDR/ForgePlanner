import type { ForgePlan, ForgePlannerState } from '../types/forgePlanner'
import { GUEST_SCOPE } from './identityScope'
import { readScopedPersistedState, writeScopedPersistedState } from './scopedStorage'

const PLANNER_STORE_NAME = 'forge-planner-state'
const PLANNER_STORE_VERSION = 1

export function readGuestPlanCandidates() {
  return readScopedPersistedState<ForgePlannerState>(GUEST_SCOPE, PLANNER_STORE_NAME)?.plans
    .filter((plan) => !plan.remoteId) ?? []
}

export function removeImportedGuestPlans(importedPlans: Pick<ForgePlan, 'id'>[]) {
  const guestState = readScopedPersistedState<ForgePlannerState>(GUEST_SCOPE, PLANNER_STORE_NAME)
  if (!guestState) return
  const importedIds = new Set(importedPlans.map((plan) => plan.id))
  writeScopedPersistedState(GUEST_SCOPE, PLANNER_STORE_NAME, {
    ...guestState,
    activePlanId: guestState.activePlanId && importedIds.has(guestState.activePlanId) ? undefined : guestState.activePlanId,
    plans: guestState.plans.filter((plan) => !importedIds.has(plan.id)),
  }, PLANNER_STORE_VERSION)
}
