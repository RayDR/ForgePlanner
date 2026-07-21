import type { ForgePlan, PlanSyncMetadata } from '../types/forgePlanner'

/**
 * Returns plans that are safe to offer for explicit account import.
 * Synchronisation state is deliberately kept outside ForgePlan/snapshot.
 */
export function getEligibleLocalPlans(
  plans: ForgePlan[],
  syncByPlanId: Record<string, PlanSyncMetadata> = {},
  deletedPlanIds: Iterable<string> = [],
) {
  const deleted = new Set(deletedPlanIds)
  return plans.filter((plan) => {
    if (plan.remoteId || deleted.has(plan.id)) return false
    const state = syncByPlanId[plan.id]?.state ?? 'local'
    // Failed/offline plans are recoverable and should remain explicitly saveable.
    // Other transitional/remote states are not migration candidates.
    return state === 'local' || state === 'failed' || state === 'offline'
  })
}
