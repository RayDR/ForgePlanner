export type AiScope = 'focused' | 'balanced' | 'comprehensive'
export type AiComplexity = 'simple' | 'moderate' | 'advanced'
export type AiDetail = 'overview' | 'detailed' | 'step-by-step'
export type AiFinancialMode = 'none' | 'budget' | 'savings'

export interface AiComposerContext {
  scope: AiScope
  durationMonths: number | null
  complexity: AiComplexity
  detail: AiDetail
  hoursPerWeek: number | null
  financialMode: AiFinancialMode
  financialAmount: number | null
  currency: 'USD' | 'MXN' | 'CAD' | 'EUR' | 'GBP'
}

export const defaultAiComposerContext: AiComposerContext = { scope: 'balanced', durationMonths: null, complexity: 'moderate', detail: 'detailed', hoursPerWeek: null, financialMode: 'none', financialAmount: null, currency: 'USD' }

export function buildProposalInput(goal: string, context: AiComposerContext, locale: 'en' | 'es', planning?: {
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>
  clarificationCount?: number
  continueWithAssumptions?: boolean
  preferredLanguage?: 'en' | 'es'
}) {
  const detailText = locale === 'es' ? `Nivel de detalle solicitado: ${context.detail}.` : `Requested detail level: ${context.detail}.`
  const savingsText = context.financialMode === 'savings' && context.financialAmount != null ? (locale === 'es' ? `Meta de ahorro: ${context.financialAmount} ${context.currency}.` : `Savings goal: ${context.financialAmount} ${context.currency}.`) : ''
  return {
    clientRequestId: crypto.randomUUID(), goal, additionalContext: [detailText, savingsText].filter(Boolean).join(' '), startDate: null, targetDate: null,
    durationMonths: context.durationMonths, hoursPerWeek: context.hoursPerWeek,
    monthlyBudget: context.financialMode === 'budget' ? context.financialAmount : null,
    currency: context.financialMode === 'none' ? null : context.currency,
    constraints: [], nonNegotiables: [],
    experienceLevel: context.complexity === 'simple' ? 'beginner' as const : context.complexity === 'advanced' ? 'advanced' as const : 'intermediate' as const,
    preferredLanguage: planning?.preferredLanguage ?? locale, planIntensity: context.scope === 'focused' ? 'light' as const : context.scope === 'comprehensive' ? 'ambitious' as const : 'balanced' as const, locale,
    planningScope: context.scope,
    detailLevel: context.detail,
    financialMode: context.financialMode,
    savingsGoal: context.financialMode === 'savings' ? context.financialAmount : null,
    conversation: planning?.conversation ?? [], clarificationCount: planning?.clarificationCount ?? 0, continueWithAssumptions: planning?.continueWithAssumptions ?? false,
  }
}
