import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'

const base = { DATABASE_URL: 'postgresql://test', APP_ORIGIN: 'https://planner.example.com' }

describe('production AI guest configuration', () => {
  it('fails startup when the guest signing key is missing in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AI_GUEST_SESSION_SIGNING_KEY/)
  })

  it('accepts an independently generated production signing key', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'production', AI_GUEST_SESSION_SIGNING_KEY: 'a'.repeat(64) }).AI_GUEST_SESSION_SIGNING_KEY).toHaveLength(64)
  })

  it('uses deterministic mock mode by default and requires a backend key for OpenAI', () => {
    expect(loadEnv({ ...base }).AI_PROVIDER).toBe('mock')
    expect(() => loadEnv({ ...base, AI_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/)
    expect(loadEnv({ ...base, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-key-that-stays-on-the-server' })).toMatchObject({ AI_PROVIDER: 'openai', OPENAI_PROPOSAL_MODEL: 'gpt-5.6-terra', OPENAI_CONVERSION_MODEL: 'gpt-5.6-luna', OPENAI_TIMEOUT_MS: 60_000 })
  })
})
