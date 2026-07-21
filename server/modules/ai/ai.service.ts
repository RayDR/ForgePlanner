import { randomUUID } from 'node:crypto'
import { Prisma, type AiOperation, type PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import { assertSafeAiInput } from './ai-input-safety.js'
import { fingerprint, prepareProposal } from './ai-integrity.js'
import { detectProposalLanguage, selectProposalLanguage } from './ai-language.js'
import type { AiProposalProvider } from './ai-provider.js'
import type { ProposalInput } from './ai.schemas.js'

export type AiIdentity = { actorUserId: string; effectiveUserId: string; impersonationSessionId?: string; ipAddress?: string; userAgent?: string }
const LEASE_MS = 30_000; const PROPOSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000; const READY_TTL_MS = 90 * 24 * 60 * 60 * 1000

function safeMetadata(input: ProposalInput, selectedLanguage: 'EN' | 'ES') {
  return { inputLength: input.goal.length + (input.additionalContext?.length ?? 0), selectedLanguage, hasStartDate: Boolean(input.startDate), hasTargetDate: Boolean(input.targetDate), hasBudget: input.monthlyBudget != null, constraintCount: input.constraints.length, nonNegotiableCount: input.nonNegotiables.length, intensity: input.planIntensity }
}

function metadata(operation: AiOperation & { currentProposalRevision?: { revision: number } | null; readyProposalRevision?: { revision: number } | null }) {
  return { id: operation.id, title: operation.title, status: operation.status, selectedLanguage: operation.selectedLanguage, detectedLanguage: operation.detectedLanguage, currentProposalRevision: operation.currentProposalRevision?.revision ?? null, readyProposalRevision: operation.readyProposalRevision?.revision ?? null, refinementCount: operation.refinementCount, createdAt: operation.createdAt, updatedAt: operation.updatedAt, expiresAt: operation.expiresAt }
}

export class AiProposalService {
  constructor(private db: PrismaClient, private provider: AiProposalProvider, private now = () => new Date()) {}

  async generate(ownerUserId: string, input: ProposalInput, identity: AiIdentity, signal?: AbortSignal) {
    assertSafeAiInput([input.goal, input.additionalContext ?? '', ...input.constraints, ...input.nonNegotiables])
    const detected = detectProposalLanguage(`${input.goal} ${input.additionalContext ?? ''}`)
    const selected = selectProposalLanguage({ preferred: input.preferredLanguage, detected, fallback: input.locale })
    const requestFingerprint = fingerprint({ ...input, clientRequestId: undefined })
    const reservation = await this.db.$transaction(async (tx) => {
      const existing = await tx.aiOperation.findUnique({ where: { ownerUserId_generationClientRequestId: { ownerUserId, generationClientRequestId: input.clientRequestId } }, include: { currentProposalRevision: true, readyProposalRevision: true } })
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'This request identifier was already used with different input.')
        return { cached: existing, requestId: existing.processingRequestId }
      }
      const active = await tx.aiOperation.count({ where: { ownerUserId, status: { in: ['DRAFT','PENDING','PROPOSED','REFINING','READY_FOR_CONVERSION'] }, expiresAt: { gt: this.now() } } })
      if (active >= 10) throw new ApiError(429, 'AI_PROPOSAL_LIMIT_REACHED', 'The active proposal limit has been reached.')
      const requestId = randomUUID(); const now = this.now(); const lease = new Date(now.getTime() + LEASE_MS)
      const operation = await tx.aiOperation.create({ data: { ownerUserId, status: 'PENDING', selectedLanguage: selected, detectedLanguage: detected, provider: this.provider.name, model: this.provider.model, promptTemplateVersion: 'proposal-v1', sanitizedInputMetadata: safeMetadata(input, selected), requestFingerprint, generationClientRequestId: input.clientRequestId, processingRequestId: requestId, processingLeaseExpiresAt: lease, expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS), requests: { create: { id: requestId, ownerUserId, type: 'GENERATION', clientRequestId: input.clientRequestId, requestFingerprint, status: 'RESERVED', leaseExpiresAt: lease } } } })
      return { operation, requestId }
    })
    if ('cached' in reservation && reservation.cached) return this.dto(reservation.cached)
    let providerResult
    try { providerResult = await this.callProvider((providerSignal) => this.provider.generateProposal(input, { language: selected, correlationId: reservation.requestId, signal: providerSignal }), signal) }
    catch (error) { await this.failGeneration(reservation.operation.id, reservation.requestId, this.providerError(error)); throw this.providerApiError(error) }
    let prepared
    try { prepared = prepareProposal(providerResult.proposal) } catch { await this.failGeneration(reservation.operation.id, reservation.requestId, 'AI_PROPOSAL_INVALID_OUTPUT'); throw new ApiError(502, 'AI_PROPOSAL_INVALID_OUTPUT', 'The proposal provider returned invalid content.') }
    return this.db.$transaction(async (tx) => {
      const current = await tx.aiOperation.findFirst({ where: { id: reservation.operation.id, ownerUserId, status: 'PENDING', processingRequestId: reservation.requestId, processingLeaseExpiresAt: { gt: this.now() } } })
      if (!current) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'The proposal state changed before generation completed.')
      const revision = await tx.aiProposalRevision.create({ data: { aiOperationId: current.id, revision: 1, content: prepared.proposal as Prisma.InputJsonValue, contentLanguage: selected, source: 'INITIAL_GENERATION', providerRequestId: providerResult.providerRequestId, inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null, checksum: prepared.checksum, contentSizeBytes: prepared.sizeBytes } })
      const operation = await tx.aiOperation.update({ where: { id: current.id }, data: { title: prepared.proposal.title, status: 'PROPOSED', currentProposalRevisionId: revision.id, processingRequestId: null, processingLeaseExpiresAt: null, errorCode: null }, include: { currentProposalRevision: true, readyProposalRevision: true } })
      await tx.aiOperationRequest.update({ where: { id: reservation.requestId }, data: { status: 'SUCCEEDED', resultRevision: 1, completedAt: this.now() } })
      await this.audit(tx, identity, 'ai.proposal_created', operation.id, { revision: 1, language: selected, provider: this.provider.name, model: this.provider.model })
      return this.dto(operation)
    })
  }

  async refine(ownerUserId: string, operationId: string, input: { clientRequestId: string; expectedRevision: number; instruction: string }, identity: AiIdentity, signal?: AbortSignal) {
    assertSafeAiInput([input.instruction]); const requestFingerprint = fingerprint(input)
    const reservation = await this.db.$transaction(async (tx) => {
      const operation = await tx.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, include: { currentProposalRevision: true, readyProposalRevision: true } })
      if (!operation) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.')
      const existing = await tx.aiOperationRequest.findUnique({ where: { aiOperationId_type_clientRequestId: { aiOperationId: operationId, type: 'REFINEMENT', clientRequestId: input.clientRequestId } } })
      if (existing) { if (existing.requestFingerprint !== requestFingerprint) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'This refinement identifier was already used with different input.'); if (existing.status === 'SUCCEEDED') return { cached: operation }; throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'This refinement is already being processed.') }
      this.assertUsable(operation)
      if (operation.status !== 'PROPOSED') throw new ApiError(409, 'AI_PROPOSAL_INVALID_STATE', 'This proposal cannot be refined in its current state.')
      if (operation.currentProposalRevision?.revision !== input.expectedRevision) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'The proposal revision is stale.')
      if (operation.refinementCount >= 8) throw new ApiError(429, 'AI_PROPOSAL_REFINEMENT_LIMIT', 'The refinement limit has been reached.')
      const requestId = randomUUID(); const lease = new Date(this.now().getTime() + LEASE_MS)
      await tx.aiOperationRequest.create({ data: { id: requestId, ownerUserId, aiOperationId: operation.id, type: 'REFINEMENT', clientRequestId: input.clientRequestId, requestFingerprint, expectedRevision: input.expectedRevision, status: 'RESERVED', leaseExpiresAt: lease } })
      const reserved = await tx.aiOperation.updateMany({ where: { id: operation.id, ownerUserId, status: 'PROPOSED', currentProposalRevisionId: operation.currentProposalRevisionId }, data: { status: 'REFINING', processingRequestId: requestId, processingLeaseExpiresAt: lease } })
      if (reserved.count !== 1) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'The proposal changed concurrently.')
      return { operation, requestId, proposal: operation.currentProposalRevision!.content as unknown as AiPlanningProposal }
    })
    if ('cached' in reservation && reservation.cached) return this.dto(reservation.cached)
    const language = reservation.operation.selectedLanguage
    let providerResult
    try { providerResult = await this.callProvider((providerSignal) => this.provider.refineProposal(reservation.proposal, input.instruction, { language, correlationId: reservation.requestId, signal: providerSignal }), signal) }
    catch (error) { await this.failRefinement(operationId, reservation.requestId, this.providerError(error)); throw this.providerApiError(error) }
    let prepared
    try { prepared = prepareProposal(providerResult.proposal) } catch { await this.failRefinement(operationId, reservation.requestId, 'AI_PROPOSAL_INVALID_OUTPUT'); throw new ApiError(502, 'AI_PROPOSAL_INVALID_OUTPUT', 'The proposal provider returned invalid content.') }
    return this.db.$transaction(async (tx) => {
      const current = await tx.aiOperation.findFirst({ where: { id: operationId, ownerUserId, status: 'REFINING', processingRequestId: reservation.requestId, currentProposalRevisionId: reservation.operation.currentProposalRevisionId, processingLeaseExpiresAt: { gt: this.now() } } })
      if (!current) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'The proposal state changed before refinement completed.')
      const nextRevision = input.expectedRevision + 1
      const revision = await tx.aiProposalRevision.create({ data: { aiOperationId: operationId, revision: nextRevision, parentRevisionId: reservation.operation.currentProposalRevisionId, content: prepared.proposal as Prisma.InputJsonValue, contentLanguage: language, source: 'REFINEMENT', providerRequestId: providerResult.providerRequestId, inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null, checksum: prepared.checksum, contentSizeBytes: prepared.sizeBytes } })
      const operation = await tx.aiOperation.update({ where: { id: operationId }, data: { title: prepared.proposal.title, status: 'PROPOSED', currentProposalRevisionId: revision.id, refinementCount: { increment: 1 }, processingRequestId: null, processingLeaseExpiresAt: null }, include: { currentProposalRevision: true, readyProposalRevision: true } })
      await tx.aiOperationRequest.update({ where: { id: reservation.requestId }, data: { status: 'SUCCEEDED', resultRevision: nextRevision, completedAt: this.now() } })
      await this.audit(tx, identity, 'ai.proposal_refined', operation.id, { revision: nextRevision, language, provider: this.provider.name, model: this.provider.model })
      return this.dto(operation)
    })
  }

  async transition(ownerUserId: string, operationId: string, expectedRevision: number, target: 'READY_FOR_CONVERSION' | 'REJECTED', identity: AiIdentity) {
    return this.db.$transaction(async (tx) => {
      const operation = await tx.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, include: { currentProposalRevision: true, readyProposalRevision: true } })
      if (!operation) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.')
      if (operation.status === target) return this.dto(operation)
      this.assertUsable(operation)
      if (operation.status !== 'PROPOSED' || operation.currentProposalRevision?.revision !== expectedRevision) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'The proposal state or revision changed.')
      const now = this.now(); const ready = target === 'READY_FOR_CONVERSION'
      const updated = await tx.aiOperation.updateMany({ where: { id: operationId, ownerUserId, status: 'PROPOSED', currentProposalRevisionId: operation.currentProposalRevisionId }, data: ready ? { status: target, readyProposalRevisionId: operation.currentProposalRevisionId, acceptedAt: now, expiresAt: new Date(now.getTime() + READY_TTL_MS) } : { status: target, rejectedAt: now, expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS) } })
      if (updated.count !== 1) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'Another transition won this request.')
      await this.audit(tx, identity, ready ? 'ai.proposal_ready' : 'ai.proposal_rejected', operation.id, { revision: expectedRevision, status: target })
      return this.dto(await tx.aiOperation.findUniqueOrThrow({ where: { id: operationId }, include: { currentProposalRevision: true, readyProposalRevision: true } }))
    })
  }

  async list(ownerUserId: string, page: number, limit: number) { const where = { ownerUserId }; const [total, operations] = await this.db.$transaction([this.db.aiOperation.count({ where }), this.db.aiOperation.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit, include: { currentProposalRevision: { select: { revision: true } }, readyProposalRevision: { select: { revision: true } } } })]); return { operations: operations.map(metadata), total, page, limit } }
  async get(ownerUserId: string, operationId: string) { const operation = await this.db.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, include: { currentProposalRevision: true, readyProposalRevision: true } }); if (!operation) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.'); return this.dto(operation) }
  async revisions(ownerUserId: string, operationId: string) { await this.requireOwner(ownerUserId, operationId); return this.db.aiProposalRevision.findMany({ where: { aiOperationId: operationId }, orderBy: { revision: 'desc' }, select: { id: true, revision: true, source: true, contentLanguage: true, createdAt: true, checksum: true, contentSizeBytes: true, providerRequestId: true } }) }
  async revision(ownerUserId: string, operationId: string, revision: number) { await this.requireOwner(ownerUserId, operationId); const item = await this.db.aiProposalRevision.findUnique({ where: { aiOperationId_revision: { aiOperationId: operationId, revision } } }); if (!item) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal revision not found.'); return { ...item, estimatedCostMicros: item.estimatedCostMicros?.toString() ?? null } }
  async remove(ownerUserId: string, operationId: string, identity: AiIdentity) { return this.db.$transaction(async (tx) => { const operation = await tx.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, select: { id: true } }); if (!operation) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.'); await this.audit(tx, identity, 'ai.proposal_deleted', operationId, {}); await tx.aiOperation.delete({ where: { id: operationId } }); return { deleted: true } }) }

  private dto(operation: AiOperation & { currentProposalRevision?: { revision: number; content: Prisma.JsonValue; checksum?: string } | null; readyProposalRevision?: { revision: number } | null }) { return { operation: metadata(operation), proposal: operation.currentProposalRevision?.content ?? null } }
  private assertUsable(operation: AiOperation) { if (operation.expiresAt <= this.now() || operation.status === 'EXPIRED') throw new ApiError(410, 'AI_PROPOSAL_EXPIRED', 'This proposal has expired.') }
  private async requireOwner(ownerUserId: string, operationId: string) { if (!await this.db.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, select: { id: true } })) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.') }
  private async failGeneration(operationId: string, requestId: string, code: string) { await this.db.$transaction([this.db.aiOperation.updateMany({ where: { id: operationId, status: 'PENDING', processingRequestId: requestId }, data: { status: 'FAILED', errorCode: code, failedAt: this.now(), processingRequestId: null, processingLeaseExpiresAt: null, expiresAt: new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000) } }), this.db.aiOperationRequest.updateMany({ where: { id: requestId, status: 'RESERVED' }, data: { status: 'FAILED', safeErrorCode: code, completedAt: this.now() } })]) }
  private async failRefinement(operationId: string, requestId: string, code: string) { await this.db.$transaction([this.db.aiOperation.updateMany({ where: { id: operationId, status: 'REFINING', processingRequestId: requestId }, data: { status: 'PROPOSED', processingRequestId: null, processingLeaseExpiresAt: null } }), this.db.aiOperationRequest.updateMany({ where: { id: requestId, status: 'RESERVED' }, data: { status: 'FAILED', safeErrorCode: code, completedAt: this.now() } })]) }
  private providerError(error: unknown) { return error instanceof DOMException && error.name === 'AbortError' ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE' }
  private providerApiError(error: unknown) { const code = this.providerError(error); return new ApiError(code === 'AI_PROVIDER_TIMEOUT' ? 504 : 503, code, code === 'AI_PROVIDER_TIMEOUT' ? 'The proposal provider timed out.' : 'The proposal provider is unavailable.') }
  private async callProvider<T>(call: (signal: AbortSignal) => Promise<T>, callerSignal?: AbortSignal) { const controller = new AbortController(); const abort = () => controller.abort(); callerSignal?.addEventListener('abort', abort, { once: true }); const timer = setTimeout(() => controller.abort(), LEASE_MS); try { return await call(controller.signal) } finally { clearTimeout(timer); callerSignal?.removeEventListener('abort', abort) } }
  private audit(tx: Prisma.TransactionClient, identity: AiIdentity, action: string, operationId: string, safe: Record<string, string | number>) { return tx.auditLog.create({ data: { action, actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'ai_operation', targetId: operationId, metadata: safe, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } }) }
}
