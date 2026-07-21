import { describe, expect, it } from 'vitest'
import { MockAiProposalProvider } from './mock-ai-proposal.provider.js'
import { proposalInputSchema } from './ai.schemas.js'
import { aiPlanningProposalSchema, planningTurnSchema } from '../../../shared/ai-proposal-contract/index.js'

const input = (goal: string, overrides: Record<string, unknown> = {}) => proposalInputSchema.parse({
  clientRequestId: '11111111-1111-4111-8111-111111111111', goal, preferredLanguage: 'en', constraints: [], nonNegotiables: [], locale: 'en', planIntensity: 'balanced', ...overrides,
})
const context = (language: 'EN'|'ES') => ({ language, correlationId: 'stable', signal: new AbortController().signal })

describe('deterministic conversational mock AI provider', () => {
  const provider = new MockAiProposalProvider()

  it('asks the business type for a vague business request', async () => {
    const result = await provider.planningTurn(input('I want to open a business'), context('EN'))
    const turn = planningTurnSchema.parse(result.turn)
    expect(turn).toMatchObject({ action: 'ASK', question: 'What type of business do you want to open?', language: 'en' })
  })

  it('asks naturally in Spanish', async () => {
    const result = await provider.planningTurn(input('Quiero abrir un negocio', { preferredLanguage: 'es', locale: 'es' }), context('ES'))
    expect(planningTurnSchema.parse(result.turn)).toMatchObject({ action: 'ASK', question: '¿Qué tipo de negocio quieres abrir?', language: 'es' })
  })

  it('does not ask again for duration and budget supplied by controls', async () => {
    const result = await provider.planningTurn(input('I want to open a coffee shop', { durationMonths: 12, monthlyBudget: 1_250, currency: 'USD' }), context('EN'))
    expect(planningTurnSchema.parse(result.turn).action).toBe('PROPOSE')
  })

  it('proposes immediately for a detailed request', async () => {
    const result = await provider.planningTurn(input('I want to open a coffee shop in Dallas within 12 months, with a $15,000 budget, while keeping my full-time job.'), context('EN'))
    const turn = planningTurnSchema.parse(result.turn)
    expect(turn.action).toBe('PROPOSE')
    if (turn.action === 'PROPOSE') expect(aiPlanningProposalSchema.parse(turn.proposal).title).toContain('coffee shop')
  })

  it('proposes after three questions or when assumptions are requested', async () => {
    expect(planningTurnSchema.parse((await provider.planningTurn(input('I want to open a business', { clarificationCount: 3 }), context('EN'))).turn).action).toBe('PROPOSE')
    expect(planningTurnSchema.parse((await provider.planningTurn(input('I want to open a business', { continueWithAssumptions: true }), context('EN'))).turn).action).toBe('PROPOSE')
  })

  it('supports deterministic refinements', async () => {
    const generated = planningTurnSchema.parse((await provider.planningTurn(input('Open a coffee shop in 12 months with $15,000'), context('EN'))).turn)
    if (generated.action !== 'PROPOSE') throw new Error('Expected proposal')
    const refined = planningTurnSchema.parse((await provider.refineProposal(generated.proposal, 'Reduce the budget', context('EN'))).turn)
    expect(refined.action).toBe('PROPOSE')
    if (refined.action === 'PROPOSE') expect(refined.proposal.budgetGuidance).toContain('free')
  })

  it('forces timeout, invalid output, failure, and honors cancellation', async () => {
    await expect(provider.planningTurn(input('[mock:timeout]'), context('EN'))).rejects.toMatchObject({ name: 'AbortError' })
    expect((await provider.planningTurn(input('[mock:invalid]'), context('EN'))).turn).toEqual({ invalid: true })
    await expect(provider.planningTurn(input('[mock:failure]'), context('EN'))).rejects.toBeTruthy()
    const controller = new AbortController(); controller.abort()
    await expect(provider.planningTurn(input('Career'), { ...context('EN'), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
