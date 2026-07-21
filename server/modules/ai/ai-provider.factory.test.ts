import { describe, expect, it } from 'vitest'
import { loadEnv } from '../../config/env.js'
import { createAiProposalProvider } from './ai-provider.factory.js'

const base = { DATABASE_URL: 'postgresql://test', APP_ORIGIN: 'https://planner.example.com' }

describe('AI provider selection', () => {
  it('keeps the deterministic mock when OpenAI is not configured', () => {
    expect(createAiProposalProvider(loadEnv(base))).toMatchObject({ name: 'mock', model: 'deterministic-conversation-v1' })
  })

  it('constructs the OpenAI boundary only from backend configuration', () => {
    const provider = createAiProposalProvider(loadEnv({ ...base, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-key-that-stays-on-the-server', OPENAI_PROPOSAL_MODEL: 'gpt-5.6-sol' }))
    expect(provider).toMatchObject({ name: 'openai', model: 'gpt-5.6-sol' })
  })
})
