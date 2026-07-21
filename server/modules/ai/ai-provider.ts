import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import type { PlanningInput } from './ai.schemas.js'

export type ProviderContext = { language: 'EN' | 'ES'; correlationId: string; signal: AbortSignal }
export type ProviderResult = { turn: unknown; providerRequestId: string | null; inputTokenCount: number | null; outputTokenCount: number | null; estimatedCostMicros: null }
export interface AiProposalProvider {
  readonly name: string
  readonly model: string
  planningTurn(input: PlanningInput, context: ProviderContext): Promise<ProviderResult>
  refineProposal(current: AiPlanningProposal, instruction: string, context: ProviderContext): Promise<ProviderResult>
}
