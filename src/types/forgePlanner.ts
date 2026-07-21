import type { CanonicalPlan } from '../../shared/plan-contract/index.js'

export type PlanTemplateKey =
  | 'blank'
  | 'career-roadmap'
  | 'certification-plan'
  | 'savings-goal'
  | 'health-lifestyle'
  | 'immigration-plan'

export type PlanningMode = 'monthly' | 'annual' | 'auto'
export type MonthlyViewPreference = 'list' | 'kanban'

export interface ForgePlan {
  id: string
  remoteId?: string
  remoteAccess?: 'owner' | 'editor' | 'viewer'
  remoteRevision?: number
  remoteSharingEnabled?: boolean
  remoteLinkId?: string
  title: string
  description: string
  startDate: string
  endDate: string
  planningMode: PlanningMode
  templateKey?: PlanTemplateKey
  categories: string[]
  monthlyViewPreference: MonthlyViewPreference
  snapshot: CanonicalPlan
  createdAt: string
  updatedAt: string
}

export interface DeletedPlanRecord {
  id: string
  plan: ForgePlan
  deletedAt: string
  expiresAt: string
}

export interface ServerTrashPlan {
  id: string
  remoteId: string
  remoteRevision: number
  remoteSharingEnabled: boolean
  title: string
  description: string
  startDate: string
  endDate: string
  deletedAt: string
  purgeAfter: string
  restoreEligible: boolean
}

export interface PlanSyncMetadata {
  state: 'local' | 'saving' | 'deleting' | 'synced' | 'failed' | 'offline' | 'conflict'
  clientMutationId?: string
  error?: { code: string; message: string }
}

export interface ForgePlannerState {
  schemaVersion: number
  activePlanId?: string
  plans: ForgePlan[]
  archivedPlanIds: string[]
  hiddenPlanIds: string[]
  deletedPlans: DeletedPlanRecord[]
  syncByPlanId: Record<string, PlanSyncMetadata>
}
