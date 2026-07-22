import type { AiPlanningProposal, PlanningTurn } from '../../shared/ai-proposal-contract/index.js'
import type { CanonicalPlan } from '../../shared/plan-contract/index.js'
export type AiProposalStatus = 'PENDING' | 'PROPOSED' | 'REFINING' | 'READY_FOR_CONVERSION' | 'CONVERTING' | 'PLAN_PREVIEW_READY' | 'CONVERSION_FAILED' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'EXPIRED'
export interface AiOperationDto { id: string; status: AiProposalStatus; selectedLanguage: 'EN' | 'ES'; detectedLanguage?: 'EN' | 'ES' | 'MIXED' | 'UNKNOWN'; currentProposalRevision: number | null; readyProposalRevision: number | null; refinementCount?: number; createdAt?: string; updatedAt?: string; expiresAt: string; title?: string | null }
export interface AiProposalResult { operation: AiOperationDto; proposal: AiPlanningProposal | null; signedProposalToken?: string }
export interface GuestProposalRecord extends AiProposalResult { proposal: AiPlanningProposal; signedProposalToken: string }
export type AiPlanningTurnResult = { turn: PlanningTurn; operation?: AiOperationDto; proposal?: AiPlanningProposal | null; signedProposalToken?: string }
export interface AiPlanPreview { checksum: string; title: string; objective: string; startDate: string; endDate: string; goalsCount: number; milestonesCount: number; activitiesCount: number; planningMode: 'monthly' | 'annual' | 'auto'; savingsEnabled: boolean; assumptions: string[]; warnings: string[] }
export interface AiConversionResult { status: AiProposalStatus; preview: AiPlanPreview | null; regenerationCount?: number; plan?: CanonicalPlan; signedConversionToken?: string }

export type AiConversationMessage =
  | { id: string; role: 'user' | 'assistant'; kind: 'text'; content: string }
  | { id: string; role: 'assistant'; kind: 'proposal'; proposal: AiPlanningProposal; revision: number; operationId: string }
