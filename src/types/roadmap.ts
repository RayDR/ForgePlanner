export type MonthlyActivityStatus =
  | 'planned'
  | 'in-progress'
  | 'continued'
  | 'paused'
  | 'skipped'
  | 'resumed'
  | 'completed'
  | 'cancelled'

export type ActivityPriority = 'low' | 'medium' | 'high' | 'critical'
export type ActivityColorKey = 'slate' | 'blue' | 'green' | 'amber' | 'rose'

export type RelationshipMode = 'independent' | 'soft-linked' | 'locked-sequence'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'fortnightly' | 'month-start' | 'month-end' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual'

export interface ActivityRecurrence {
  frequency: RecurrenceFrequency
  endDate: string
}

export type CategoryKey =
  | 'immigration'
  | 'savings'
  | 'english'
  | 'eca'
  | 'ai-llms'
  | 'aws-cloud'
  | 'backend'
  | 'portfolio'
  | 'certifications'
  | 'career'
  | 'family-lifestyle'
  | 'health'
  | 'admin'
  | 'risk-catchup'

export type CategoryMeta = PlanCategoryDefinition

export type Subtask = PlanSubtask

export type Comment = PlanComment

export type ActivityStatusDefinition = PlanStatusDefinition

export type ActivityHistoryEntry = PlanActivityHistoryEntry

export type ActivityRelationship = PlanActivityRelationship

export type MonthlyActivityEntry = PlanMonthlyActivityEntry

export type Goal = PlanGoal

export type Milestone = PlanMilestone

export type MonthlySavingsEntry = PlanMonthlySavingsEntry

export type SavingsPlan = PlanSavings

export type Activity = PlanActivity

export type ActivityTrashItem = PlanActivityTrashItem

export type Project = PlanProject

export interface MonthBucket {
  id: string
  year: number
  monthIndex: number
  shortLabel: string
  longLabel: string
  startDate: string
  endDate: string
  active: boolean
}

export interface ActivityDraft {
  title: string
  description: string
  category: string
  priority: ActivityPriority
  relationshipMode: RelationshipMode
  startDate: string
  endDate: string
  firstMonthId: string
  initialStatus: MonthlyActivityStatus
  estimatedHours?: number
  parentGoalId?: string
  dependencyIds: string[]
  linkedActivityIds: string[]
  sequenceGroupId?: string
  milestone: boolean
  budgetImpact?: number
  savingsImpact?: number
  notes: string
  subtasks: string[]
  recurrence?: ActivityRecurrence
}
import type { PlanActivity, PlanActivityHistoryEntry, PlanActivityRelationship, PlanActivityTrashItem, PlanCategoryDefinition, PlanComment, PlanGoal, PlanMilestone, PlanMonthlyActivityEntry, PlanMonthlySavingsEntry, PlanProject, PlanSavings, PlanStatusDefinition, PlanSubtask } from '../../shared/plan-contract/index.js'
