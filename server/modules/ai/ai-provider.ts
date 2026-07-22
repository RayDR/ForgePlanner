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

export function isAiProviderTimeout(error: unknown) {
  return error instanceof Error && (
    ['AbortError', 'APIConnectionTimeoutError', 'APIUserAbortError'].includes(error.name)
    || ['Request timed out.', 'Request was aborted.'].includes(error.message)
  )
}

type ProviderHttpError = Error & {
  status?: unknown
  code?: unknown
  error?: { type?: unknown } | null
}

function providerHttpError(error: unknown): ProviderHttpError | null {
  return error instanceof Error ? error as ProviderHttpError : null
}

export function isAiProviderRateLimit(error: unknown) {
  return providerHttpError(error)?.status === 429
}

/**
 * Returns only allow-listed transport metadata. Provider messages and request
 * bodies can contain user content, so they must never be copied into logs.
 */
export function safeAiProviderRequestReason(error: unknown) {
  const candidate = providerHttpError(error)
  if (!candidate) return 'unknown'
  const status = typeof candidate.status === 'number' ? candidate.status : null
  const code = typeof candidate.code === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(candidate.code)
    ? candidate.code
    : null
  const type = typeof candidate.error?.type === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(candidate.error.type)
    ? candidate.error.type
    : null
  return [status ? `http_${status}` : null, code, type, candidate.name].filter(Boolean).join(':') || 'unknown'
}

export type ValidatedPlanConversionResult = Omit<PlanConversionResult, 'plan'> & { plan: CanonicalPlan }

export class AiProviderOutputError extends Error {
  constructor(
    public readonly safeCode: 'AI_PROVIDER_INCOMPLETE' | 'AI_PROVIDER_REFUSAL' | 'AI_PROVIDER_INVALID_JSON',
    public readonly safeReason: string | null = null,
  ) {
    super(safeCode)
    this.name = 'AiProviderOutputError'
  }
}
