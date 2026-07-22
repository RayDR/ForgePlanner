import { describe, expect, it } from 'vitest'
import { buildProposalInput, type AiComposerContext } from './proposalInput'

describe('AI proposal composer request mapping', () => {
  const context: AiComposerContext = {
    scope: 'comprehensive', durationMonths: 18, complexity: 'advanced', detail: 'step-by-step', hoursPerWeek: 8,
    financialMode: 'budget', financialAmount: 900, currency: 'CAD',
  }

  it('maps every visible planning control into the Stage 6 request', () => {
    const input = buildProposalInput('Launch a business', context, 'en')
    expect(input).toMatchObject({
      goal: 'Launch a business', durationMonths: 18, hoursPerWeek: 8, monthlyBudget: 900, currency: 'CAD',
      experienceLevel: 'advanced', planIntensity: 'ambitious', planningScope: 'comprehensive', detailLevel: 'step-by-step', financialMode: 'budget', savingsGoal: null, preferredLanguage: 'en', locale: 'en',
    })
    expect(input.additionalContext).toContain('step-by-step')
  })

  it('maps savings separately from budget and follows the active UI language', () => {
    const input = buildProposalInput('Ahorrar', { ...context, scope: 'focused', complexity: 'simple', detail: 'overview', financialMode: 'savings', financialAmount: 12000, currency: 'MXN' }, 'es')
    expect(input).toMatchObject({ monthlyBudget: null, currency: 'MXN', experienceLevel: 'beginner', planIntensity: 'light', planningScope: 'focused', detailLevel: 'overview', financialMode: 'savings', savingsGoal: 12000, preferredLanguage: 'es' })
    expect(input.additionalContext).toContain('Meta de ahorro: 12000 MXN')
    expect(input.additionalContext).toContain('overview')
  })
})
