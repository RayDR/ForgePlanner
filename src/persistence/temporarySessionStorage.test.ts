import { describe, expect, it } from 'vitest'
import { GUEST_SCOPE, userIdentityScope } from './identityScope'
import { readTemporarySessionState, saveTemporarySessionState } from './temporarySessionStorage'
import { MemoryStorage } from './testStorage'

const USER_A = userIdentityScope('11111111-1111-4111-8111-111111111111')

describe('temporary session-only planner state', () => {
  it('survives refresh-like reads in the same browser session', () => {
    const session = new MemoryStorage()
    saveTemporarySessionState({ proposal: 'draft' }, { scope: GUEST_SCOPE, storage: session })
    expect(readTemporarySessionState<{ proposal: string }>({ scope: GUEST_SCOPE, storage: session })).toEqual({ proposal: 'draft' })
  })

  it('does not survive a new browser-session storage instance', () => {
    const closedSession = new MemoryStorage()
    saveTemporarySessionState({ acceptedPlan: true }, { scope: GUEST_SCOPE, storage: closedSession })
    expect(readTemporarySessionState({ scope: GUEST_SCOPE, storage: new MemoryStorage() })).toBeNull()
  })

  it('isolates temporary state by identity and expires it', () => {
    const session = new MemoryStorage()
    saveTemporarySessionState({ owner: 'guest' }, { scope: GUEST_SCOPE, storage: session, ttlMs: 100 })
    expect(readTemporarySessionState({ scope: USER_A, storage: session })).toBeNull()
    expect(readTemporarySessionState({ scope: GUEST_SCOPE, storage: session, now: Date.now() + 101 })).toBeNull()
  })
})
