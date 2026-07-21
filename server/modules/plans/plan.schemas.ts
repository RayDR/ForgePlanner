import { z } from 'zod'
import { parsePlanDocument } from '../../../shared/plan-contract/index.js'

const snapshotSchema = z.unknown().transform((value, context) => {
  const result = parsePlanDocument(value)
  if (!result.success) {
    for (const issue of result.issues.slice(0, 100)) context.addIssue({ code: 'custom', path: issue.path, message: `${issue.code}: ${issue.message}` })
    return z.NEVER
  }
  return result.plan
})

const planPayloadBase = z.object({ snapshot: snapshotSchema, status: z.enum(['active']).optional().default('active') }).strict()

export const planPayloadSchema = planPayloadBase
export const createPlanSchema = planPayloadBase.extend({ clientMutationId: z.string().uuid() }).strict()
const importedPlanSchema = planPayloadBase.extend({ importKey: z.string().min(1).max(120) }).strict()
export const importPlansSchema = z.object({ plans: z.array(importedPlanSchema).min(1).max(100) }).strict()
export const updatePlanSchema = z.object({ snapshot: snapshotSchema, expectedRevision: z.number().int().positive() }).strict()
export const planLifecycleSchema = z.object({ expectedRevision: z.number().int().positive() }).strict()
export const trashQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()
export const versionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict()
export const versionRevisionSchema = z.coerce.number().int().positive()
