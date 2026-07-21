import { canonicalPlanSchema } from './plan.schema.js'
import { validatePlanSemantics } from './plan.semantic-validation.js'
import type { CanonicalPlan, PlanValidationIssue } from './plan.types.js'

export function normalizeZodIssues(issues: Array<{ path: PropertyKey[]; code: string; message: string }>): PlanValidationIssue[] {
  return issues.map((item) => ({ path: item.path.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number'), code: `STRUCTURE_${item.code.toUpperCase()}`, message: item.message, severity: 'error' }))
}

export function safeValidateCanonicalPlan(input: unknown): { success: true; plan: CanonicalPlan; issues: PlanValidationIssue[] } | { success: false; issues: PlanValidationIssue[] } {
  const parsed = canonicalPlanSchema.safeParse(input)
  if (!parsed.success) return { success: false, issues: normalizeZodIssues(parsed.error.issues) }
  const issues = validatePlanSemantics(parsed.data)
  return issues.some((item) => item.severity === 'error') ? { success: false, issues } : { success: true, plan: parsed.data, issues }
}

export function parseCanonicalPlan(input: unknown): CanonicalPlan {
  const result = safeValidateCanonicalPlan(input)
  if (!result.success) throw new PlanContractError(result.issues)
  return result.plan
}

export class PlanContractError extends Error {
  readonly issues: PlanValidationIssue[]
  constructor(issues: PlanValidationIssue[]) { super('Plan contract validation failed.'); this.name = 'PlanContractError'; this.issues = issues }
}
