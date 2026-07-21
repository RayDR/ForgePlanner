import { resetForgePlannerMemory, useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { resetRoadmapMemory, useRoadmapStore } from '../hooks/useRoadmapStore'
import { GUEST_SCOPE, setIdentityScope, type IdentityScope } from './identityScope'

let transitionSequence = 0

export async function transitionBrowserIdentity(scope: IdentityScope) {
  const sequence = ++transitionSequence

  // Disable persistence before clearing memory so previous-user state cannot be
  // written into the next scope during the transition.
  setIdentityScope(null)
  resetForgePlannerMemory()
  resetRoadmapMemory()

  if (sequence !== transitionSequence) return false
  setIdentityScope(scope)
  await Promise.all([
    useForgePlannerStore.persist.rehydrate(),
    useRoadmapStore.persist.rehydrate(),
  ])
  if (scope === GUEST_SCOPE) useForgePlannerStore.getState().hydrateSessionPlans()
  return sequence === transitionSequence
}

export function clearBrowserIdentityMemory() {
  transitionSequence += 1
  setIdentityScope(null)
  resetForgePlannerMemory()
  resetRoadmapMemory()
}
