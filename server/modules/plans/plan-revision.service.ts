import { Prisma, type PlanVersionSource } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { derivePlanRelationalMetadata, type CanonicalPlan } from '../../../shared/plan-contract/index.js'
import { prepareVersionSnapshot } from './plan-version-integrity.js'

export type PlanAuditIdentity = {
  actorUserId: string
  effectiveUserId: string
  impersonationSessionId?: string
  ipAddress?: string
  userAgent?: string
}

type SafeAuditMetadata = Record<string, string | number | boolean>

function relational(snapshot: CanonicalPlan) {
  const metadata = derivePlanRelationalMetadata(snapshot)
  return { ...metadata, startDate: new Date(`${metadata.startDate}T00:00:00Z`), endDate: new Date(`${metadata.endDate}T00:00:00Z`) }
}

export class PlanRevisionService {
  async createInitial(tx: Prisma.TransactionClient, input: {
    ownerUserId: string
    snapshot: unknown
    source: Extract<PlanVersionSource, 'USER' | 'IMPORT' | 'AI_GENERATION'>
    identity: PlanAuditIdentity
    status?: string
    importKey?: string
    clientMutationId?: string
    auditAction: string
    auditMetadata?: SafeAuditMetadata
    aiOperationId?: string
  }) {
    const prepared = prepareVersionSnapshot(input.snapshot)
    const plan = await tx.plan.create({
      data: {
        ownerUserId: input.ownerUserId,
        status: input.status ?? 'active',
        importKey: input.importKey,
        clientMutationId: input.clientMutationId,
        snapshot: prepared.snapshot as Prisma.InputJsonValue,
        revision: 1,
        ...relational(prepared.snapshot),
      },
    })
    const version = await tx.planVersion.create({
      data: {
        planId: plan.id,
        revision: 1,
        schemaVersion: prepared.schemaVersion,
        snapshot: prepared.snapshot as Prisma.InputJsonValue,
        source: input.source,
        actorUserId: input.identity.actorUserId,
        effectiveUserId: input.identity.effectiveUserId,
        checksum: prepared.checksum,
        snapshotSizeBytes: prepared.snapshotSizeBytes,
        aiOperationId: input.aiOperationId,
      },
    })
    await this.audit(tx, input.identity, input.auditAction, plan.id, { ...input.auditMetadata, revision: 1, versionId: version.id })
    return { plan, version, prepared }
  }

  async createNext(tx: Prisma.TransactionClient, input: {
    planId: string
    expectedRevision: number
    snapshot: unknown
    source: Exclude<PlanVersionSource, 'MIGRATION' | 'SYSTEM' | 'AI_GENERATION' | 'AI_REFINEMENT' | 'AI_PATCH'>
    identity: PlanAuditIdentity
    authorizedWhere: Prisma.PlanWhereInput
    lifecycleWhere?: Prisma.PlanWhereInput
    planData?: Prisma.PlanUncheckedUpdateManyInput
    restoredFromVersionId?: string
    auditAction: string
    auditMetadata?: SafeAuditMetadata
    onNoUpdate?: (tx: Prisma.TransactionClient) => Promise<never>
  }) {
    const parent = await tx.planVersion.findUnique({ where: { planId_revision: { planId: input.planId, revision: input.expectedRevision } }, select: { id: true } })
    if (!parent) throw new ApiError(503, 'PLAN_VERSION_HISTORY_NOT_READY', 'Version history is not ready for this plan.')
    const prepared = prepareVersionSnapshot(input.snapshot)
    const createdRevision = input.expectedRevision + 1
    const updated = await tx.plan.updateMany({
      where: { id: input.planId, revision: input.expectedRevision, ...input.authorizedWhere, ...(input.lifecycleWhere ?? {}) },
      data: {
        snapshot: prepared.snapshot as Prisma.InputJsonValue,
        revision: createdRevision,
        ...relational(prepared.snapshot),
        ...(input.planData ?? {}),
      },
    })
    if (updated.count !== 1) {
      if (input.onNoUpdate) return input.onNoUpdate(tx)
      throw new ApiError(409, 'PLAN_VERSION_CONFLICT', 'This plan was updated from another session.', { expectedRevision: input.expectedRevision })
    }
    const version = await tx.planVersion.create({
      data: {
        planId: input.planId,
        revision: createdRevision,
        schemaVersion: prepared.schemaVersion,
        snapshot: prepared.snapshot as Prisma.InputJsonValue,
        source: input.source,
        actorUserId: input.identity.actorUserId,
        effectiveUserId: input.identity.effectiveUserId,
        parentVersionId: parent.id,
        restoredFromVersionId: input.restoredFromVersionId,
        checksum: prepared.checksum,
        snapshotSizeBytes: prepared.snapshotSizeBytes,
      },
    })
    await this.audit(tx, input.identity, input.auditAction, input.planId, { ...input.auditMetadata, createdRevision, versionId: version.id })
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: input.planId } })
    return { plan, version, prepared }
  }

  async requireCurrentVersion(tx: Prisma.TransactionClient, planId: string, revision: number) {
    const version = await tx.planVersion.findUnique({ where: { planId_revision: { planId, revision } } })
    if (!version) throw new ApiError(503, 'PLAN_VERSION_HISTORY_NOT_READY', 'Version history is not ready for this plan.')
    return version
  }

  private audit(tx: Prisma.TransactionClient, identity: PlanAuditIdentity, action: string, planId: string, metadata: SafeAuditMetadata = {}) {
    return tx.auditLog.create({ data: { action, actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: planId, metadata, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } })
  }
}
