export const GUEST_SCOPE = 'guest-session' as const
export type IdentityScope = typeof GUEST_SCOPE | `user:${string}`

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let activeScope: IdentityScope | null = null
let scopeGeneration = 0

export function userIdentityScope(userId: string): IdentityScope {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('An immutable user UUID is required for browser persistence.')
  }
  return `user:${userId.toLowerCase()}`
}

export function getIdentityScope() {
  return activeScope
}

export function getScopeGeneration() {
  return scopeGeneration
}

export function setIdentityScope(scope: IdentityScope | null) {
  activeScope = scope
  scopeGeneration += 1
  return scopeGeneration
}

export function isCurrentScope(scope: IdentityScope, generation: number) {
  return activeScope === scope && scopeGeneration === generation
}

export function scopedKey(scope: IdentityScope, key: string) {
  return `northstar:v1:${scope}:${key}`
}
