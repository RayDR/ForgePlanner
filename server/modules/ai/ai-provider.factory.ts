import type { AppEnv } from '../../config/env.js'
import type { AiProposalProvider } from './ai-provider.js'
import { MockAiProposalProvider } from './mock-ai-proposal.provider.js'
import { OpenAiProposalProvider } from './openai-ai-proposal.provider.js'

export function createAiProposalProvider(env: AppEnv): AiProposalProvider {
  return env.AI_PROVIDER === 'openai' ? new OpenAiProposalProvider(env) : new MockAiProposalProvider()
}
