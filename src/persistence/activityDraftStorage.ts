import { getIdentityScope, scopedKey } from './identityScope'

function draftKey(planId: string, activityId: string) {
  const scope = getIdentityScope()
  if (!scope) return null
  return scopedKey(scope, `activity-draft:${planId}:${activityId}`)
}

export function readActivityDraft(planId: string, activityId: string) {
  const key = draftKey(planId, activityId)
  return key && typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
}

export function writeActivityDraft(planId: string, activityId: string, value: string) {
  const key = draftKey(planId, activityId)
  if (key && typeof window !== 'undefined') window.localStorage.setItem(key, value)
}

export function removeActivityDraft(planId: string, activityId: string) {
  const key = draftKey(planId, activityId)
  if (key && typeof window !== 'undefined') window.localStorage.removeItem(key)
}
