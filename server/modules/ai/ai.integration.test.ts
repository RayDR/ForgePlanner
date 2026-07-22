import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AiProposalService, proposalProcessingLeaseMs } from './ai.service.js'
import { AiProposalExpirationService } from './ai-expiration.service.js'
import { AiPlanConversionService } from './ai-conversion.service.js'
import { MockAiProposalProvider } from './mock-ai-proposal.provider.js'
import { AiProviderOutputError, type AiProposalProvider, type PlanConversionContext, type ProviderContext } from './ai-provider.js'
import type { ProposalInput } from './ai.schemas.js'
import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'

const testUrl = process.env.TEST_DATABASE_URL
const integration = testUrl ? describe : describe.skip
const identity = (id: string) => ({ actorUserId: id, effectiveUserId: id })
const input = (clientRequestId = randomUUID(), goal = 'Improve my career over six months'): ProposalInput => ({ clientRequestId, goal, additionalContext: null, startDate: null, targetDate: null, durationMonths: 6, hoursPerWeek: 5, monthlyBudget: null, currency: null, constraints: [], nonNegotiables: [], experienceLevel: null, preferredLanguage: 'en', planIntensity: 'balanced', locale: 'en', conversation: [], clarificationCount: 0, continueWithAssumptions: true })

class GateProvider implements AiProposalProvider {
  readonly name = 'mock'; readonly model = 'gated-v1'; private delegate = new MockAiProposalProvider(); started!: () => void; release!: () => void; startedPromise = new Promise<void>((resolve) => { this.started = resolve }); gate = new Promise<void>((resolve) => { this.release = resolve })
  async planningTurn(value: ProposalInput, context: ProviderContext) { this.started(); await this.gate; return this.delegate.planningTurn(value, context) }
  async refineProposal(current: AiPlanningProposal, instruction: string, context: ProviderContext) { this.started(); await this.gate; return this.delegate.refineProposal(current, instruction, context) }
}

class InvalidConversionProvider extends MockAiProposalProvider {
  conversionCalls = 0
  override async convertAcceptedProposalToPlan() { this.conversionCalls += 1; return { plan: { schemaVersion: 8 }, providerRequestId: 'invalid', inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null } }
}

class IncompleteThenValidConversionProvider extends MockAiProposalProvider {
  conversionCalls = 0
  repairReasons: Array<string | undefined> = []
  override async convertAcceptedProposalToPlan(proposal: AiPlanningProposal, context: PlanConversionContext) {
    this.conversionCalls += 1; this.repairReasons.push(context.repairReason)
    if (this.conversionCalls === 1) throw new AiProviderOutputError('AI_PROVIDER_INCOMPLETE', 'max_output_tokens')
    return super.convertAcceptedProposalToPlan(proposal, context)
  }
}

integration('PostgreSQL AI proposal lifecycle', () => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl ?? 'postgresql://test:test@127.0.0.1:1/stage6_test' } } })
  let userA: { id: string }; let userB: { id: string }
  beforeAll(async () => db.$connect()); afterAll(async () => db.$disconnect())
  beforeEach(async () => { await db.auditLog.deleteMany(); await db.aiOperation.deleteMany(); await db.plan.deleteMany(); await db.profile.deleteMany(); await db.user.deleteMany(); userA = await db.user.create({ data: { email: `${randomUUID()}@a.test`, passwordHash: 'test' }, select: { id: true } }); userB = await db.user.create({ data: { email: `${randomUUID()}@b.test`, passwordHash: 'test' }, select: { id: true } }) })

  it('creates a separate operation and immutable revision without Plan writes or raw input metadata', async () => {
    const beforePlans = await db.plan.count(); const service = new AiProposalService(db, new MockAiProposalProvider()); const result = await service.generate(userA.id, input(), identity(userA.id))
    expect(result.operation).toMatchObject({ status: 'PROPOSED', currentProposalRevision: 1 }); expect(await db.plan.count()).toBe(beforePlans); expect(await db.planVersion.count()).toBe(0)
    const operation = await db.aiOperation.findUniqueOrThrow({ where: { id: result.operation.id }, include: { revisions: true } }); expect(operation.revisions).toHaveLength(1); expect(operation.sanitizedInputMetadata).not.toHaveProperty('goal'); expect(operation.sanitizedInputMetadata).not.toHaveProperty('additionalContext')
    expect(operation.revisions[0]).toMatchObject({ inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null, source: 'INITIAL_GENERATION' })
  })

  it('is idempotent for generation and conflicts on changed payload', async () => {
    const service = new AiProposalService(db, new MockAiProposalProvider()); const id = randomUUID(); const first = await service.generate(userA.id, input(id), identity(userA.id)); const retry = await service.generate(userA.id, input(id), identity(userA.id)); expect(retry.operation.id).toBe(first.operation.id); expect(await db.aiOperation.count()).toBe(1); expect(await db.aiProposalRevision.count()).toBe(1)
    await expect(service.generate(userA.id, input(id, 'Different goal'), identity(userA.id))).rejects.toMatchObject({ code: 'AI_PROPOSAL_CONFLICT' }); await expect(service.generate(userB.id, input(id), identity(userB.id))).resolves.toBeTruthy()
  })

  it('isolates owners and returns metadata-only lists', async () => {
    const service = new AiProposalService(db, new MockAiProposalProvider()); const created = await service.generate(userA.id, input(), identity(userA.id)); await expect(service.get(userB.id, created.operation.id)).rejects.toMatchObject({ code: 'AI_PROPOSAL_NOT_FOUND' }); const list = await service.list(userA.id, 1, 20); expect(list.operations[0]).not.toHaveProperty('proposal'); expect(JSON.stringify(list.operations[0])).not.toContain('primaryObjective')
  })

  it('creates one linear refinement and scopes request IDs per operation', async () => {
    const service = new AiProposalService(db, new MockAiProposalProvider()); const first = await service.generate(userA.id, input(), identity(userA.id)); const second = await service.generate(userA.id, input(), identity(userA.id)); const requestId = randomUUID()
    const refined = await service.refine(userA.id, first.operation.id, { clientRequestId: requestId, expectedRevision: 1, instruction: 'Reduce the budget' }, identity(userA.id)); expect(refined.operation.currentProposalRevision).toBe(2)
    await expect(service.refine(userA.id, first.operation.id, { clientRequestId: requestId, expectedRevision: 1, instruction: 'Different content' }, identity(userA.id))).rejects.toMatchObject({ code: 'AI_PROPOSAL_CONFLICT' })
    await expect(service.refine(userA.id, second.operation.id, { clientRequestId: requestId, expectedRevision: 1, instruction: 'Reduce the budget' }, identity(userA.id))).resolves.toBeTruthy()
    const versions = await db.aiProposalRevision.findMany({ where: { aiOperationId: first.operation.id }, orderBy: { revision: 'asc' } }); expect(versions).toHaveLength(2); expect(versions[1].parentRevisionId).toBe(versions[0].id)
  })

  it('records the exact ready revision and creates no plan', async () => {
    const service = new AiProposalService(db, new MockAiProposalProvider()); const created = await service.generate(userA.id, input(), identity(userA.id)); const refined = await service.refine(userA.id, created.operation.id, { clientRequestId: randomUUID(), expectedRevision: 1, instruction: 'Move milestone later' }, identity(userA.id)); const ready = await service.transition(userA.id, created.operation.id, 2, 'READY_FOR_CONVERSION', identity(userA.id)); expect(ready.operation).toMatchObject({ status: 'READY_FOR_CONVERSION', readyProposalRevision: 2 }); const stored = await db.aiOperation.findUniqueOrThrow({ where: { id: created.operation.id }, include: { currentProposalRevision: true, readyProposalRevision: true } }); expect(stored.readyProposalRevisionId).toBe(stored.currentProposalRevisionId); expect(stored.readyProposalRevision?.revision).toBe(2); expect(await db.plan.count()).toBe(0); expect(await db.planVersion.count()).toBe(0); await expect(service.refine(userA.id, created.operation.id, { clientRequestId: randomUUID(), expectedRevision: refined.operation.currentProposalRevision!, instruction: 'Again' }, identity(userA.id))).rejects.toMatchObject({ code: 'AI_PROPOSAL_INVALID_STATE' })
  })

  it('allows only one winner for ready versus reject', async () => { const service = new AiProposalService(db, new MockAiProposalProvider()); const created = await service.generate(userA.id, input(), identity(userA.id)); const race = await Promise.allSettled([service.transition(userA.id, created.operation.id, 1, 'READY_FOR_CONVERSION', identity(userA.id)), service.transition(userA.id, created.operation.id, 1, 'REJECTED', identity(userA.id))]); expect(race.filter((item) => item.status === 'fulfilled')).toHaveLength(1) })

  it('commits reservation before provider completion and holds no long transaction', async () => { const provider = new GateProvider(); const service = new AiProposalService(db, provider); const pending = service.generate(userA.id, input(), identity(userA.id)); await provider.startedPromise; const reserved = await db.aiOperation.findFirstOrThrow({ where: { ownerUserId: userA.id } }); expect(reserved.status).toBe('PENDING'); expect(await db.$queryRaw`SELECT 1`).toBeTruthy(); provider.release(); await expect(pending).resolves.toMatchObject({ operation: { status: 'PROPOSED' } }) })

  it('recovers abandoned leases and discards the stale provider result', async () => {
    let clock = new Date('2026-07-21T00:00:00Z'); const leaseMs = proposalProcessingLeaseMs(60_000); const initial = new AiProposalService(db, new MockAiProposalProvider(), () => clock, leaseMs); const created = await initial.generate(userA.id, input(), identity(userA.id)); const provider = new GateProvider(); const service = new AiProposalService(db, provider, () => clock, leaseMs); const pending = service.refine(userA.id, created.operation.id, { clientRequestId: randomUUID(), expectedRevision: 1, instruction: 'Reduce budget' }, identity(userA.id)); await provider.startedPromise; clock = new Date('2026-07-21T00:03:00Z'); const cleanup = await new AiProposalExpirationService(db, () => clock).run({ limit: 10, dryRun: false }); expect(cleanup.refinementLeasesRecovered).toBe(1); provider.release(); await expect(pending).rejects.toMatchObject({ code: 'AI_PROPOSAL_CONFLICT' }); expect(await db.aiProposalRevision.count({ where: { aiOperationId: created.operation.id } })).toBe(1); expect((await db.aiOperation.findUniqueOrThrow({ where: { id: created.operation.id } })).status).toBe('PROPOSED')
  })

  it('distinguishes expiration from purge and deletes revisions and requests physically', async () => { const clock = new Date('2026-07-21T00:00:00Z'); const service = new AiProposalService(db, new MockAiProposalProvider(), () => clock); const created = await service.generate(userA.id, input(), identity(userA.id)); await db.aiOperation.update({ where: { id: created.operation.id }, data: { expiresAt: new Date('2026-07-20T00:00:00Z') } }); const cleanup = new AiProposalExpirationService(db, () => clock); expect(await cleanup.run({ limit: 10, dryRun: true })).toMatchObject({ expired: 0, purged: 0, dryRun: true }); expect(await cleanup.run({ limit: 10, dryRun: false })).toMatchObject({ expired: 1, purged: 0 }); expect(await db.aiProposalRevision.count({ where: { aiOperationId: created.operation.id } })).toBe(1); await db.aiOperation.update({ where: { id: created.operation.id }, data: { purgeAfter: new Date('2026-07-20T00:00:00Z') } }); expect(await cleanup.run({ limit: 10, dryRun: false })).toMatchObject({ purged: 1 }); expect(await db.aiProposalRevision.count({ where: { aiOperationId: created.operation.id } })).toBe(0); expect(await db.aiOperationRequest.count({ where: { aiOperationId: created.operation.id } })).toBe(0) })

  it('prevents a current revision from another operation at database commit', async () => { const service = new AiProposalService(db, new MockAiProposalProvider()); const a = await service.generate(userA.id, input(), identity(userA.id)); const b = await service.generate(userA.id, input(), identity(userA.id)); const wrong = await db.aiOperation.findUniqueOrThrow({ where: { id: b.operation.id } }); await expect(db.$transaction((tx) => tx.aiOperation.update({ where: { id: a.operation.id }, data: { currentProposalRevisionId: wrong.currentProposalRevisionId } }))).rejects.toBeTruthy() })

  it('deletes operation, revisions and request records while retaining only safe audit identifiers', async () => { const service = new AiProposalService(db, new MockAiProposalProvider()); const created = await service.generate(userA.id, input(), identity(userA.id)); await service.remove(userA.id, created.operation.id, identity(userA.id)); expect(await db.aiOperation.findUnique({ where: { id: created.operation.id } })).toBeNull(); expect(await db.aiProposalRevision.count({ where: { aiOperationId: created.operation.id } })).toBe(0); expect(await db.aiOperationRequest.count({ where: { aiOperationId: created.operation.id } })).toBe(0); const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'ai.proposal_deleted', targetId: created.operation.id } }); expect(JSON.stringify(audit)).not.toMatch(/goal|summary|phase|proposal content/i) })

  it('does not let another owner delete a conversation', async () => { const service = new AiProposalService(db, new MockAiProposalProvider()); const created = await service.generate(userA.id, input(), identity(userA.id)); await expect(service.remove(userB.id, created.operation.id, identity(userB.id))).rejects.toMatchObject({ code: 'AI_PROPOSAL_NOT_FOUND' }); expect(await db.aiOperation.findUnique({ where: { id: created.operation.id } })).toBeTruthy() })

  it('converts the exact ready revision, ignores a newer unaccepted revision, and is idempotent', async () => {
    const provider = new MockAiProposalProvider(); const proposals = new AiProposalService(db, provider); const conversions = new AiPlanConversionService(db, provider)
    const created = await proposals.generate(userA.id, input(), identity(userA.id)); const refined = await proposals.refine(userA.id, created.operation.id, { clientRequestId: randomUUID(), expectedRevision: 1, instruction: 'Reduce the budget' }, identity(userA.id)); await proposals.transition(userA.id, created.operation.id, 2, 'READY_FOR_CONVERSION', identity(userA.id))
    const readyRevision = await db.aiProposalRevision.findUniqueOrThrow({ where: { aiOperationId_revision: { aiOperationId: created.operation.id, revision: 2 } } }); const newerContent = { ...(readyRevision.content as object), title: 'UNACCEPTED TITLE' }
    const newer = await db.aiProposalRevision.create({ data: { aiOperationId: created.operation.id, revision: 3, parentRevisionId: readyRevision.id, content: newerContent, contentLanguage: 'EN', source: 'REFINEMENT', checksum: 'a'.repeat(64), contentSizeBytes: JSON.stringify(newerContent).length } })
    await db.aiOperation.update({ where: { id: created.operation.id }, data: { currentProposalRevisionId: newer.id } })
    const requestId = randomUUID(); const first = await conversions.convert(userA.id, created.operation.id, requestId, identity(userA.id)); const retry = await conversions.convert(userA.id, created.operation.id, requestId, identity(userA.id))
    expect(first.preview?.title).toBe((refined.proposal as AiPlanningProposal).title); expect(first.preview?.title).not.toBe('UNACCEPTED TITLE'); expect(retry.preview?.checksum).toBe(first.preview?.checksum)
  })

  it('creates Plan and linked PlanVersion revision 1 once in the confirmation transaction', async () => {
    const provider = new MockAiProposalProvider(); const proposals = new AiProposalService(db, provider); const conversions = new AiPlanConversionService(db, provider)
    const created = await proposals.generate(userA.id, input(), identity(userA.id)); await proposals.transition(userA.id, created.operation.id, 1, 'READY_FOR_CONVERSION', identity(userA.id)); const preview = await conversions.convert(userA.id, created.operation.id, randomUUID(), identity(userA.id)); const mutationId = randomUUID()
    const first = await conversions.confirm(userA.id, created.operation.id, { clientMutationId: mutationId, checksum: preview.preview!.checksum }, identity(userA.id)); const retry = await conversions.confirm(userA.id, created.operation.id, { clientMutationId: mutationId, checksum: preview.preview!.checksum }, identity(userA.id))
    expect(first.created).toBe(true); expect(retry).toMatchObject({ created: false, plan: { id: first.plan.id, revision: 1 } }); expect(await db.plan.count()).toBe(1)
    const version = await db.planVersion.findUniqueOrThrow({ where: { planId_revision: { planId: first.plan.id, revision: 1 } } }); expect(version).toMatchObject({ source: 'AI_GENERATION', aiOperationId: created.operation.id, revision: 1, schemaVersion: 8 })
  })

  it('permits one bounded repair attempt and never persists invalid output', async () => {
    const provider = new InvalidConversionProvider(); const proposals = new AiProposalService(db, provider); const conversions = new AiPlanConversionService(db, provider)
    const created = await proposals.generate(userA.id, input(), identity(userA.id)); await proposals.transition(userA.id, created.operation.id, 1, 'READY_FOR_CONVERSION', identity(userA.id))
    await expect(conversions.convert(userA.id, created.operation.id, randomUUID(), identity(userA.id))).rejects.toMatchObject({ code: 'AI_CONVERSION_INVALID_OUTPUT' })
    expect(provider.conversionCalls).toBe(2); expect(await db.plan.count()).toBe(0); expect(await db.planVersion.count()).toBe(0); expect((await db.aiOperation.findUniqueOrThrow({ where: { id: created.operation.id } })).status).toBe('CONVERSION_FAILED')
  })

  it('repairs one incomplete provider response and reaches preview with the exact accepted revision', async () => {
    const provider = new IncompleteThenValidConversionProvider(); const proposals = new AiProposalService(db, provider); const conversions = new AiPlanConversionService(db, provider)
    const created = await proposals.generate(userA.id, input(), identity(userA.id)); const ready = await proposals.transition(userA.id, created.operation.id, 1, 'READY_FOR_CONVERSION', identity(userA.id)); const result = await conversions.convert(userA.id, created.operation.id, randomUUID(), identity(userA.id))
    expect(provider.conversionCalls).toBe(2); expect(provider.repairReasons).toEqual([undefined, 'AI_PROVIDER_INCOMPLETE:max_output_tokens']); expect(result).toMatchObject({ status: 'PLAN_PREVIEW_READY', preview: { checksum: expect.stringMatching(/^[a-f0-9]{64}$/) } }); expect(ready.operation.readyProposalRevision).toBe(1)
  })

  it('deleting a completed conversation preserves its Plan and PlanVersion and nulls AI provenance', async () => {
    const provider = new MockAiProposalProvider(); const proposals = new AiProposalService(db, provider); const conversions = new AiPlanConversionService(db, provider)
    const created = await proposals.generate(userA.id, input(), identity(userA.id)); await proposals.transition(userA.id, created.operation.id, 1, 'READY_FOR_CONVERSION', identity(userA.id)); const preview = await conversions.convert(userA.id, created.operation.id, randomUUID(), identity(userA.id)); const confirmed = await conversions.confirm(userA.id, created.operation.id, { clientMutationId: randomUUID(), checksum: preview.preview!.checksum }, identity(userA.id))
    await proposals.remove(userA.id, created.operation.id, identity(userA.id))
    expect(await db.plan.findUnique({ where: { id: confirmed.plan.id } })).toBeTruthy(); const versions = await db.planVersion.findMany({ where: { planId: confirmed.plan.id } }); expect(versions).toHaveLength(1); expect(versions[0].aiOperationId).toBeNull()
  })
})
