import { beforeEach, describe, expect, it } from 'vitest'
import { setIdentityScope, GUEST_SCOPE, userIdentityScope } from './identityScope'
import { MemoryStorage } from './testStorage'
import { readActivityViewPreference, writeActivityViewPreference } from './activityViewPreference'

describe('activity view preference', () => {
  let storage: MemoryStorage
  beforeEach(() => { storage = new MemoryStorage(); setIdentityScope(GUEST_SCOPE) })

  it('defaults to simple and keeps each identity isolated', () => {
    expect(readActivityViewPreference(storage)).toBe('simple')
    writeActivityViewPreference('advanced', storage)
    expect(readActivityViewPreference(storage)).toBe('advanced')
    setIdentityScope(userIdentityScope('11111111-1111-4111-8111-111111111111'))
    expect(readActivityViewPreference(storage)).toBe('simple')
  })
})
