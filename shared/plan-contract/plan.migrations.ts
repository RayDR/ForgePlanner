import { z } from 'zod'
import { CURRENT_PLAN_SCHEMA_VERSION, PLANNER_CONTRACT_VERSION } from './plan.constants.js'
import { activityRelationshipSchema, activitySchema, activityTrashItemSchema, categoryDefinitionSchema, entityIdSchema, goalSchema, isoDateSchema, isoTimestampSchema, milestoneSchema, projectSchema, statusDefinitionSchema, yearMonthSchema } from './plan.schema.js'
import { safeValidateCanonicalPlan, normalizeZodIssues } from './plan.validation.js'
import type { CanonicalPlan, PlanParseResult, PlanValidationIssue } from './plan.types.js'

const warning = (code: string, message: string, path: Array<string | number> = []): PlanValidationIssue => ({ path, code, message, severity: 'warning' })
const v7StatusSchema = statusDefinitionSchema.omit({ isSystem: true }).strict()
const v7SubtaskSchema = z.object({ id: entityIdSchema, title: z.string(), completed: z.boolean(), weight: z.number().optional(), storyPoints: z.number().optional() }).strict()
const v7ActivitySchema = activitySchema.extend({ colorKey: activitySchema.shape.colorKey.optional(), statusId: entityIdSchema.optional(), progressMode: z.enum(['completion', 'weighted']).optional(), history: activitySchema.shape.history.optional(), subtasks: z.array(v7SubtaskSchema) }).strict()
const v7TrashSchema = activityTrashItemSchema.extend({ activity: v7ActivitySchema }).strict()
const v7ProjectSchema = projectSchema.omit({ statusDefinitions: true, categoryDefinitions: true }).extend({ selectedYear: z.number().int(), statusDefinitions: z.array(v7StatusSchema).optional(), categoryDefinitions: z.array(categoryDefinitionSchema).optional() }).strict()
const forgeMetadataSchema = z.object({ planningMode: z.enum(['monthly', 'annual', 'auto']).optional(), templateKey: z.enum(['blank', 'career-roadmap', 'certification-plan', 'savings-goal', 'health-lifestyle', 'immigration-plan']).optional(), categories: z.array(entityIdSchema).optional(), monthlyViewPreference: z.enum(['list', 'kanban']).optional() }).strict()
const v7BaseShape = {
  project: v7ProjectSchema,
  activities: z.array(v7ActivitySchema),
  trash: z.array(v7TrashSchema).optional(),
  relationships: z.array(activityRelationshipSchema),
  selectedYear: z.number().int(),
  selectedMonthId: yearMonthSchema,
  locale: z.enum(['en', 'es']),
  theme: z.enum(['light', 'dark']),
  _forge: forgeMetadataSchema.optional(),
}
const v7Schema = z.object({ schemaVersion: z.literal(7), ...v7BaseShape }).strict()
const mislabeledCurrentSchema = z.object({ schemaVersion: z.number().int().min(1).max(6), ...v7BaseShape }).strict()

const legacyMonthlyPlanSchema = z.object({ monthId: yearMonthSchema, progress: z.number(), status: z.enum(['not-started', 'in-progress', 'blocked', 'completed', 'deferred']), isDeferred: z.boolean(), movedFromMonthId: yearMonthSchema.optional(), estimatedHours: z.number().optional(), savingsImpact: z.number().optional(), budgetImpact: z.number().optional() }).strict()
const legacyMovementSchema = z.object({ id: entityIdSchema, fromMonthId: yearMonthSchema.nullable(), toMonthId: yearMonthSchema, movedAt: isoTimestampSchema, reason: z.string().optional() }).strict()
const legacyActivitySchema = z.object({ id: entityIdSchema, title: z.string(), description: z.string(), category: entityIdSchema, status: z.enum(['not-started', 'in-progress', 'blocked', 'completed', 'deferred']), priority: z.enum(['low', 'medium', 'high', 'critical']), relationshipMode: z.enum(['independent', 'soft-linked', 'locked-sequence']), startDate: isoDateSchema, endDate: isoDateSchema, targetMonth: yearMonthSchema, estimatedHours: z.number().optional(), parentGoalId: entityIdSchema.optional(), linkedActivityIds: z.array(entityIdSchema), dependencyIds: z.array(entityIdSchema), sequenceGroupId: entityIdSchema.optional(), milestone: z.boolean(), budgetImpact: z.number().optional(), savingsImpact: z.number().optional(), notes: z.string(), subtasks: z.array(v7SubtaskSchema), comments: activitySchema.shape.comments, monthlyPlans: z.record(yearMonthSchema, legacyMonthlyPlanSchema), moveHistory: z.array(legacyMovementSchema) }).strict()
const legacyProjectSchema = z.object({ id: entityIdSchema, name: z.string(), objective: z.string(), startDate: isoDateSchema, endDate: isoDateSchema, plannedEndDate: isoDateSchema.optional(), actualEndDate: isoDateSchema.optional(), completedAt: z.string().optional(), selectedYear: z.number().int(), goals: z.array(goalSchema), milestones: z.array(milestoneSchema), savingsPlan: z.array(z.object({ monthId: yearMonthSchema, projected: z.number(), actual: z.number() }).strict()) }).strict()
const unversionedLegacySchema = z.object({ version: z.number().optional(), project: legacyProjectSchema, activities: z.array(legacyActivitySchema), relationships: z.array(activityRelationshipSchema), selectedYear: z.number().int(), selectedMonthId: yearMonthSchema, locale: z.enum(['en', 'es']).optional(), theme: z.enum(['light', 'dark']).optional() }).strict()

const defaultStatuses: CanonicalPlan['project']['statusDefinitions'] = [
  { id: 'planned', label: 'Planned', colorKey: 'slate', order: 0, isSystem: true, isDefault: true },
  { id: 'in-progress', label: 'In Progress', colorKey: 'blue', order: 1, isSystem: true },
  { id: 'paused', label: 'Paused', colorKey: 'amber', order: 2, isSystem: true },
  { id: 'blocked', label: 'Blocked', colorKey: 'rose', order: 3, isSystem: true },
  { id: 'done', label: 'Done', colorKey: 'green', order: 4, isSystem: true },
]
const BUILT_IN_STATUS_IDS = new Set(defaultStatuses.map((status) => status.id))

function migrateStatusDefinitions(statuses?: z.infer<typeof v7StatusSchema>[]): CanonicalPlan['project']['statusDefinitions'] {
  if (!statuses?.length) return defaultStatuses.map((status) => ({ ...status }))
  const customDefaults = statuses.filter((status) => status.isDefault && !BUILT_IN_STATUS_IDS.has(status.id))
  const selectedDefaultId = customDefaults.length === 1
    ? customDefaults[0].id
    : statuses.some((status) => status.id === 'planned')
      ? 'planned'
      : [...statuses].sort((left, right) => left.order - right.order)[0].id
  return statuses.map((status) => ({
    id: status.id,
    label: status.label,
    colorKey: status.colorKey,
    order: status.order,
    ...(BUILT_IN_STATUS_IDS.has(status.id) ? { isSystem: true } : {}),
    ...(status.id === selectedDefaultId ? { isDefault: true } : {}),
  }))
}
const legacyStatus = (status: string) => status === 'completed' ? 'completed' as const : status === 'blocked' ? 'paused' as const : status === 'deferred' ? 'skipped' as const : status === 'in-progress' ? 'in-progress' as const : 'planned' as const
const statusId = (status: string) => status === 'completed' ? 'done' : status === 'blocked' || status === 'deferred' ? 'blocked' : status === 'in-progress' ? 'in-progress' : 'planned'
const color = (category: string): CanonicalPlan['activities'][number]['colorKey'] => ['savings', 'health', 'family-lifestyle', 'portfolio'].includes(category) ? 'green' : ['english', 'certifications'].includes(category) ? 'amber' : category === 'risk-catchup' ? 'rose' : ['immigration', 'ai-llms', 'aws-cloud'].includes(category) ? 'blue' : 'slate'

function migrateV7(value: z.infer<typeof v7Schema> | z.infer<typeof mislabeledCurrentSchema>, extraIssues: PlanValidationIssue[] = []): PlanParseResult {
  const issues = [...extraIssues]
  const categories: CanonicalPlan['project']['categoryDefinitions'] = value.project.categoryDefinitions?.length ? value.project.categoryDefinitions : [...new Map(value.activities.map((activity) => [activity.category, { key: activity.category, label: activity.category, tone: color(activity.category) }])).values()]
  if (!categories.some((item) => item.isDefault) && categories.length) {
    categories[0] = { ...categories[0], isDefault: true }
    issues.push(warning('CATEGORY_DEFAULT_INTRODUCED', 'The first category became the default because version 7 did not define one.', ['project', 'categoryDefinitions']))
  }
  const statuses = migrateStatusDefinitions(value.project.statusDefinitions)
  if (!value.project.statusDefinitions?.length) issues.push(warning('STATUS_DEFINITIONS_INTRODUCED', 'Built-in status definitions and the planned default were introduced.', ['project', 'statusDefinitions']))
  else {
    const oldDefaults = value.project.statusDefinitions.filter((status) => status.isDefault).map((status) => status.id)
    const newDefault = statuses.find((status) => status.isDefault)?.id
    if (oldDefaults.length !== 1 || oldDefaults[0] !== newDefault) issues.push(warning('STATUS_DEFAULT_NORMALIZED', `Ambiguous historical default flags were normalized to ${newDefault}.`, ['project', 'statusDefinitions']))
  }
  const canonicalProject: Omit<typeof value.project, 'selectedYear'> & { selectedYear?: number } = { ...value.project }
  delete canonicalProject.selectedYear
  const metadata = value._forge
  if (metadata?.monthlyViewPreference) issues.push(warning('UI_FIELD_EXTRACTED', 'monthlyViewPreference was extracted from legacy _forge metadata.', ['_forge', 'monthlyViewPreference']))
  if (metadata?.categories) issues.push(warning('REDUNDANT_FIELD_REMOVED', 'Legacy _forge categories were replaced by project category definitions.', ['_forge', 'categories']))
  issues.push(warning('UI_STATE_EXTRACTED', 'Plan selection, locale and theme were moved outside the canonical plan.'))
  const plan: CanonicalPlan = {
    schemaVersion: CURRENT_PLAN_SCHEMA_VERSION,
    metadata: { origin: metadata?.templateKey ? 'template' : 'manual', planningMode: metadata?.planningMode, templateKey: metadata?.templateKey, contentLanguage: value.locale, plannerContractVersion: PLANNER_CONTRACT_VERSION },
    project: { ...canonicalProject, statusDefinitions: statuses, categoryDefinitions: categories },
    activities: value.activities.map((activity, index) => ({ ...activity, sequenceNumber: activity.sequenceNumber ?? value.activities.length - index, colorKey: activity.colorKey ?? color(activity.category), statusId: activity.statusId ?? 'planned', progressMode: activity.progressMode ?? 'completion', history: activity.history ?? [], subtasks: activity.subtasks.map(({ storyPoints, ...subtask }) => ({ ...subtask, weight: subtask.weight ?? storyPoints ?? 1 })) })),
    trash: (value.trash ?? []).map((item) => ({ ...item, activity: { ...item.activity, colorKey: item.activity.colorKey ?? color(item.activity.category), statusId: item.activity.statusId ?? 'planned', progressMode: item.activity.progressMode ?? 'completion', history: item.activity.history ?? [], subtasks: item.activity.subtasks.map(({ storyPoints, ...subtask }) => ({ ...subtask, weight: subtask.weight ?? storyPoints ?? 1 })) } })),
    relationships: value.relationships,
  }
  const validated = safeValidateCanonicalPlan(plan)
  if (!validated.success) return { success: false, detectedVersion: value.schemaVersion, migrationRequired: true, issues: [...issues, ...validated.issues], raw: value }
  return { success: true, plan: validated.plan, detectedVersion: value.schemaVersion, migrationRequired: true, issues: [...issues, ...validated.issues], extractedUiState: { selectedYear: value.selectedYear, selectedMonthId: value.selectedMonthId, locale: value.locale, theme: value.theme, monthlyViewPreference: metadata?.monthlyViewPreference } }
}

function migrateUnversioned(value: z.infer<typeof unversionedLegacySchema>): PlanParseResult {
  const categoryValues = [...new Set([...value.activities.map((item) => item.category), ...value.project.goals.map((item) => item.category), ...value.project.milestones.map((item) => item.category)])]
  const categories = categoryValues.map((key, index) => ({ key, label: key, tone: color(key), isDefault: index === 0 || undefined }))
  const activities: CanonicalPlan['activities'] = value.activities.map((activity, activityIndex) => {
    const monthlyEntries: CanonicalPlan['activities'][number]['monthlyEntries'] = Object.fromEntries(Object.entries(activity.monthlyPlans).map(([monthId, entry]) => [monthId, { monthId, status: legacyStatus(entry.status), progress: entry.progress, estimatedHours: entry.estimatedHours ?? activity.estimatedHours, savingsImpact: entry.savingsImpact ?? activity.savingsImpact, budgetImpact: entry.budgetImpact ?? activity.budgetImpact, continuedFromMonthId: entry.movedFromMonthId, isSkipped: entry.status === 'deferred' || undefined, isPaused: entry.status === 'blocked' || undefined }]))
    if (!Object.keys(monthlyEntries).length) monthlyEntries[activity.targetMonth] = { monthId: activity.targetMonth, status: legacyStatus(activity.status), progress: activity.status === 'completed' ? 100 : 0 }
    for (const movement of activity.moveHistory) {
      if (movement.fromMonthId && monthlyEntries[movement.fromMonthId]) {
        monthlyEntries[movement.fromMonthId] = { ...monthlyEntries[movement.fromMonthId], status: 'skipped', isSkipped: true }
      }
      const target = monthlyEntries[movement.toMonthId]
      monthlyEntries[movement.toMonthId] = {
        ...(target ?? { monthId: movement.toMonthId, progress: 0 }),
        monthId: movement.toMonthId,
        status: movement.fromMonthId ? 'continued' : (target?.status ?? 'planned'),
        ...(movement.fromMonthId ? { continuedFromMonthId: movement.fromMonthId } : {}),
        ...(movement.reason ? { notes: [target?.notes, movement.reason].filter(Boolean).join('\n') } : {}),
      }
    }
    return { id: activity.id, title: activity.title, description: activity.description, category: activity.category, sequenceNumber: value.activities.length - activityIndex, priority: activity.priority, relationshipMode: activity.relationshipMode, startDate: activity.startDate, endDate: activity.endDate, estimatedHours: activity.estimatedHours, parentGoalId: activity.parentGoalId, linkedActivityIds: activity.linkedActivityIds, dependencyIds: activity.dependencyIds, sequenceGroupId: activity.sequenceGroupId, milestone: activity.milestone, colorKey: color(activity.category), statusId: statusId(activity.status), progressMode: 'completion', budgetImpact: activity.budgetImpact, savingsImpact: activity.savingsImpact, notes: activity.notes, subtasks: activity.subtasks.map(({ storyPoints, ...subtask }) => ({ ...subtask, weight: subtask.weight ?? storyPoints ?? 1 })), comments: activity.comments, history: [{ id: `migration-${activity.id}`, activityId: activity.id, type: 'created', message: 'Migrated from unversioned NorthStar plan.', occurredAt: new Date(0).toISOString() }, ...activity.moveHistory.map((movement) => ({ id: movement.id, activityId: activity.id, type: 'month-changed' as const, message: movement.reason ?? `Moved to ${movement.toMonthId}.`, occurredAt: movement.movedAt, monthId: movement.toMonthId }))], monthlyEntries }
  })
  const savingsEntries = value.project.savingsPlan.map((entry) => ({ monthId: entry.monthId, target: entry.projected, actual: entry.actual }))
  const plan: CanonicalPlan = { schemaVersion: 8, metadata: { origin: 'import', contentLanguage: value.locale ?? 'mixed', plannerContractVersion: PLANNER_CONTRACT_VERSION }, project: { id: value.project.id, name: value.project.name, objective: value.project.objective, startDate: value.project.startDate, plannedStartDate: value.project.startDate, endDate: value.project.endDate, plannedEndDate: value.project.plannedEndDate ?? value.project.endDate, actualEndDate: value.project.actualEndDate ?? value.project.endDate, completedAt: value.project.completedAt, goals: value.project.goals, milestones: value.project.milestones, statusDefinitions: defaultStatuses, categoryDefinitions: categories, savingsPlan: { currency: 'USD', targetTotal: savingsEntries.reduce((sum, item) => sum + item.target, 0), monthlyEntries: savingsEntries } }, activities, trash: [], relationships: value.relationships }
  const validated = safeValidateCanonicalPlan(plan); const issues = [warning('UNVERSIONED_PLAN_MIGRATED', 'Recognized unversioned NorthStar plan migrated to version 8.')]
  if (!validated.success) return { success: false, detectedVersion: 'legacy', migrationRequired: true, issues: [...issues, ...validated.issues], raw: value }
  return { success: true, plan: validated.plan, detectedVersion: 'legacy', migrationRequired: true, issues, extractedUiState: { selectedYear: value.selectedYear, selectedMonthId: value.selectedMonthId, locale: value.locale, theme: value.theme } }
}

export function parsePlanDocument(input: unknown): PlanParseResult {
  const direct = safeValidateCanonicalPlan(input)
  if (direct.success) return { success: true, plan: direct.plan, detectedVersion: 8, migrationRequired: false, issues: direct.issues }
  const version = input && typeof input === 'object' && 'schemaVersion' in input ? (input as { schemaVersion?: unknown }).schemaVersion : undefined
  if (typeof version === 'number' && version > CURRENT_PLAN_SCHEMA_VERSION) return { success: false, detectedVersion: version, migrationRequired: false, issues: [{ path: ['schemaVersion'], code: 'UNSUPPORTED_FUTURE_VERSION', message: `Schema version ${version} is not supported.`, severity: 'error' }], raw: input }
  const v7 = v7Schema.safeParse(input)
  if (v7.success) return migrateV7(v7.data)
  if (typeof version === 'number' && version >= 1 && version <= 6) {
    const mislabeled = mislabeledCurrentSchema.safeParse(input)
    if (mislabeled.success) return migrateV7(mislabeled.data, [warning('MISLABELED_LEGACY_VERSION', `Declared version ${version} matches the recognized version 7 shape.`)])
    return { success: false, detectedVersion: version, migrationRequired: true, issues: [{ path: ['schemaVersion'], code: 'UNRECOGNIZED_LEGACY_SHAPE', message: `Declared version ${version} does not match a recognized historical format.`, severity: 'error' }, ...normalizeZodIssues(mislabeled.error.issues)], raw: input }
  }
  if (version === undefined) { const legacy = unversionedLegacySchema.safeParse(input); if (legacy.success) return migrateUnversioned(legacy.data); return { success: false, detectedVersion: 'legacy', migrationRequired: true, issues: normalizeZodIssues(legacy.error.issues), raw: input } }
  return { success: false, detectedVersion: typeof version === 'number' ? version : undefined, migrationRequired: false, issues: direct.issues, raw: input }
}

export function migrateToLatest(input: unknown): CanonicalPlan {
  const result = parsePlanDocument(input)
  if (!result.success) throw new Error(result.issues.map((item) => `${item.path.join('.') || '<root>'}: ${item.message}`).join('; '))
  return result.plan
}
