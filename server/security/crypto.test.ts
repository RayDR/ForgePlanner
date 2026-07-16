import { describe, expect, it } from 'vitest'
import { createOpaqueToken, hashToken } from './crypto.js'

describe('opaque session tokens', () => {
  it('creates unique tokens and stores deterministic hashes', () => {
    const first = createOpaqueToken(); const second = createOpaqueToken()
    expect(first).not.toBe(second)
    expect(hashToken(first)).toHaveLength(64)
    expect(hashToken(first)).toBe(hashToken(first))
  })
})
