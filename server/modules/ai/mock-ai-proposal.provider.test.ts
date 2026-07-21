import { describe, expect, it } from 'vitest'
import { MockAiProposalProvider } from './mock-ai-proposal.provider.js'
import { proposalInputSchema } from './ai.schemas.js'
import { aiPlanningProposalSchema } from '../../../shared/ai-proposal-contract/index.js'

const input = (goal: string, preferredLanguage: 'en'|'es' = 'en') => proposalInputSchema.parse({ clientRequestId: '11111111-1111-4111-8111-111111111111', goal, preferredLanguage, constraints: [], nonNegotiables: [], locale: preferredLanguage, planIntensity: 'balanced' })
describe('deterministic mock AI provider', () => {
  const provider = new MockAiProposalProvider(); const context = (language: 'EN'|'ES') => ({ language, correlationId: 'stable', signal: new AbortController().signal })
  it.each([['EN','Improve my career'],['ES','Mejorar mi carrera']] as const)('returns valid %s and factual null usage', async (language, goal) => { const result = await provider.generateProposal(input(goal, language.toLowerCase() as 'en'|'es'), context(language)); expect(aiPlanningProposalSchema.parse(result.proposal)).toBeTruthy(); expect(result).toMatchObject({ inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null }) })
  it('supports deterministic refinements', async () => { const initial = (await provider.generateProposal(input('Career'), context('EN'))).proposal; const refined = await provider.refineProposal(aiPlanningProposalSchema.parse(initial), 'Reduce the budget', context('EN')); expect(aiPlanningProposalSchema.parse(refined.proposal).budgetGuidance).toContain('free') })
  it('forces timeout, invalid output and failure', async () => { await expect(provider.generateProposal(input('[mock:timeout]'), context('EN'))).rejects.toMatchObject({ name: 'AbortError' }); expect((await provider.generateProposal(input('[mock:invalid]'), context('EN'))).proposal).toEqual({ invalid: true }); await expect(provider.generateProposal(input('[mock:failure]'), context('EN'))).rejects.toBeTruthy() })
  it('honors cancellation', async () => { const controller = new AbortController(); controller.abort(); await expect(provider.generateProposal(input('Career'), { ...context('EN'), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }) })
})
