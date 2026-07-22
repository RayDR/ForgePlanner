import type { CanonicalPlan } from '../../shared/plan-contract/index.js'
import { GUEST_SCOPE } from '../persistence/identityScope'
import { readTemporarySessionState, saveTemporarySessionState } from '../persistence/temporarySessionStorage'
import type { ForgePlan } from '../types/forgePlanner'

const options = (storage?: Storage) => ({ scope: GUEST_SCOPE, namespace: 'plans' as const, storage })

export function forgePlanFromAiSnapshot(snapshot: CanonicalPlan, operationId: string): ForgePlan {
  const now = new Date().toISOString()
  return { id: `ai-session-${operationId}`, title: snapshot.project.name, description: snapshot.project.objective, startDate: snapshot.project.startDate, endDate: snapshot.project.endDate, planningMode: snapshot.metadata.planningMode ?? 'auto', templateKey: snapshot.metadata.templateKey, categories: snapshot.project.categoryDefinitions.map((item) => item.key), monthlyViewPreference: 'list', snapshot, createdAt: now, updatedAt: now }
}

export function readGuestGeneratedPlans(storage?: Storage) {
  return (readTemporarySessionState<ForgePlan[]>({ ...options(storage) }) ?? []).filter((plan) => plan?.id?.startsWith('ai-session-') && plan.snapshot?.schemaVersion === 8).slice(0, 3)
}

export function saveGuestGeneratedPlan(plan: ForgePlan, storage?: Storage) {
  const plans = [plan, ...readGuestGeneratedPlans(storage).filter((item) => item.id !== plan.id)].slice(0, 3)
  saveTemporarySessionState(plans, { ...options(storage), ttlMs: 4 * 60 * 60 * 1000, maxBytes: 900 * 1024 })
  return plans
}

export function removeGuestGeneratedPlans(ids: Iterable<string>, storage?: Storage) {
  const removed = new Set(ids)
  const plans = readGuestGeneratedPlans(storage).filter((plan) => !removed.has(plan.id))
  saveTemporarySessionState(plans, { ...options(storage), ttlMs: 4 * 60 * 60 * 1000, maxBytes: 900 * 1024 })
  return plans
}
