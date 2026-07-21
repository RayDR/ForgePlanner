import { describe, expect, it } from 'vitest'
import { grantAccessSchema, profileCodeSchema, respondAccessSchema, shareLinkSchema, sharingStateSchema, updateShareLinkSchema } from './sharing.schemas.js'

describe('sharing validation', () => {
  it('accepts an exact public profile code', () => expect(profileCodeSchema.parse('planner_user#1234')).toBe('planner_user#1234'))
  it('rejects email and partial-profile searches', () => {
    expect(() => profileCodeSchema.parse('person@example.com')).toThrow()
    expect(() => profileCodeSchema.parse('planner')).toThrow()
  })
  it('limits access levels and invitation responses', () => {
    expect(grantAccessSchema.parse({ profileCode: 'planner#1234', accessLevel: 'viewer' }).accessLevel).toBe('viewer')
    expect(() => grantAccessSchema.parse({ profileCode: 'planner#1234', accessLevel: 'owner' })).toThrow()
    expect(() => respondAccessSchema.parse({ response: 'revoked' })).toThrow()
  })
  it('validates sharing locks and link permissions explicitly', () => {
    expect(sharingStateSchema.parse({ enabled: false })).toEqual({ enabled: false })
    expect(shareLinkSchema.parse({ accessLevel: 'editor' })).toEqual({ accessLevel: 'editor' })
    expect(updateShareLinkSchema.parse({ enabled: false })).toEqual({ enabled: false })
    expect(() => shareLinkSchema.parse({ accessLevel: 'owner' })).toThrow()
  })
})
