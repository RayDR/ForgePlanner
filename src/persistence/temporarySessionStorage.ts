import { getIdentityScope, scopedKey, type IdentityScope } from './identityScope'

export interface TemporarySessionEnvelope<T> {
  value: T
  expiresAt: string
}

const TEMPORARY_STATE_KEY = 'temporary-planner-state'
export type TemporarySessionNamespace = 'plans' | 'ai-proposals'

function temporaryKey(namespace?: TemporarySessionNamespace) { return namespace ? `${TEMPORARY_STATE_KEY}:${namespace}` : TEMPORARY_STATE_KEY }

function browserSessionStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.sessionStorage
}

function resolveScope(explicitScope?: IdentityScope) {
  const scope = explicitScope ?? getIdentityScope()
  if (!scope) throw new Error('Identity scope must be resolved before using temporary session state.')
  return scope
}

export function saveTemporarySessionState<T>(
  value: T,
  options: { scope?: IdentityScope; ttlMs?: number; storage?: Storage; namespace?: TemporarySessionNamespace; maxBytes?: number } = {},
) {
  const scope = resolveScope(options.scope)
  const storage = options.storage ?? browserSessionStorage()
  if (!storage) return
  const envelope: TemporarySessionEnvelope<T> = {
    value,
    expiresAt: new Date(Date.now() + (options.ttlMs ?? 4 * 60 * 60 * 1000)).toISOString(),
  }
  const serialized = JSON.stringify(envelope)
  if (options.maxBytes && new TextEncoder().encode(serialized).byteLength > options.maxBytes) throw new Error('Temporary session state exceeds its storage limit.')
  storage.setItem(scopedKey(scope, temporaryKey(options.namespace)), serialized)
}

export function readTemporarySessionState<T>(
  options: { scope?: IdentityScope; storage?: Storage; now?: number; namespace?: TemporarySessionNamespace } = {},
): T | null {
  const scope = resolveScope(options.scope)
  const storage = options.storage ?? browserSessionStorage()
  if (!storage) return null
  const key = scopedKey(scope, temporaryKey(options.namespace))
  const legacyKey = scopedKey(scope, TEMPORARY_STATE_KEY)
  const raw = storage.getItem(key) ?? (options.namespace === 'plans' ? storage.getItem(legacyKey) : null)
  if (!raw) return null
  try {
    const envelope = JSON.parse(raw) as TemporarySessionEnvelope<T>
    if (!envelope.expiresAt || new Date(envelope.expiresAt).getTime() <= (options.now ?? Date.now())) {
      storage.removeItem(key)
      return null
    }
    return envelope.value
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function clearTemporarySessionState(options: { scope?: IdentityScope; storage?: Storage; namespace?: TemporarySessionNamespace } = {}) {
  const scope = resolveScope(options.scope)
  const storage = options.storage ?? browserSessionStorage()
  storage?.removeItem(scopedKey(scope, temporaryKey(options.namespace)))
}
