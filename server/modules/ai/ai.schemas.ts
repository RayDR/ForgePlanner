import { z } from 'zod'
import { aiPlanningProposalSchema } from '../../../shared/ai-proposal-contract/index.js'

const boundedText = (max: number) => z.string().trim().min(1).max(max)
const optionalDate = z.iso.date().nullable().optional()
export const proposalInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  goal: boundedText(2_000), additionalContext: z.string().trim().max(4_000).nullable().optional(),
  startDate: optionalDate, targetDate: optionalDate, durationMonths: z.number().int().min(1).max(120).nullable().optional(),
  hoursPerWeek: z.number().min(1).max(80).nullable().optional(), monthlyBudget: z.number().min(0).max(100_000_000).nullable().optional(),
  currency: z.enum(['USD','MXN','CAD','EUR','GBP']).nullable().optional(), constraints: z.array(boundedText(300)).max(10).default([]), nonNegotiables: z.array(boundedText(300)).max(10).default([]),
  experienceLevel: z.enum(['beginner','intermediate','advanced']).nullable().optional(), preferredLanguage: z.enum(['auto','en','es']).default('auto'),
  planIntensity: z.enum(['light','balanced','ambitious']).default('balanced'), locale: z.enum(['en','es']).default('en'),
}).strict().superRefine((value, context) => {
  if (value.startDate && value.targetDate && value.startDate > value.targetDate) context.addIssue({ code: 'custom', path: ['targetDate'], message: 'Target date must not precede start date.' })
  const combined = value.goal.length + (value.additionalContext?.length ?? 0) + value.constraints.join('').length + value.nonNegotiables.join('').length
  if (combined > 8_000) context.addIssue({ code: 'custom', path: ['goal'], message: 'AI_PROPOSAL_INPUT_TOO_LARGE' })
})

export const refinementSchema = z.object({ clientRequestId: z.string().uuid(), expectedRevision: z.number().int().positive(), instruction: boundedText(1_500) }).strict()
export const transitionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict()
export const listSchema = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict()
export const revisionSchema = z.coerce.number().int().positive()
export const guestRefinementSchema = refinementSchema.extend({ currentProposal: aiPlanningProposalSchema, signedProposalToken: z.string().min(40).max(4_096) }).strict()
export const guestTransitionSchema = transitionSchema.extend({ currentProposal: aiPlanningProposalSchema, signedProposalToken: z.string().min(40).max(4_096) }).strict()
export type ProposalInput = z.infer<typeof proposalInputSchema>
