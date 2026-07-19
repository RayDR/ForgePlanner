import { beforeEach, describe, expect, it } from 'vitest'
import { GUEST_SCOPE, setIdentityScope, userIdentityScope } from './identityScope'
import { createIdentityScopedStorage } from './scopedStorage'
import { MemoryStorage } from './testStorage'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

describe('identity-scoped persistence', () => {
  let storage: MemoryStorage
  let adapter: ReturnType<typeof createIdentityScopedStorage>

  beforeEach(() => {
    storage = new MemoryStorage()
    adapter = createIdentityScopedStorage(() => storage)
    setIdentityScope(null)
  })

  it('isolates guest, User A and User B and can safely return to A', () => {
    setIdentityScope(GUEST_SCOPE); adapter.setItem('planner', 'guest')
    setIdentityScope(userIdentityScope(USER_A)); adapter.setItem('planner', 'A')
    setIdentityScope(userIdentityScope(USER_B)); adapter.setItem('planner', 'B')

    expect(adapter.getItem('planner')).toBe('B')
    setIdentityScope(GUEST_SCOPE); expect(adapter.getItem('planner')).toBe('guest')
    setIdentityScope(userIdentityScope(USER_A)); expect(adapter.getItem('planner')).toBe('A')
  })

  it('quarantines unowned legacy keys from every identity scope', () => {
    storage.setItem('planner', 'legacy-guest')
    setIdentityScope(userIdentityScope(USER_A))
    expect(adapter.getItem('planner')).toBeNull()

    setIdentityScope(GUEST_SCOPE)
    expect(adapter.getItem('planner')).toBeNull()
    expect(storage.getItem('planner')).toBe('legacy-guest')
  })

  it('rejects mutable or non-UUID user identifiers', () => {
    expect(() => userIdentityScope('person@example.com')).toThrow(/UUID/)
    expect(() => userIdentityScope('MX')).toThrow(/UUID/)
  })
})
