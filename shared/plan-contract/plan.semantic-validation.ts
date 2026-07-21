import type { CanonicalPlan, PlanValidationIssue } from './plan.types.js'
import { PLAN_LIMITS } from './plan.constants.js'

const issue = (path: Array<string | number>, code: string, message: string): PlanValidationIssue => ({ path, code, message, severity: 'error' })
function validDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value }
function unique<T>(items: T[], key: (item: T) => string, path: Array<string | number>, code: string) {
  const seen = new Set<string>(); const issues: PlanValidationIssue[] = []
  items.forEach((item, index) => { const value = key(item); if (seen.has(value)) issues.push(issue([...path, index], code, `Duplicate value: ${value}`)); seen.add(value) })
  return issues
}

export function validatePlanSemantics(plan: CanonicalPlan): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = []
  const project = plan.project
  const dateFields: Array<[string, string | undefined]> = [['startDate', project.startDate], ['plannedStartDate', project.plannedStartDate], ['endDate', project.endDate], ['plannedEndDate', project.plannedEndDate], ['actualEndDate', project.actualEndDate]]
  for (const [field, value] of dateFields) if (value && !validDate(value)) issues.push(issue(['project', field], 'INVALID_DATE', `Invalid calendar date: ${value}`))
  if (project.startDate > project.endDate) issues.push(issue(['project', 'endDate'], 'DATE_ORDER', 'Project end date precedes its start date.'))
  if (project.plannedStartDate && project.plannedStartDate > project.plannedEndDate) issues.push(issue(['project', 'plannedEndDate'], 'DATE_ORDER', 'Planned end date precedes planned start date.'))
  const startYear = Number(project.startDate.slice(0, 4)); const endYear = Number(project.endDate.slice(0, 4))
  const firstMonth = project.startDate.slice(0, 7); const lastMonth = project.endDate.slice(0, 7)
  if (endYear - startYear > PLAN_LIMITS.planYears) issues.push(issue(['project', 'endDate'], 'PLAN_DURATION_EXCEEDED', `Plan duration cannot exceed ${PLAN_LIMITS.planYears} years.`))

  issues.push(...unique(project.goals, (item) => item.id, ['project', 'goals'], 'DUPLICATE_GOAL_ID'))
  issues.push(...unique(project.milestones, (item) => item.id, ['project', 'milestones'], 'DUPLICATE_MILESTONE_ID'))
  issues.push(...unique(project.statusDefinitions, (item) => item.id, ['project', 'statusDefinitions'], 'DUPLICATE_STATUS_ID'))
  issues.push(...unique(project.statusDefinitions, (item) => String(item.order), ['project', 'statusDefinitions'], 'DUPLICATE_STATUS_ORDER'))
  const defaultStatuses = project.statusDefinitions.filter((item) => item.isDefault)
  if (defaultStatuses.length !== 1) issues.push(issue(['project', 'statusDefinitions'], 'STATUS_DEFAULT_COUNT', 'Exactly one status must be the default.'))
  issues.push(...unique(project.categoryDefinitions, (item) => item.key, ['project', 'categoryDefinitions'], 'DUPLICATE_CATEGORY_ID'))
  const defaults = project.categoryDefinitions.filter((item) => item.isDefault)
  if (defaults.length !== 1) issues.push(issue(['project', 'categoryDefinitions'], 'CATEGORY_DEFAULT_COUNT', 'Exactly one category must be the default.'))
  issues.push(...unique(project.savingsPlan.monthlyEntries, (item) => item.monthId, ['project', 'savingsPlan', 'monthlyEntries'], 'DUPLICATE_SAVINGS_MONTH'))
  project.savingsPlan.monthlyEntries.forEach((entry, index) => { if (entry.monthId < firstMonth || entry.monthId > lastMonth) issues.push(issue(['project', 'savingsPlan', 'monthlyEntries', index, 'monthId'], 'MONTH_OUTSIDE_PLAN', 'Savings month is outside the plan window.')) })
  const savingsTarget = project.savingsPlan.monthlyEntries.reduce((sum, entry) => sum + entry.target, 0)
  if (Math.abs(savingsTarget - project.savingsPlan.targetTotal) > 0.001) issues.push(issue(['project', 'savingsPlan', 'targetTotal'], 'SAVINGS_TARGET_MISMATCH', 'Savings targetTotal must equal the sum of monthly targets.'))

  const categoryIds = new Set(project.categoryDefinitions.map((item) => item.key)); const statusIds = new Set(project.statusDefinitions.map((item) => item.id))
  const goalIds = new Set(project.goals.map((item) => item.id)); const activeIds = new Set(plan.activities.map((item) => item.id)); const trashIds = new Set(plan.trash.map((item) => item.activity.id)); const allActivityIds = new Set([...activeIds, ...trashIds])
  issues.push(...unique(plan.activities, (item) => item.id, ['activities'], 'DUPLICATE_ACTIVITY_ID'))
  issues.push(...unique(plan.trash, (item) => item.activity.id, ['trash'], 'DUPLICATE_TRASH_ACTIVITY_ID'))
  for (const id of activeIds) if (trashIds.has(id)) issues.push(issue(['trash'], 'ACTIVE_TRASH_ID_CONFLICT', `Activity ${id} is both active and deleted.`))
  issues.push(...unique(plan.relationships, (item) => item.id, ['relationships'], 'DUPLICATE_RELATIONSHIP_ID'))
  issues.push(...unique(plan.relationships, (item) => `${item.sourceActivityId}:${item.targetActivityId}:${item.type}`, ['relationships'], 'DUPLICATE_RELATIONSHIP'))
  issues.push(...unique(plan.constraints ?? [], (item) => item.id, ['constraints'], 'DUPLICATE_CONSTRAINT_ID'))
  issues.push(...unique(plan.warnings ?? [], (item) => item.id, ['warnings'], 'DUPLICATE_WARNING_ID'))
  const normalizedTags = (plan.tags ?? []).map((tag) => tag.toLocaleLowerCase())
  if (new Set(normalizedTags).size !== normalizedTags.length) issues.push(issue(['tags'], 'DUPLICATE_TAG', 'Tags must be unique ignoring case.'))

  project.goals.forEach((goal, index) => { if (!categoryIds.has(goal.category)) issues.push(issue(['project', 'goals', index, 'category'], 'UNKNOWN_CATEGORY_REFERENCE', `Unknown category: ${goal.category}`)); if (!validDate(goal.targetDate)) issues.push(issue(['project', 'goals', index, 'targetDate'], 'INVALID_DATE', `Invalid calendar date: ${goal.targetDate}`)) })
  project.milestones.forEach((milestone, index) => { if (!categoryIds.has(milestone.category)) issues.push(issue(['project', 'milestones', index, 'category'], 'UNKNOWN_CATEGORY_REFERENCE', `Unknown category: ${milestone.category}`)); if (milestone.activityId && !allActivityIds.has(milestone.activityId)) issues.push(issue(['project', 'milestones', index, 'activityId'], 'UNKNOWN_ACTIVITY_REFERENCE', `Unknown activity: ${milestone.activityId}`)); if (milestone.monthId < firstMonth || milestone.monthId > lastMonth) issues.push(issue(['project', 'milestones', index, 'monthId'], 'MONTH_OUTSIDE_PLAN', 'Milestone month is outside the plan window.')) })

  const validateActivity = (activity: CanonicalPlan['activities'][number], path: Array<string | number>, permitDeletedReferences: boolean) => {
    if (!categoryIds.has(activity.category)) issues.push(issue([...path, 'category'], 'UNKNOWN_CATEGORY_REFERENCE', `Unknown category: ${activity.category}`))
    if (!statusIds.has(activity.statusId)) issues.push(issue([...path, 'statusId'], 'UNKNOWN_STATUS_REFERENCE', `Unknown status: ${activity.statusId}`))
    if (activity.parentGoalId && !goalIds.has(activity.parentGoalId)) issues.push(issue([...path, 'parentGoalId'], 'UNKNOWN_GOAL_REFERENCE', `Unknown goal: ${activity.parentGoalId}`))
    if (!validDate(activity.startDate)) issues.push(issue([...path, 'startDate'], 'INVALID_DATE', `Invalid calendar date: ${activity.startDate}`))
    if (activity.endDate && (!validDate(activity.endDate) || activity.startDate > activity.endDate)) issues.push(issue([...path, 'endDate'], 'DATE_ORDER', 'Activity end date is invalid or precedes its start date.'))
    if (activity.recurrence && (!validDate(activity.recurrence.endDate) || activity.recurrence.endDate < activity.startDate)) issues.push(issue([...path, 'recurrence', 'endDate'], 'RECURRENCE_DATE_ORDER', 'Recurrence end date precedes activity start date.'))
    issues.push(...unique(activity.subtasks, (item) => item.id, [...path, 'subtasks'], 'DUPLICATE_SUBTASK_ID'))
    issues.push(...unique(activity.comments, (item) => item.id, [...path, 'comments'], 'DUPLICATE_COMMENT_ID'))
    issues.push(...unique(activity.history, (item) => item.id, [...path, 'history'], 'DUPLICATE_HISTORY_ID'))
    for (const [monthId, entry] of Object.entries(activity.monthlyEntries)) { if (entry.monthId !== monthId) issues.push(issue([...path, 'monthlyEntries', monthId, 'monthId'], 'MONTH_KEY_MISMATCH', 'Monthly entry monthId must match its key.')); if (!permitDeletedReferences && (monthId < firstMonth || monthId > lastMonth)) issues.push(issue([...path, 'monthlyEntries', monthId], 'MONTH_OUTSIDE_PLAN', 'Activity month is outside the plan window.')) }
    const refs = permitDeletedReferences ? allActivityIds : activeIds
    for (const [field, ids] of [['dependencyIds', activity.dependencyIds], ['linkedActivityIds', activity.linkedActivityIds]] as const) {
      if (new Set(ids).size !== ids.length) issues.push(issue([...path, field], 'DUPLICATE_ACTIVITY_REFERENCE', `${field} contains duplicates.`))
      ids.forEach((id, index) => { if (id === activity.id) issues.push(issue([...path, field, index], 'SELF_ACTIVITY_REFERENCE', 'An activity cannot reference itself.')); else if (!refs.has(id)) issues.push(issue([...path, field, index], 'UNKNOWN_ACTIVITY_REFERENCE', `Unknown activity: ${id}`)) })
    }
    activity.history.forEach((entry, index) => { if (entry.activityId !== activity.id) issues.push(issue([...path, 'history', index, 'activityId'], 'HISTORY_ACTIVITY_MISMATCH', 'History activityId must match its activity.')) })
  }
  plan.activities.forEach((activity, index) => validateActivity(activity, ['activities', index], false))
  plan.trash.forEach((item, index) => { validateActivity(item.activity, ['trash', index, 'activity'], true); if (item.deletedAt > item.expiresAt) issues.push(issue(['trash', index, 'expiresAt'], 'TRASH_DATE_ORDER', 'Trash expiry precedes deletion.')) })

  plan.relationships.forEach((relation, index) => {
    const path = ['relationships', index] as Array<string | number>
    if (!allActivityIds.has(relation.sourceActivityId)) issues.push(issue([...path, 'sourceActivityId'], 'UNKNOWN_ACTIVITY_REFERENCE', `Unknown activity: ${relation.sourceActivityId}`))
    if (!allActivityIds.has(relation.targetActivityId)) issues.push(issue([...path, 'targetActivityId'], 'UNKNOWN_ACTIVITY_REFERENCE', `Unknown activity: ${relation.targetActivityId}`))
    if (relation.sourceActivityId === relation.targetActivityId) issues.push(issue(path, 'SELF_RELATIONSHIP', 'A relationship cannot target itself.'))
  })

  const graph = new Map(plan.activities.map((item) => [item.id, item.dependencyIds.filter((id) => activeIds.has(id))]))
  for (const relation of plan.relationships.filter((item) => item.type === 'dependency' && activeIds.has(item.sourceActivityId) && activeIds.has(item.targetActivityId))) graph.set(relation.targetActivityId, [...new Set([...(graph.get(relation.targetActivityId) ?? []), relation.sourceActivityId])])
  const visiting = new Set<string>(); const visited = new Set<string>()
  const visit = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const dependency of graph.get(id) ?? []) if (visit(dependency)) return true; visiting.delete(id); visited.add(id); return false }
  for (const id of graph.keys()) if (visit(id)) { issues.push(issue(['activities'], 'DEPENDENCY_CYCLE', 'Activity dependencies contain a cycle.')); break }
  return issues
}
