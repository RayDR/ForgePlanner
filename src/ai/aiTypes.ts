import type { AiPlanningProposal } from '../../shared/ai-proposal-contract/index.js'
export type AiProposalStatus = 'PENDING' | 'PROPOSED' | 'REFINING' | 'READY_FOR_CONVERSION' | 'REJECTED' | 'FAILED' | 'EXPIRED'
export interface AiOperationDto { id: string; status: AiProposalStatus; selectedLanguage: 'EN' | 'ES'; detectedLanguage?: 'EN' | 'ES' | 'MIXED' | 'UNKNOWN'; currentProposalRevision: number | null; readyProposalRevision: number | null; refinementCount?: number; createdAt?: string; updatedAt?: string; expiresAt: string; title?: string | null }
export interface AiProposalResult { operation: AiOperationDto; proposal: AiPlanningProposal | null; signedProposalToken?: string }
export interface GuestProposalRecord extends AiProposalResult { proposal: AiPlanningProposal; signedProposalToken: string }
