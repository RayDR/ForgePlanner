import { describe, expect, it } from 'vitest'
import { assertSafeAiInput } from './ai-input-safety.js'

describe('AI input safety', () => {
  it.each(['-----BEGIN PRIVATE KEY----- abc', 'Bearer abcdefghijklmnopqrstuvwxyz', 'eyJabcdefghi.abcdefghijk.abcdefghijk', '123-45-6789', 'password=super-secret', '4111 1111 1111 1111'])('rejects a clear secret without echoing it', (secret) => { try { assertSafeAiInput([secret]); throw new Error('not rejected') } catch (error) { expect(error).toMatchObject({ code: 'AI_PROPOSAL_SENSITIVE_INPUT' }); expect(String(error)).not.toContain(secret) } })
  it('allows ordinary dates, budgets and career text', () => expect(() => assertSafeAiInput(['Budget 1500, start 2026-08-01, call 555-1234 for career planning'])).not.toThrow())
})
