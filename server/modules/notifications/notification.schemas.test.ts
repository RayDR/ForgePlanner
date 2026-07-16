import { describe, expect, it } from 'vitest'
import { notificationIdSchema, notificationPreferenceSchema } from './notification.schemas.js'

describe('notification validation', () => {
  it('accepts partial preference updates', () => expect(notificationPreferenceSchema.parse({ inAppPlanInvitations: false })).toEqual({ inAppPlanInvitations: false }))
  it('rejects empty preference updates', () => expect(() => notificationPreferenceSchema.parse({})).toThrow())
  it('rejects arbitrary notification identifiers', () => expect(() => notificationIdSchema.parse('../all')).toThrow())
})
