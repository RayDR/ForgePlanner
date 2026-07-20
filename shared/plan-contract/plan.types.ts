import type { z } from 'zod'
import type { activityHistorySchema, activityRelationshipSchema, activitySchema, activityTrashItemSchema, canonicalPlanSchema, categoryDefinitionSchema, commentSchema, goalSchema, milestoneSchema, monthlyActivityEntrySchema, monthlySavingsEntrySchema, planConstraintSchema, planMetadataSchema, planWarningSchema, projectSchema, savingsPlanSchema, statusDefinitionSchema, subtaskSchema } from './plan.schema.js'

export type CanonicalPlan = z.infer<typeof canonicalPlanSchema>
export type PlanProject = z.infer<typeof projectSchema>
export type PlanActivity = z.infer<typeof activitySchema>
export type PlanGoal = z.infer<typeof goalSchema>
export type PlanMilestone = z.infer<typeof milestoneSchema>
export type PlanSubtask = z.infer<typeof subtaskSchema>
export type PlanComment = z.infer<typeof commentSchema>
export type PlanActivityHistoryEntry = z.infer<typeof activityHistorySchema>
export type PlanActivityRelationship = z.infer<typeof activityRelationshipSchema>
export type PlanActivityTrashItem = z.infer<typeof activityTrashItemSchema>
export type PlanMonthlyActivityEntry = z.infer<typeof monthlyActivityEntrySchema>
export type PlanMonthlySavingsEntry = z.infer<typeof monthlySavingsEntrySchema>
export type PlanSavings = z.infer<typeof savingsPlanSchema>
export type PlanStatusDefinition = z.infer<typeof statusDefinitionSchema>
export type PlanCategoryDefinition = z.infer<typeof categoryDefinitionSchema>
export type PlanMetadata = z.infer<typeof planMetadataSchema>
export type PlanConstraint = z.infer<typeof planConstraintSchema>
export type PlanWarning = z.infer<typeof planWarningSchema>

export type PlanValidationIssue = { path: Array<string | number>; code: string; message: string; severity: 'error' | 'warning' }
export type PlanParseResult = { success: true; plan: CanonicalPlan; detectedVersion: number | 'legacy'; migrationRequired: boolean; issues: PlanValidationIssue[]; extractedUiState?: { selectedYear?: number; selectedMonthId?: string; locale?: 'en' | 'es'; theme?: 'light' | 'dark'; monthlyViewPreference?: 'list' | 'kanban' } } | { success: false; detectedVersion?: number | 'legacy'; migrationRequired: boolean; issues: PlanValidationIssue[]; raw: unknown }

