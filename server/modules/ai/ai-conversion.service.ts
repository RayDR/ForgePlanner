import { Prisma, type AiOperation, type PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { safeValidateCanonicalPlan, type CanonicalPlan } from '../../../shared/plan-contract/index.js'
import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import { prepareVersionSnapshot } from '../plans/plan-version-integrity.js'
import { PlanRevisionService } from '../plans/plan-revision.service.js'
import { toPlanDto } from '../plans/plan.service.js'
import type { AiIdentity } from './ai.service.js'
import type { AiProposalProvider, PlanConversionResult } from './ai-provider.js'

const CONVERSION_PROMPT_VERSION = 'canonical-plan-v8-1'
const CONVERSION_LEASE_MS = 120_000
const MAX_REGENERATIONS = 2

function approvedContext(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {}
  const candidate = (value as Record<string, unknown>).approvedContext
  return candidate && !Array.isArray(candidate) && typeof candidate === 'object' ? candidate as Record<string, unknown> : {}
}

export function conversionPreview(plan: CanonicalPlan, checksum: string, proposal?: AiPlanningProposal | null) {
  return {
    checksum,
    title: plan.project.name,
    objective: plan.project.objective,
    startDate: plan.project.startDate,
    endDate: plan.project.endDate,
    goalsCount: plan.project.goals.length,
    milestonesCount: plan.project.milestones.length,
    activitiesCount: plan.activities.length,
    planningMode: plan.metadata.planningMode ?? 'auto',
    savingsEnabled: plan.project.savingsPlan.enabled === true,
    assumptions: proposal?.assumptions ?? [],
    warnings: proposal?.warnings ?? [],
  }
}

function safeConversionError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return new ApiError(504, 'AI_CONVERSION_TIMEOUT', 'Plan conversion timed out.')
  if (error instanceof ApiError) return error
  if (error instanceof Error && error.message === 'AI_PLAN_INVALID_OUTPUT') return new ApiError(502, 'AI_CONVERSION_INVALID_OUTPUT', 'The provider returned an invalid plan structure.')
  return new ApiError(503, 'AI_CONVERSION_UNAVAILABLE', 'Plan conversion is temporarily unavailable.')
}

export class AiPlanConversionService {
  private revisions = new PlanRevisionService()
  constructor(private db: PrismaClient, private provider: AiProposalProvider, private now = () => new Date()) {}

  async get(ownerUserId: string, operationId: string) {
    const operation = await this.db.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, include: { readyProposalRevision: true } })
    if (!operation) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.')
    return this.dto(operation)
  }

  async convert(ownerUserId: string, operationId: string, clientRequestId: string, identity: AiIdentity, signal?: AbortSignal) {
    const reservation = await this.db.$transaction(async (tx) => {
      const operation = await tx.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, include: { readyProposalRevision: true, currentProposalRevision: true } })
      if (!operation) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.')
      if (operation.status === 'COMPLETED' && operation.createdPlanId) return { cached: operation }
      if (operation.conversionClientRequestId === clientRequestId) {
        if (operation.status === 'PLAN_PREVIEW_READY' && operation.conversionSnapshot && operation.conversionChecksum) return { cached: operation }
        if (operation.status === 'CONVERTING') throw new ApiError(409, 'AI_CONVERSION_IN_PROGRESS', 'This conversion is already in progress.')
        if (operation.status === 'CONVERSION_FAILED') throw new ApiError(409, operation.errorCode ?? 'AI_CONVERSION_FAILED', 'This conversion request failed. Start a new conversion request to retry.')
      }
      if (!operation.readyProposalRevisionId || !operation.readyProposalRevision) throw new ApiError(409, 'AI_PROPOSAL_NOT_READY', 'Accept a proposal revision before conversion.')
      if (!['READY_FOR_CONVERSION','PLAN_PREVIEW_READY','CONVERSION_FAILED'].includes(operation.status)) throw new ApiError(409, 'AI_PROPOSAL_INVALID_STATE', 'This proposal cannot be converted in its current state.')
      const regeneration = operation.status === 'PLAN_PREVIEW_READY'
      if (regeneration && operation.regenerationCount >= MAX_REGENERATIONS) throw new ApiError(429, 'AI_CONVERSION_REGENERATION_LIMIT', 'The structure regeneration limit has been reached.')
      const startedAt = this.now()
      const reserved = await tx.aiOperation.updateMany({
        where: { id: operation.id, ownerUserId, status: operation.status, readyProposalRevisionId: operation.readyProposalRevisionId },
        data: { status: 'CONVERTING', conversionClientRequestId: clientRequestId, conversionProvider: this.provider.name, conversionModel: this.provider.conversionModel ?? this.provider.model, conversionPromptVersion: CONVERSION_PROMPT_VERSION, conversionStartedAt: startedAt, processingLeaseExpiresAt: new Date(startedAt.getTime() + CONVERSION_LEASE_MS), errorCode: null, failedAt: null, ...(regeneration ? { regenerationCount: { increment: 1 } } : {}) },
      })
      if (reserved.count !== 1) throw new ApiError(409, 'AI_CONVERSION_CONFLICT', 'The conversion state changed concurrently.')
      await this.audit(tx, identity, regeneration ? 'ai.plan_regeneration_started' : 'ai.plan_conversion_started', operation.id, { readyProposalRevisionId: operation.readyProposalRevisionId, provider: this.provider.name, model: this.provider.conversionModel ?? this.provider.model })
      return { operation, proposal: operation.readyProposalRevision.content as unknown as AiPlanningProposal }
    })
    if ('cached' in reservation) return this.dto(reservation.cached!)

    const controller = new AbortController(); const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); const timer = setTimeout(() => controller.abort(), CONVERSION_LEASE_MS)
    let result: PlanConversionResult | undefined
    let prepared: ReturnType<typeof prepareVersionSnapshot> | undefined
    try {
      let validationCategory: string | undefined
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!this.provider.convertAcceptedProposalToPlan) throw new ApiError(503, 'AI_CONVERSION_UNAVAILABLE', 'The configured provider does not support plan conversion.')
        result = await this.provider.convertAcceptedProposalToPlan(reservation.proposal, { language: reservation.operation.selectedLanguage, correlationId: clientRequestId, signal: controller.signal, approvedContext: approvedContext(reservation.operation.sanitizedInputMetadata), now: this.now().toISOString(), repairReason: validationCategory })
        const validation = safeValidateCanonicalPlan(result.plan)
        if (validation.success && validation.plan.schemaVersion === 8 && validation.plan.metadata.origin === 'ai') { prepared = prepareVersionSnapshot(validation.plan); break }
        validationCategory = validation.success ? 'PROTECTED_METADATA' : validation.issues.slice(0, 8).map((item) => item.code).join(',')
      }
      if (!prepared || !result) throw new ApiError(502, 'AI_CONVERSION_INVALID_OUTPUT', 'The provider returned an invalid plan structure.')
    } catch (error) {
      const safe = safeConversionError(error)
      await this.fail(ownerUserId, operationId, clientRequestId, safe.code)
      throw safe
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.aiOperation.updateMany({ where: { id: operationId, ownerUserId, status: 'CONVERTING', conversionClientRequestId: clientRequestId, readyProposalRevisionId: reservation.operation.readyProposalRevisionId }, data: { status: 'PLAN_PREVIEW_READY', conversionSnapshot: prepared!.snapshot as Prisma.InputJsonValue, conversionChecksum: prepared!.checksum, conversionSizeBytes: prepared!.snapshotSizeBytes, conversionProviderRequestId: result!.providerRequestId, conversionInputTokenCount: result!.inputTokenCount, conversionOutputTokenCount: result!.outputTokenCount, previewReadyAt: this.now(), processingLeaseExpiresAt: null, errorCode: null } })
      if (updated.count !== 1) throw new ApiError(409, 'AI_CONVERSION_CONFLICT', 'The conversion state changed before completion.')
      await this.audit(tx, identity, 'ai.plan_preview_ready', operationId, { readyProposalRevisionId: reservation.operation.readyProposalRevisionId!, checksum: prepared!.checksum, sizeBytes: prepared!.snapshotSizeBytes })
      return this.dto(await tx.aiOperation.findUniqueOrThrow({ where: { id: operationId }, include: { readyProposalRevision: true } }))
    })
  }

  async confirm(ownerUserId: string, operationId: string, input: { clientMutationId: string; checksum: string }, identity: AiIdentity) {
    try {
      return await this.db.$transaction(async (tx) => {
        const operation = await tx.aiOperation.findFirst({ where: { id: operationId, ownerUserId }, include: { readyProposalRevision: true, createdPlan: true } })
        if (!operation) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.')
        if (operation.status === 'COMPLETED' && operation.createdPlan) return { plan: toPlanDto(operation.createdPlan, ownerUserId), created: false }
        if (operation.status !== 'PLAN_PREVIEW_READY' || !operation.conversionSnapshot || !operation.conversionChecksum || !operation.readyProposalRevisionId) throw new ApiError(409, 'AI_CONVERSION_NOT_READY', 'Generate a valid plan preview before creating the plan.')
        if (operation.conversionChecksum !== input.checksum) throw new ApiError(409, 'AI_CONVERSION_CONFLICT', 'The plan preview checksum is stale.')
        const verified = prepareVersionSnapshot(operation.conversionSnapshot)
        if (verified.checksum !== operation.conversionChecksum) throw new ApiError(500, 'AI_CONVERSION_INTEGRITY_ERROR', 'The generated plan preview failed its integrity check.')
        const created = await this.revisions.createInitial(tx, { ownerUserId, snapshot: verified.snapshot, source: 'AI_GENERATION', identity, clientMutationId: input.clientMutationId, aiOperationId: operation.id, auditAction: 'ai.plan_created', auditMetadata: { aiOperationId: operation.id } })
        const completed = await tx.aiOperation.updateMany({ where: { id: operation.id, ownerUserId, status: 'PLAN_PREVIEW_READY', readyProposalRevisionId: operation.readyProposalRevisionId, conversionChecksum: operation.conversionChecksum, createdPlanId: null }, data: { status: 'COMPLETED', createdPlanId: created.plan.id, completedAt: this.now(), errorCode: null } })
        if (completed.count !== 1) throw new ApiError(409, 'AI_CONVERSION_CONFLICT', 'Another creation request completed this operation.')
        await this.audit(tx, identity, 'ai.operation_completed', operation.id, { planId: created.plan.id, readyProposalRevisionId: operation.readyProposalRevisionId, checksum: verified.checksum })
        return { plan: toPlanDto(created.plan, ownerUserId), created: true }
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      const operation = await this.db.aiOperation.findFirst({ where: { id: operationId, ownerUserId, status: 'COMPLETED' }, include: { createdPlan: true } })
      if (!operation?.createdPlan) throw error
      return { plan: toPlanDto(operation.createdPlan, ownerUserId), created: false }
    }
  }

  private dto(operation: AiOperation & { readyProposalRevision?: { content: Prisma.JsonValue } | null }) {
    if (!operation.conversionSnapshot || !operation.conversionChecksum) return { status: operation.status, preview: null }
    const prepared = prepareVersionSnapshot(operation.conversionSnapshot, { status: 500, code: 'AI_CONVERSION_INTEGRITY_ERROR' })
    if (prepared.checksum !== operation.conversionChecksum) throw new ApiError(500, 'AI_CONVERSION_INTEGRITY_ERROR', 'The generated plan preview failed its integrity check.')
    return { status: operation.status, preview: conversionPreview(prepared.snapshot, prepared.checksum, operation.readyProposalRevision?.content as unknown as AiPlanningProposal | null), regenerationCount: operation.regenerationCount }
  }

  private async fail(ownerUserId: string, operationId: string, requestId: string, code: string) { await this.db.aiOperation.updateMany({ where: { id: operationId, ownerUserId, status: 'CONVERTING', conversionClientRequestId: requestId }, data: { status: 'CONVERSION_FAILED', errorCode: code, failedAt: this.now(), processingLeaseExpiresAt: null } }) }
  private audit(tx: Prisma.TransactionClient, identity: AiIdentity, action: string, operationId: string, metadata: Record<string, string | number>) { return tx.auditLog.create({ data: { action, actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'ai_operation', targetId: operationId, metadata, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } }) }
}
