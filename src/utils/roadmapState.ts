import type {
  Activity,
  ActivityColorKey,
  ActivityHistoryEntry,
  ActivityRelationship,
  ActivityStatusDefinition,
  ActivityTrashItem,
  MonthlyActivityEntry,
  MonthlyActivityStatus,
  MonthlySavingsEntry,
  Project,
  RelationshipMode,
} from '../types/roadmap'
import { getMonthIdsBetween } from './dateUtils'
import {
  computeSavingsPlanTargetTotal,
  createMonthlyEntry,
  ensureActivityDateBounds,
  upsertMonthlyEntry,
} from './roadmapModel'

export interface PendingMonthlyChange {
  sourceActivityId: string
  sourceMonthId: string
  targetMonthId: string
  action: 'continue' | 'resume' | 'copy' | 'add'
  mode: 'soft-linked' | 'locked-sequence'
  suggestedActivityIds: string[]
  message: string
}

export interface MigrationIssue {
  message: string
  backupJson: string
}

export interface PersistedRoadmapState {
  schemaVersion: number
  project: Project
  activities: Activity[]
  trash: ActivityTrashItem[]
  relationships: ActivityRelationship[]
  selectedYear: number
  selectedMonthId: string
  locale: 'en' | 'es'
  theme: 'light' | 'dark'
}

type LegacyActivityStatus = 'not-started' | 'in-progress' | 'blocked' | 'completed' | 'deferred'

export const ACTIVITY_COLOR_KEYS: ActivityColorKey[] = ['slate', 'blue', 'green', 'amber', 'rose']

export const DEFAULT_PROJECT_STATUSES: ActivityStatusDefinition[] = [
  { id: 'planned', label: 'Planned', colorKey: 'slate', order: 0, isDefault: true },
  { id: 'in-progress', label: 'In Progress', colorKey: 'blue', order: 1, isDefault: true },
  { id: 'paused', label: 'Paused', colorKey: 'amber', order: 2, isDefault: true },
  { id: 'blocked', label: 'Blocked', colorKey: 'rose', order: 3, isDefault: true },
  { id: 'done', label: 'Done', colorKey: 'green', order: 4, isDefault: true },
]

interface LegacyMonthlyPlan {
  monthId: string
  progress: number
  status: LegacyActivityStatus
  isDeferred: boolean
  movedFromMonthId?: string
  estimatedHours?: number
  savingsImpact?: number
  budgetImpact?: number
}

interface LegacyActivityMovement {
  id: string
  fromMonthId: string | null
  toMonthId: string
  movedAt: string
  reason?: string
}

interface LegacySavingsEntry {
  monthId: string
  projected: number
  actual: number
}

interface LegacyProject {
  id: string
  name: string
  objective: string
  startDate: string
  endDate: string
  plannedEndDate?: string
  actualEndDate?: string
  completedAt?: string
  selectedYear: number
  goals: Project['goals']
  milestones: Project['milestones']
  savingsPlan: LegacySavingsEntry[]
}

interface LegacyActivity {
  id: string
  title: string
  description: string
  category: Activity['category']
  status: LegacyActivityStatus
  priority: Activity['priority']
  relationshipMode: Activity['relationshipMode']
  startDate: string
  endDate: string
  targetMonth: string
  estimatedHours?: number
  parentGoalId?: string
  linkedActivityIds: string[]
  dependencyIds: string[]
  sequenceGroupId?: string
  milestone: boolean
  budgetImpact?: number
  savingsImpact?: number
  notes: string
  subtasks: Activity['subtasks']
  comments: Activity['comments']
  monthlyPlans: Record<string, LegacyMonthlyPlan>
  moveHistory: LegacyActivityMovement[]
}

interface LegacyPersistedRoadmapState {
  version?: number
  project: LegacyProject
  activities: LegacyActivity[]
  relationships: ActivityRelationship[]
  selectedYear: number
  selectedMonthId: string
  locale?: 'en' | 'es'
  theme?: 'light' | 'dark'
}

function mapLegacyStatus(status: LegacyActivityStatus): MonthlyActivityStatus {
  switch (status) {
    case 'not-started':
      return 'planned'
    case 'in-progress':
      return 'in-progress'
    case 'blocked':
      return 'paused'
    case 'completed':
      return 'completed'
    case 'deferred':
      return 'skipped'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function isValidNewPersistedState(candidate: unknown): candidate is PersistedRoadmapState {
  if (!isRecord(candidate)) {
    return false
  }

  const project = candidate.project
  return (
    typeof candidate.schemaVersion === 'number' &&
    isRecord(project) &&
    typeof project.startDate === 'string' &&
    typeof project.endDate === 'string' &&
    Array.isArray(project.goals) &&
    Array.isArray(project.milestones) &&
    isRecord(project.savingsPlan) &&
    Array.isArray((project.savingsPlan as Record<string, unknown>).monthlyEntries) &&
    Array.isArray(candidate.activities) &&
    (candidate.trash === undefined || Array.isArray(candidate.trash)) &&
    Array.isArray(candidate.relationships) &&
    typeof candidate.selectedYear === 'number' &&
    typeof candidate.selectedMonthId === 'string'
  )
}

export function isValidLegacyPersistedState(candidate: unknown): candidate is LegacyPersistedRoadmapState {
  if (!isRecord(candidate)) {
    return false
  }

  const project = candidate.project
  return (
    isRecord(project) &&
    typeof project.startDate === 'string' &&
    typeof project.endDate === 'string' &&
    Array.isArray(project.goals) &&
    Array.isArray(project.milestones) &&
    Array.isArray(project.savingsPlan) &&
    Array.isArray(candidate.activities) &&
    Array.isArray(candidate.relationships) &&
    typeof candidate.selectedYear === 'number' &&
    typeof candidate.selectedMonthId === 'string'
  )
}

function migrateLegacyMonthlyEntries(activity: LegacyActivity) {
  const monthlyEntries: Record<string, MonthlyActivityEntry> = {}

  for (const [monthId, plan] of Object.entries(activity.monthlyPlans ?? {})) {
    monthlyEntries[monthId] = createMonthlyEntry(monthId, mapLegacyStatus(plan.status), {
      progress: plan.progress,
      estimatedHours: plan.estimatedHours ?? activity.estimatedHours,
      savingsImpact: plan.savingsImpact ?? activity.savingsImpact,
      budgetImpact: plan.budgetImpact ?? activity.budgetImpact,
      continuedFromMonthId: plan.movedFromMonthId,
      isSkipped: plan.status === 'deferred',
      isPaused: plan.status === 'blocked',
    })
  }

  if (!Object.keys(monthlyEntries).length) {
    monthlyEntries[activity.targetMonth] = createMonthlyEntry(activity.targetMonth, mapLegacyStatus(activity.status), {
      estimatedHours: activity.estimatedHours,
      savingsImpact: activity.savingsImpact,
      budgetImpact: activity.budgetImpact,
    })
  }

  for (const entry of activity.moveHistory ?? []) {
    if (entry.fromMonthId) {
      monthlyEntries[entry.fromMonthId] = createMonthlyEntry(entry.fromMonthId, 'skipped', {
        ...monthlyEntries[entry.fromMonthId],
        monthId: entry.fromMonthId,
        notes: entry.reason,
        isSkipped: true,
      })
    }

    monthlyEntries[entry.toMonthId] = createMonthlyEntry(entry.toMonthId, 'continued', {
      ...monthlyEntries[entry.toMonthId],
      monthId: entry.toMonthId,
      continuedFromMonthId: entry.fromMonthId ?? undefined,
      notes: entry.reason,
    })
  }

  return monthlyEntries
}

function mapLegacyActivityStatusId(status: LegacyActivityStatus): string {
  switch (status) {
    case 'in-progress':
      return 'in-progress'
    case 'blocked':
      return 'blocked'
    case 'completed':
      return 'done'
    case 'deferred':
      return 'blocked'
    case 'not-started':
    default:
      return 'planned'
  }
}

function mapCategoryToColor(category: Activity['category']): ActivityColorKey {
  if (category === 'savings' || category === 'health' || category === 'family-lifestyle' || category === 'portfolio') {
    return 'green'
  }

  if (category === 'english' || category === 'certifications') {
    return 'amber'
  }

  if (category === 'risk-catchup') {
    return 'rose'
  }

  if (category === 'immigration' || category === 'ai-llms' || category === 'aws-cloud') {
    return 'blue'
  }

  return 'slate'
}

export function migrateLegacyActivity(activity: LegacyActivity): Activity {
  const legacyMoveEvents = (activity.moveHistory ?? []).map((entry) => ({
    id: crypto.randomUUID(),
    activityId: activity.id,
    type: 'month-changed' as const,
    message: `Legacy move from ${entry.fromMonthId ?? 'none'} to ${entry.toMonthId}`,
    occurredAt: entry.movedAt,
    monthId: entry.toMonthId,
  }))

  return ensureActivityDateBounds({
    id: activity.id,
    title: activity.title,
    description: activity.description,
    category: activity.category,
    priority: activity.priority,
    relationshipMode: activity.relationshipMode,
    startDate: activity.startDate,
    endDate: activity.endDate,
    estimatedHours: activity.estimatedHours,
    parentGoalId: activity.parentGoalId,
    linkedActivityIds: activity.linkedActivityIds,
    dependencyIds: activity.dependencyIds,
    sequenceGroupId: activity.sequenceGroupId,
    milestone: activity.milestone,
    colorKey: mapCategoryToColor(activity.category),
    statusId: mapLegacyActivityStatusId(activity.status),
    budgetImpact: activity.budgetImpact,
    savingsImpact: activity.savingsImpact,
    notes: activity.notes,
    subtasks: activity.subtasks,
    comments: activity.comments,
    history: [
      {
        id: crypto.randomUUID(),
        activityId: activity.id,
        type: 'created',
        message: 'Migrated from previous schema',
        occurredAt: new Date().toISOString(),
      },
      ...legacyMoveEvents,
    ],
    monthlyEntries: migrateLegacyMonthlyEntries(activity),
  })
}

export function migrateLegacyPersistedState(
  candidate: LegacyPersistedRoadmapState,
  schemaVersion: number,
): PersistedRoadmapState {
  const monthlySavingsEntries: MonthlySavingsEntry[] = candidate.project.savingsPlan.map((entry) => ({
    monthId: entry.monthId,
    target: entry.projected,
    actual: entry.actual,
  }))

  return {
    schemaVersion,
    project: {
      ...candidate.project,
      statusDefinitions: DEFAULT_PROJECT_STATUSES,
      plannedEndDate: candidate.project.plannedEndDate ?? candidate.project.endDate,
      actualEndDate: candidate.project.actualEndDate ?? candidate.project.endDate,
      savingsPlan: {
        currency: 'USD',
        targetTotal: computeSavingsPlanTargetTotal(monthlySavingsEntries),
        monthlyEntries: monthlySavingsEntries,
      },
    },
    activities: candidate.activities.map(migrateLegacyActivity),
    trash: [],
    relationships: candidate.relationships,
    selectedYear: candidate.selectedYear,
    selectedMonthId: candidate.selectedMonthId,
    locale: candidate.locale === 'en' ? 'en' : 'es',
    theme: candidate.theme === 'dark' ? 'dark' : 'light',
  }
}

export function appendActivityHistory(
  activity: Activity,
  entry: Omit<ActivityHistoryEntry, 'id' | 'occurredAt' | 'activityId'> & { monthId?: string },
) {
  return {
    ...activity,
    history: [
      ...activity.history,
      {
        id: crypto.randomUUID(),
        activityId: activity.id,
        occurredAt: new Date().toISOString(),
        ...entry,
      },
    ],
  }
}

export function applyAddMonthlyEntry(activity: Activity, monthId: string, status: MonthlyActivityStatus = 'planned') {
  return ensureActivityDateBounds(
    upsertMonthlyEntry(activity, monthId, status, {
      estimatedHours: activity.estimatedHours,
      savingsImpact: activity.savingsImpact,
      budgetImpact: activity.budgetImpact,
    }),
  )
}

export function applyContinueToMonth(activity: Activity, sourceMonthId: string, targetMonthId: string) {
  const months = getMonthIdsBetween(`${sourceMonthId}-01`, `${targetMonthId}-01`)
  let nextActivity = activity

  for (const skippedMonthId of months.slice(1, -1)) {
    nextActivity = upsertMonthlyEntry(nextActivity, skippedMonthId, 'skipped', {
      isSkipped: true,
      estimatedHours: nextActivity.estimatedHours,
    })
  }

  nextActivity = upsertMonthlyEntry(nextActivity, targetMonthId, 'continued', {
    continuedFromMonthId: sourceMonthId,
    estimatedHours: nextActivity.estimatedHours,
    savingsImpact: nextActivity.savingsImpact,
    budgetImpact: nextActivity.budgetImpact,
  })

  return ensureActivityDateBounds(nextActivity)
}

export function applySkipMonth(activity: Activity, monthId: string, nextMonthId?: string) {
  let nextActivity = upsertMonthlyEntry(activity, monthId, 'skipped', {
    isSkipped: true,
  })

  if (nextMonthId && nextMonthId !== monthId) {
    nextActivity = applyContinueToMonth(nextActivity, monthId, nextMonthId)
  }

  return ensureActivityDateBounds(nextActivity)
}

export function applyPauseMonth(activity: Activity, monthId: string) {
  return ensureActivityDateBounds(
    upsertMonthlyEntry(activity, monthId, 'paused', {
      isPaused: true,
    }),
  )
}

export function applyResumeInMonth(activity: Activity, sourceMonthId: string, targetMonthId: string) {
  const paused = applyPauseMonth(activity, sourceMonthId)
  return ensureActivityDateBounds(
    upsertMonthlyEntry(paused, targetMonthId, 'resumed', {
      resumedFromMonthId: sourceMonthId,
      estimatedHours: paused.estimatedHours,
      savingsImpact: paused.savingsImpact,
      budgetImpact: paused.budgetImpact,
    }),
  )
}

export function applyCompleteMonth(activity: Activity, monthId: string) {
  return ensureActivityDateBounds(
    upsertMonthlyEntry(activity, monthId, 'completed', {
      progress: 100,
    }),
  )
}

export function applyCancelMonth(activity: Activity, monthId: string) {
  return ensureActivityDateBounds(
    upsertMonthlyEntry(activity, monthId, 'cancelled', {
      progress: 0,
    }),
  )
}

export function applyCopyMonthlyStructure(activity: Activity, sourceMonthId: string, targetMonthId: string) {
  const source = activity.monthlyEntries[sourceMonthId]

  if (!source) {
    return activity
  }

  return ensureActivityDateBounds(
    upsertMonthlyEntry(activity, targetMonthId, source.status, {
      ...source,
      monthId: targetMonthId,
    }),
  )
}

export function getSequenceGroupActivities(activities: Activity[], sequenceGroupId?: string) {
  if (!sequenceGroupId) {
    return []
  }

  return activities.filter((activity) => activity.sequenceGroupId === sequenceGroupId).map((activity) => activity.id)
}

export function createPendingMonthlyChange(
  activities: Activity[],
  source: Activity,
  sourceMonthId: string,
  targetMonthId: string,
  action: PendingMonthlyChange['action'],
): PendingMonthlyChange | null {
  if (source.relationshipMode === 'independent') {
    return null
  }

  if (source.relationshipMode === 'soft-linked') {
    return {
      sourceActivityId: source.id,
      sourceMonthId,
      targetMonthId,
      action,
      mode: 'soft-linked',
      suggestedActivityIds: [source.id, ...source.linkedActivityIds],
      message:
        'This activity is related to another global activity. Do you also want to adjust its monthly target?',
    }
  }

  return {
    sourceActivityId: source.id,
    sourceMonthId,
    targetMonthId,
    action,
    mode: 'locked-sequence',
    suggestedActivityIds: getSequenceGroupActivities(activities, source.sequenceGroupId),
    message: 'This activity belongs to a locked sequence. Confirm before adjusting the sequence timeline.',
  }
}

function applyActionByType(
  activity: Activity,
  action: PendingMonthlyChange['action'],
  sourceMonthId: string,
  targetMonthId: string,
) {
  switch (action) {
    case 'continue':
      return applyContinueToMonth(activity, sourceMonthId, targetMonthId)
    case 'resume':
      return applyResumeInMonth(activity, sourceMonthId, targetMonthId)
    case 'copy':
      return applyCopyMonthlyStructure(activity, sourceMonthId, targetMonthId)
    case 'add':
      return applyAddMonthlyEntry(activity, targetMonthId)
  }
}

export function applyPendingMonthlyChange(
  activities: Activity[],
  pendingChange: PendingMonthlyChange,
  includeSuggested: boolean,
) {
  const selectedIds = includeSuggested
    ? pendingChange.suggestedActivityIds
    : [pendingChange.sourceActivityId]

  return activities.map((activity) =>
    selectedIds.includes(activity.id)
      ? applyActionByType(activity, pendingChange.action, pendingChange.sourceMonthId, pendingChange.targetMonthId)
      : activity,
  )
}

export function updateMonthlyEntry(
  activity: Activity,
  monthId: string,
  updates: Partial<MonthlyActivityEntry> & { status?: MonthlyActivityStatus },
) {
  const currentStatus = updates.status ?? activity.monthlyEntries[monthId]?.status ?? 'planned'
  return ensureActivityDateBounds(upsertMonthlyEntry(activity, monthId, currentStatus, updates))
}

export function updateProjectSavingsEntry(project: Project, entry: MonthlySavingsEntry): Project {
  const monthlyEntries = [...project.savingsPlan.monthlyEntries.filter((item) => item.monthId !== entry.monthId), entry]
    .sort((left, right) => left.monthId.localeCompare(right.monthId))

  return {
    ...project,
    savingsPlan: {
      ...project.savingsPlan,
      monthlyEntries,
      targetTotal: computeSavingsPlanTargetTotal(monthlyEntries),
    },
  }
}

export function deriveRelationshipsFromActivities(activities: Activity[]) {
  const relationships: ActivityRelationship[] = []
  const seen = new Set<string>()

  const pushRelationship = (
    id: string,
    sourceActivityId: string,
    targetActivityId: string,
    type: ActivityRelationship['type'],
    relationshipMode: RelationshipMode,
  ) => {
    const key = `${sourceActivityId}:${targetActivityId}:${type}`
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    relationships.push({
      id,
      sourceActivityId,
      targetActivityId,
      type,
      relationshipMode,
    })
  }

  for (const activity of activities) {
    for (const linkedId of activity.linkedActivityIds) {
      pushRelationship(
        `rel-linked-${activity.id}-${linkedId}`,
        activity.id,
        linkedId,
        'linked',
        activity.relationshipMode === 'independent' ? 'soft-linked' : activity.relationshipMode,
      )
    }

    for (const dependencyId of activity.dependencyIds) {
      pushRelationship(
        `rel-dep-${dependencyId}-${activity.id}`,
        dependencyId,
        activity.id,
        'dependency',
        activity.relationshipMode,
      )
    }
  }

  return relationships
}