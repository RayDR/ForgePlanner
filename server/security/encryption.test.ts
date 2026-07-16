import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './encryption.js'

describe('email secret encryption', () => {
  it('round-trips a secret without storing plaintext', () => {
    const key = randomBytes(32).toString('base64'); const encrypted = encryptSecret('smtp-password', key)
    expect(encrypted).not.toContain('smtp-password')
    expect(decryptSecret(encrypted, key)).toBe('smtp-password')
  })
  it('rejects a different encryption key', () => {
    const encrypted = encryptSecret('smtp-password', randomBytes(32).toString('base64'))
    expect(() => decryptSecret(encrypted, randomBytes(32).toString('base64'))).toThrow()
  })
})
