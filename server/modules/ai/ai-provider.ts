import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import type { CanonicalPlan } from '../../../shared/plan-contract/index.js'
import type { PlanningInput } from './ai.schemas.js'

export type ProviderContext = { language: 'EN' | 'ES'; correlationId: string; signal: AbortSignal }
export type ProviderResult = { turn: unknown; providerRequestId: string | null; inputTokenCount: number | null; outputTokenCount: number | null; estimatedCostMicros: null }
export type PlanConversionContext = {
  language: 'EN' | 'ES'
  correlationId: string
  signal: AbortSignal
  approvedContext: Record<string, unknown>
  now: string
  repairReason?: string
}
export type PlanConversionResult = { plan: unknown; providerRequestId: string | null; inputTokenCount: number | null; outputTokenCount: number | null; estimatedCostMicros: null }
export interface AiProposalProvider {
  readonly name: string
  readonly model: string
  readonly conversionModel?: string
  planningTurn(input: PlanningInput, context: ProviderContext): Promise<ProviderResult>
  refineProposal(current: AiPlanningProposal, instruction: string, context: ProviderContext): Promise<ProviderResult>
  convertAcceptedProposalToPlan?(proposal: AiPlanningProposal, context: PlanConversionContext): Promise<PlanConversionResult>
}

export type ValidatedPlanConversionResult = Omit<PlanConversionResult, 'plan'> & { plan: CanonicalPlan }
