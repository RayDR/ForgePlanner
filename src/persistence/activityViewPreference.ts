import { GUEST_SCOPE, getIdentityScope, scopedKey } from './identityScope'

export type ActivityViewMode = 'simple' | 'advanced'

const PREFERENCE_KEY = 'activity-view-mode'

function key() {
  return scopedKey(getIdentityScope() ?? GUEST_SCOPE, PREFERENCE_KEY)
}

export function readActivityViewPreference(storage: Storage = window.localStorage): ActivityViewMode {
  return storage.getItem(key()) === 'advanced' ? 'advanced' : 'simple'
}

export function writeActivityViewPreference(mode: ActivityViewMode, storage: Storage = window.localStorage) {
  storage.setItem(key(), mode)
}
