import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import type { ProposalInput } from './ai.schemas.js'

export type ProviderContext = { language: 'EN' | 'ES'; correlationId: string; signal: AbortSignal }
export type ProviderResult = { proposal: unknown; providerRequestId: string | null; inputTokenCount: null; outputTokenCount: null; estimatedCostMicros: null }
export interface AiProposalProvider {
  readonly name: string
  readonly model: string
  generateProposal(input: ProposalInput, context: ProviderContext): Promise<ProviderResult>
  refineProposal(current: AiPlanningProposal, instruction: string, context: ProviderContext): Promise<ProviderResult>
}
