import { z } from 'zod'
import { CURRENT_PLAN_SCHEMA_VERSION, PLAN_LIMITS, PLANNER_CONTRACT_VERSION } from './plan.constants.js'

export const entityIdSchema = z.string().trim().min(1).max(PLAN_LIMITS.entityId).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const isoTimestampSchema = z.string().datetime({ offset: true })
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const visible = (max: number = PLAN_LIMITS.visibleText) => z.string().trim().max(max)
const nonEmptyVisible = (max: number = PLAN_LIMITS.shortText) => visible(max).min(1)
const finiteNonNegative = z.number().finite().nonnegative()
const colorKeySchema = z.enum(['slate', 'blue', 'green', 'amber', 'rose'])
const colorHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const relationshipModeSchema = z.enum(['independent', 'soft-linked', 'locked-sequence'])

export const categoryDefinitionSchema = z.object({
  key: entityIdSchema,
  label: nonEmptyVisible(),
  tone: colorKeySchema,
  colorHex: colorHexSchema.optional(),
  isDefault: z.boolean().optional(),
}).strict()

export const statusDefinitionSchema = z.object({
  id: entityIdSchema,
  label: nonEmptyVisible(),
  colorKey: colorKeySchema,
  colorHex: colorHexSchema.optional(),
  order: z.number().int().min(0).max(999),
  isSystem: z.boolean().optional(),
  isDefault: z.boolean().optional(),
}).strict()

export const goalSchema = z.object({
  id: entityIdSchema,
  title: nonEmptyVisible(500),
  description: visible(),
  targetDate: isoDateSchema,
  category: entityIdSchema,
}).strict()

export const milestoneSchema = z.object({
  id: entityIdSchema,
  title: nonEmptyVisible(500),
  monthId: yearMonthSchema,
  category: entityIdSchema,
  activityId: entityIdSchema.optional(),
}).strict()

export const subtaskSchema = z.object({
  id: entityIdSchema,
  title: nonEmptyVisible(1_000),
  completed: z.boolean(),
  weight: z.number().finite().positive().max(10_000).optional(),
}).strict()

export const commentSchema = z.object({
  id: entityIdSchema,
  author: nonEmptyVisible(240),
  message: nonEmptyVisible(PLAN_LIMITS.visibleText),
  createdAt: isoTimestampSchema,
}).strict()

export const activityHistorySchema = z.object({
  id: entityIdSchema,
  activityId: entityIdSchema,
  type: z.enum(['created', 'edited', 'status-changed', 'monthly-entry-updated', 'month-changed', 'skipped', 'paused', 'resumed', 'dependency-blocked-move', 'subtask-created', 'subtask-updated', 'subtask-completed', 'subtask-deleted', 'subtask-reordered', 'comment-added', 'comment-deleted', 'deleted', 'restored']),
  message: nonEmptyVisible(4_000),
  occurredAt: isoTimestampSchema,
  monthId: yearMonthSchema.optional(),
}).strict()

export const monthlyActivityEntrySchema = z.object({
  monthId: yearMonthSchema,
  status: z.enum(['planned', 'in-progress', 'continued', 'paused', 'skipped', 'resumed', 'completed', 'cancelled']),
  progress: z.number().finite().min(0).max(100),
  estimatedHours: finiteNonNegative.max(100_000).optional(),
  actualHours: finiteNonNegative.max(100_000).optional(),
  notes: visible(10_000).optional(),
  isSkipped: z.boolean().optional(),
  isPaused: z.boolean().optional(),
  resumedFromMonthId: yearMonthSchema.optional(),
  continuedFromMonthId: yearMonthSchema.optional(),
  savingsImpact: finiteNonNegative.max(1_000_000_000).optional(),
  budgetImpact: finiteNonNegative.max(1_000_000_000).optional(),
}).strict()

export const activitySchema = z.object({
  id: entityIdSchema,
  title: nonEmptyVisible(1_000),
  description: visible(),
  category: entityIdSchema,
  sequenceNumber: z.number().int().positive().max(1_000_000).optional(),
  recurrence: z.object({ frequency: z.enum(['daily', 'weekly', 'biweekly', 'fortnightly', 'month-start', 'month-end', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']), endDate: isoDateSchema }).strict().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  relationshipMode: relationshipModeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional(),
  estimatedHours: finiteNonNegative.max(1_000_000).optional(),
  parentGoalId: entityIdSchema.optional(),
  linkedActivityIds: z.array(entityIdSchema).max(PLAN_LIMITS.activities),
  dependencyIds: z.array(entityIdSchema).max(PLAN_LIMITS.activities),
  sequenceGroupId: entityIdSchema.optional(),
  milestone: z.boolean(),
  colorKey: colorKeySchema,
  colorHex: colorHexSchema.optional(),
  statusId: entityIdSchema,
  progressMode: z.enum(['completion', 'weighted']).optional(),
  budgetImpact: finiteNonNegative.max(1_000_000_000).optional(),
  savingsImpact: finiteNonNegative.max(1_000_000_000).optional(),
  notes: visible(20_000),
  subtasks: z.array(subtaskSchema).max(PLAN_LIMITS.subtasks),
  comments: z.array(commentSchema).max(PLAN_LIMITS.comments),
  history: z.array(activityHistorySchema).max(PLAN_LIMITS.history),
  monthlyEntries: z.record(yearMonthSchema, monthlyActivityEntrySchema).superRefine((entries, context) => {
    if (Object.keys(entries).length > PLAN_LIMITS.monthlyEntries) context.addIssue({ code: 'custom', message: 'Too many monthly entries.' })
    for (const [monthId, entry] of Object.entries(entries)) if (entry.monthId !== monthId) context.addIssue({ code: 'custom', path: [monthId, 'monthId'], message: 'Monthly entry monthId must match its record key.' })
  }),
}).strict()

export const activityRelationshipSchema = z.object({
  id: entityIdSchema,
  sourceActivityId: entityIdSchema,
  targetActivityId: entityIdSchema,
  type: z.enum(['linked', 'dependency', 'sequence']),
  relationshipMode: relationshipModeSchema,
}).strict()

export const activityTrashItemSchema = z.object({
  activity: activitySchema,
  deletedAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
}).strict()

export const monthlySavingsEntrySchema = z.object({
  monthId: yearMonthSchema,
  target: finiteNonNegative.max(1_000_000_000),
  actual: finiteNonNegative.max(1_000_000_000),
  notes: visible(10_000).optional(),
  updatedAt: isoTimestampSchema.optional(),
}).strict()

export const savingsPlanSchema = z.object({
  currency: z.enum(['USD', 'CAD']),
  enabled: z.boolean().optional(),
  mode: z.enum(['free', 'monthly-target']).optional(),
  defaultMonthlyTarget: finiteNonNegative.max(1_000_000_000).optional(),
  targetTotal: finiteNonNegative.max(1_000_000_000_000),
  monthlyEntries: z.array(monthlySavingsEntrySchema).max(PLAN_LIMITS.savingsEntries),
}).strict()

export const planConstraintSchema = z.object({ id: entityIdSchema, type: z.enum(['time', 'budget', 'schedule', 'dependency', 'personal', 'other']), description: nonEmptyVisible(4_000), isNonNegotiable: z.boolean() }).strict()
export const planWarningSchema = z.object({ id: entityIdSchema, code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/), message: nonEmptyVisible(4_000), severity: z.enum(['info', 'warning']) }).strict()

export const planMetadataSchema = z.object({
  origin: z.enum(['manual', 'import', 'template', 'ai']),
  planningMode: z.enum(['monthly', 'annual', 'auto']).optional(),
  templateKey: z.enum(['blank', 'career-roadmap', 'certification-plan', 'savings-goal', 'health-lifestyle', 'immigration-plan']).optional(),
  contentLanguage: z.enum(['en', 'es', 'mixed']).optional(),
  plannerContractVersion: z.literal(PLANNER_CONTRACT_VERSION),
}).strict()

export const projectSchema = z.object({
  id: entityIdSchema,
  name: nonEmptyVisible(PLAN_LIMITS.name),
  objective: visible(PLAN_LIMITS.objective),
  startDate: isoDateSchema,
  plannedStartDate: isoDateSchema.optional(),
  endDate: isoDateSchema,
  plannedEndDate: isoDateSchema,
  actualEndDate: isoDateSchema.optional(),
  completedAt: isoTimestampSchema.optional(),
  goals: z.array(goalSchema).max(PLAN_LIMITS.goals),
  milestones: z.array(milestoneSchema).max(PLAN_LIMITS.milestones),
  statusDefinitions: z.array(statusDefinitionSchema).min(1).max(100),
  categoryDefinitions: z.array(categoryDefinitionSchema).min(1).max(200),
  savingsPlan: savingsPlanSchema,
}).strict()

export const canonicalPlanSchema = z.object({
  schemaVersion: z.literal(CURRENT_PLAN_SCHEMA_VERSION),
  metadata: planMetadataSchema,
  project: projectSchema,
  activities: z.array(activitySchema).max(PLAN_LIMITS.activities),
  trash: z.array(activityTrashItemSchema).max(PLAN_LIMITS.activities),
  relationships: z.array(activityRelationshipSchema).max(PLAN_LIMITS.relationships),
  summary: visible(PLAN_LIMITS.summary).optional(),
  assumptions: z.array(nonEmptyVisible(1_000)).max(PLAN_LIMITS.assumptions).optional(),
  constraints: z.array(planConstraintSchema).max(PLAN_LIMITS.constraints).optional(),
  warnings: z.array(planWarningSchema).max(PLAN_LIMITS.warnings).optional(),
  tags: z.array(z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u)).max(PLAN_LIMITS.tags).optional(),
  estimatedHoursPerWeek: finiteNonNegative.max(168).optional(),
  difficulty: z.enum(['light', 'moderate', 'demanding']).optional(),
}).strict()
