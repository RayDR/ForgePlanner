import { beforeEach, describe, expect, it } from 'vitest'
import { GUEST_SCOPE, setIdentityScope, userIdentityScope } from './identityScope'
import { MemoryStorage } from './testStorage'
import { readRoadmapCalendarPageSize, recommendedRoadmapCalendarPageSize, resolveRoadmapCalendarPageSize, writeRoadmapCalendarPageSize } from './roadmapCalendarPreference'

describe('roadmap calendar preference', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    setIdentityScope(GUEST_SCOPE)
  })

  it('recommends one through four calendars for progressively wider devices', () => {
    expect(recommendedRoadmapCalendarPageSize(390)).toBe(1)
    expect(recommendedRoadmapCalendarPageSize(768)).toBe(2)
    expect(recommendedRoadmapCalendarPageSize(1280)).toBe(3)
    expect(recommendedRoadmapCalendarPageSize(1920)).toBe(4)
  })

  it('ignores a desktop preference on phones and tablets', () => {
    expect(resolveRoadmapCalendarPageSize(390, 4)).toBe(1)
    expect(resolveRoadmapCalendarPageSize(768, 4)).toBe(2)
    expect(resolveRoadmapCalendarPageSize(1024, 4)).toBe(2)
    expect(resolveRoadmapCalendarPageSize(1280, 4)).toBe(4)
  })

  it('persists the explicit choice per immutable identity scope', () => {
    expect(readRoadmapCalendarPageSize(storage)).toBeNull()
    writeRoadmapCalendarPageSize(2, storage)
    expect(readRoadmapCalendarPageSize(storage)).toBe(2)

    setIdentityScope(userIdentityScope('11111111-1111-4111-8111-111111111111'))
    expect(readRoadmapCalendarPageSize(storage)).toBeNull()
    writeRoadmapCalendarPageSize(4, storage)
    expect(readRoadmapCalendarPageSize(storage)).toBe(4)

    setIdentityScope(GUEST_SCOPE)
    expect(readRoadmapCalendarPageSize(storage)).toBe(2)
  })
})
