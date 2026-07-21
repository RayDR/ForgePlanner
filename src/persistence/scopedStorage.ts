import type { StateStorage } from 'zustand/middleware'
import { getIdentityScope, scopedKey, type IdentityScope } from './identityScope'

function browserLocalStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

export function createIdentityScopedStorage(
  storageProvider: () => Storage | undefined = browserLocalStorage,
): StateStorage {
  return {
    getItem(name) {
      const scope = getIdentityScope()
      const storage = storageProvider()
      if (!scope || !storage) return null

      const key = scopedKey(scope, name)
      return storage.getItem(key)
    },
    setItem(name, value) {
      const scope = getIdentityScope()
      const storage = storageProvider()
      if (!scope || !storage) return
      storage.setItem(scopedKey(scope, name), value)
    },
    removeItem(name) {
      const scope = getIdentityScope()
      const storage = storageProvider()
      if (!scope || !storage) return
      storage.removeItem(scopedKey(scope, name))
    },
  }
}

export function readScopedPersistedState<T>(scope: IdentityScope, name: string): T | null {
  const storage = browserLocalStorage()
  const raw = storage?.getItem(scopedKey(scope, name))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: T }
    return parsed.state ?? null
  } catch {
    return null
  }
}

export function writeScopedPersistedState<T>(scope: IdentityScope, name: string, state: T, version: number) {
  browserLocalStorage()?.setItem(scopedKey(scope, name), JSON.stringify({ state, version }))
}
