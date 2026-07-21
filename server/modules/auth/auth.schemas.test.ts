import { describe, expect, it } from 'vitest'
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, sessionIdSchema, verificationConfirmSchema, verificationRequestSchema } from './auth.schemas.js'

describe('auth validation', () => {
  it('normalizes email addresses', () => {
    expect(loginSchema.parse({ email: ' Person@Example.COM ', password: 'x' }).email).toBe('person@example.com')
  })
  it('rejects weak passwords', () => {
    expect(() => registerSchema.parse({ email: 'a@example.com', password: 'weak-password', displayName: 'Person' })).toThrow()
  })
  it('keeps recovery responses backed by normalized input and strong reset passwords', () => {
    expect(forgotPasswordSchema.parse({ email: ' Person@Example.COM ' }).email).toBe('person@example.com')
    expect(() => resetPasswordSchema.parse({ token: 'x'.repeat(40), password: 'weak' })).toThrow()
  })
  it('accepts UUID session IDs and rejects arbitrary paths', () => {
    expect(sessionIdSchema.parse('9f8edca0-a85b-4eaa-a27e-6af29c672772')).toContain('-')
    expect(() => sessionIdSchema.parse('../session')).toThrow()
  })
  it('normalizes verification addresses and rejects short tokens', () => {
    expect(verificationRequestSchema.parse({ email: ' User@Example.COM ' }).email).toBe('user@example.com')
    expect(() => verificationConfirmSchema.parse({ token: 'short' })).toThrow()
  })
})
