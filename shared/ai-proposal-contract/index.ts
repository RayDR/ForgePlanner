import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).max(max)

export const proposalPhaseSchema = z.object({
  title: text(160),
  purpose: text(800),
  suggestedTimeframe: text(160),
  outcomes: list(text(400), 10),
  recommendedActions: list(text(500), 20),
  dependencies: list(text(400), 10),
  risks: list(text(500), 10),
}).strict()

export const aiPlanningProposalSchema = z.object({
  proposalSchemaVersion: z.literal(1),
  title: text(160),
  summary: text(1_200),
  primaryObjective: text(1_000),
  recommendedDuration: text(160),
  recommendedStartDate: z.iso.date().nullable(),
  recommendedTargetDate: z.iso.date().nullable(),
  planningApproach: text(2_000),
  phases: z.array(proposalPhaseSchema).min(1).max(12),
  assumptions: list(text(500), 20),
  risks: list(text(500), 20),
  warnings: list(text(500), 20),
  successIndicators: list(text(500), 20),
  weeklyCommitment: text(500),
  budgetGuidance: text(1_000).nullable(),
  clarifyingQuestions: list(text(500), 10),
}).strict()

export type AiPlanningProposal = z.infer<typeof aiPlanningProposalSchema>
export type AiProposalPhase = z.infer<typeof proposalPhaseSchema>

export const AI_PROPOSAL_MAX_BYTES = 64 * 1024

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]))
  return value
}

export function parseAiPlanningProposal(input: unknown) {
  const proposal = aiPlanningProposalSchema.parse(input)
  const serialized = JSON.stringify(sortKeys(proposal))
  const sizeBytes = Buffer.byteLength(serialized, 'utf8')
  if (sizeBytes > AI_PROPOSAL_MAX_BYTES) throw new Error('AI_PROPOSAL_OUTPUT_TOO_LARGE')
  return { proposal, serialized, sizeBytes }
}

export function aiProposalJsonSchema() {
  return z.toJSONSchema(aiPlanningProposalSchema, { target: 'draft-7' })
}
