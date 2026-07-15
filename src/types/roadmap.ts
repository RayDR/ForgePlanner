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

export interface CategoryMeta {
  key: string
  label: string
  tone: 'slate' | 'blue' | 'green' | 'amber' | 'rose'
  isDefault?: boolean
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
  weight?: number
}

export interface Comment {
  id: string
  author: string
  message: string
  createdAt: string
}

export interface ActivityStatusDefinition {
  id: string
  label: string
  colorKey: ActivityColorKey
  order: number
  isDefault?: boolean
}

export interface ActivityHistoryEntry {
  id: string
  activityId: string
  type:
    | 'created'
    | 'edited'
    | 'status-changed'
    | 'monthly-entry-updated'
    | 'month-changed'
    | 'skipped'
    | 'paused'
    | 'resumed'
    | 'dependency-blocked-move'
    | 'subtask-created'
    | 'subtask-updated'
    | 'subtask-completed'
    | 'subtask-deleted'
    | 'subtask-reordered'
    | 'comment-added'
    | 'comment-deleted'
    | 'deleted'
    | 'restored'
  message: string
  occurredAt: string
  monthId?: string
}

export interface ActivityRelationship {
  id: string
  sourceActivityId: string
  targetActivityId: string
  type: 'linked' | 'dependency' | 'sequence'
  relationshipMode: RelationshipMode
}

export interface MonthlyActivityEntry {
  monthId: string
  status: MonthlyActivityStatus
  progress: number
  estimatedHours?: number
  actualHours?: number
  notes?: string
  isSkipped?: boolean
  isPaused?: boolean
  resumedFromMonthId?: string
  continuedFromMonthId?: string
  savingsImpact?: number
  budgetImpact?: number
}

export interface Goal {
  id: string
  title: string
  description: string
  targetDate: string
  category: CategoryKey
}

export interface Milestone {
  id: string
  title: string
  monthId: string
  category: CategoryKey
  activityId?: string
}

export interface MonthlySavingsEntry {
  monthId: string
  target: number
  actual: number
  notes?: string
  updatedAt?: string
}

export interface SavingsPlan {
  currency: 'USD' | 'CAD'
  enabled?: boolean
  mode?: 'free' | 'monthly-target'
  defaultMonthlyTarget?: number
  targetTotal: number
  monthlyEntries: MonthlySavingsEntry[]
}

export interface Activity {
  id: string
  title: string
  description: string
  category: string
  sequenceNumber?: number
  recurrence?: ActivityRecurrence
  priority: ActivityPriority
  relationshipMode: RelationshipMode
  startDate: string
  endDate?: string
  estimatedHours?: number
  parentGoalId?: string
  linkedActivityIds: string[]
  dependencyIds: string[]
  sequenceGroupId?: string
  milestone: boolean
  colorKey: ActivityColorKey
  statusId: string
  progressMode?: 'completion' | 'weighted'
  budgetImpact?: number
  savingsImpact?: number
  notes: string
  subtasks: Subtask[]
  comments: Comment[]
  history: ActivityHistoryEntry[]
  monthlyEntries: Record<string, MonthlyActivityEntry>
}

export interface ActivityTrashItem {
  activity: Activity
  deletedAt: string
  expiresAt: string
}

export interface Project {
  id: string
  name: string
  objective: string
  startDate: string
  plannedStartDate?: string
  endDate: string
  plannedEndDate: string
  actualEndDate?: string
  completedAt?: string
  selectedYear: number
  goals: Goal[]
  milestones: Milestone[]
  statusDefinitions: ActivityStatusDefinition[]
  categoryDefinitions?: CategoryMeta[]
  savingsPlan: SavingsPlan
}

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
