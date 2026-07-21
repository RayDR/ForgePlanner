import type { ForgePlan, PlanSyncMetadata } from '../types/forgePlanner'

export type VisiblePlanSource = 'remote-account' | 'guest-local' | 'account-local-outbox'
export interface VisiblePlanCard {
  plan: ForgePlan
  source: VisiblePlanSource
  ownership: 'account' | 'unowned-local'
  syncState: PlanSyncMetadata['state']
  canOpen: boolean
  canSync: boolean
  canRetry: boolean
}

export function buildVisiblePlanCards(
  accountPlans: ForgePlan[],
  guestPlans: ForgePlan[],
  syncByPlanId: Record<string, PlanSyncMetadata>,
  guestScopeActive = true,
) {
  const seen = new Set<string>()
  const cards: VisiblePlanCard[] = []
  for (const plan of accountPlans) {
    seen.add(plan.id)
    const syncState = syncByPlanId[plan.id]?.state ?? (plan.remoteId ? 'synced' : 'local')
    cards.push({ plan, source: plan.remoteId ? 'remote-account' : 'account-local-outbox', ownership: plan.remoteId ? 'account' : 'unowned-local', syncState, canOpen: true, canSync: !plan.remoteId && ['local', 'failed', 'offline'].includes(syncState), canRetry: !plan.remoteId && ['failed', 'offline'].includes(syncState) })
  }
  for (const plan of guestPlans) {
    if (seen.has(plan.id) || plan.remoteId) continue
    const syncState = syncByPlanId[plan.id]?.state ?? 'local'
    cards.push({ plan, source: 'guest-local', ownership: 'unowned-local', syncState, canOpen: guestScopeActive, canSync: ['local', 'failed', 'offline'].includes(syncState), canRetry: ['failed', 'offline'].includes(syncState) })
  }
  return cards
}

export const eligibleLocalCards = (cards: VisiblePlanCard[]) => cards.filter((card) => card.canSync)
