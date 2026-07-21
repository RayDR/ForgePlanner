import { describe, expect, it } from 'vitest'
import { impersonationSchema, updateUserSchema, userListQuerySchema } from './admin.schemas.js'

describe('admin validation', () => {
  it('caps pagination and validates filters', () => {
    expect(userListQuerySchema.parse({ page: '2', limit: '50', status: 'active' })).toMatchObject({ page: 2, limit: 50, status: 'active' })
    expect(() => userListQuerySchema.parse({ limit: '1000' })).toThrow()
  })
  it('requires an administrative change and valid roles', () => {
    expect(() => updateUserSchema.parse({})).toThrow()
    expect(updateUserSchema.parse({ roles: ['user', 'admin'] }).roles).toEqual(['user', 'admin'])
    expect(() => updateUserSchema.parse({ roles: ['user', 'admin', 'admin'] })).toThrow()
  })
  it('requires a UUID target and a meaningful impersonation reason', () => {
    expect(() => impersonationSchema.parse({ targetUserId: 'not-a-user', reason: 'test' })).toThrow()
    expect(impersonationSchema.parse({ targetUserId: '9f8edca0-a85b-4eaa-a27e-6af29c672772', reason: 'Support request' }).reason).toBe('Support request')
  })
})
