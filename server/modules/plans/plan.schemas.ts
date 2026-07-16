import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const snapshot = z.object({ schemaVersion: z.number().int().positive(), project: z.record(z.string(), z.unknown()), activities: z.array(z.unknown()) }).loose()
const planPayloadBase = z.object({
  importKey: z.string().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(160),
  objective: z.string().max(20_000).optional().default(''),
  startDate: date,
  endDate: date,
  status: z.string().max(30).default('active'),
  snapshot,
})

export const planPayloadSchema = planPayloadBase.refine((value) => value.startDate <= value.endDate, { message: 'End date must not precede start date.' })
const importedPlanSchema = planPayloadBase.extend({ importKey: z.string().min(1).max(120) }).refine((value) => value.startDate <= value.endDate, { message: 'End date must not precede start date.' })
export const importPlansSchema = z.object({ plans: z.array(importedPlanSchema).min(1).max(100) })
export const updatePlanSchema = planPayloadBase.partial().omit({ importKey: true }).extend({ expectedRevision: z.number().int().positive() })
