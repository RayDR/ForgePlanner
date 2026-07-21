import { describe, expect, it } from 'vitest'
import { normalizeHandle } from './profile.service.js'
import { updatePreferencesSchema } from './profile.schemas.js'

describe('public profile handles', () => {
  it('normalizes accents and unsafe characters', () => expect(normalizeHandle('Ráy Mundo!')).toBe('raymundo'))
  it('protects reserved handles', () => expect(normalizeHandle('Admin')).not.toBe('admin'))
  it('rejects reserved handles during profile editing', () => expect(() => updatePreferencesSchema.parse({ handle: 'admin' })).toThrow())
  it('normalizes an edited handle to lowercase', () => expect(updatePreferencesSchema.parse({ handle: 'My_Profile' }).handle).toBe('my_profile'))
  it('accepts the supported profile preferences', () => expect(updatePreferencesSchema.parse({ displayName: 'Ada', bio: '', avatarUrl: '', locale: 'en', timezone: 'UTC', theme: 'light', searchable: false })).toMatchObject({ displayName: 'Ada', locale: 'en', theme: 'light', searchable: false }))
})
