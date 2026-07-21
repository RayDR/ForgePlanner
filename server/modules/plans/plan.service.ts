import { Prisma, type PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { derivePlanRelationalMetadata, parsePlanDocument, type CanonicalPlan } from '../../../shared/plan-contract/index.js'
import { prepareVersionSnapshot } from './plan-version-integrity.js'
import { PlanRevisionService, type PlanAuditIdentity } from './plan-revision.service.js'

type PlanInput = { status?: 'active'; snapshot: CanonicalPlan }
type CreatePlanInput = PlanInput & { clientMutationId: string }
type ImportPlanInput = PlanInput & { importKey: string }
type PlanUpdateInput = { snapshot: CanonicalPlan; expectedRevision: number }
type PlanLifecycleInput = { expectedRevision: number }

type PlanRecord = { id: string; ownerUserId: string; name: string; objective: string | null; startDate: Date; endDate: Date; status: string; sharingEnabled: boolean; snapshot: Prisma.JsonValue; importKey: string | null; revision: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null; purgeAfter: Date | null; deletedByUserId: string | null }
type TrashListRecord = Pick<PlanRecord, 'id' | 'name' | 'objective' | 'revision' | 'deletedAt' | 'purgeAfter' | 'sharingEnabled' | 'startDate' | 'endDate'>

export function toPlanDto(plan: PlanRecord, userId?: string, sharedLevel?: 'editor' | 'viewer', includeImportKey = false) {
  const parsed = parsePlanDocument(plan.snapshot)
  if (!parsed.success) throw new ApiError(500, 'CORRUPTED_PLAN_SNAPSHOT', 'The stored plan failed contract validation.')
  const metadata = derivePlanRelationalMetadata(parsed.plan)
  return {
    id: plan.id,
    accessLevel: userId && plan.ownerUserId === userId ? 'owner' as const : sharedLevel,
    sharingEnabled: plan.sharingEnabled,
    ...metadata,
    status: plan.status,
    snapshot: parsed.plan,
    revision: plan.revision,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    ...(includeImportKey ? { importKey: plan.importKey } : {}),
  }
}

function trashListDto(plan: TrashListRecord, now = new Date()) {
  if (!plan.deletedAt || !plan.purgeAfter) throw new ApiError(500, 'INVALID_TRASH_STATE', 'The deleted plan has incomplete retention metadata.')
  return { id: plan.id, name: plan.name, objective: plan.objective, revision: plan.revision, deletedAt: plan.deletedAt, purgeAfter: plan.purgeAfter, restoreEligible: plan.purgeAfter.getTime() > now.getTime(), sharingEnabled: plan.sharingEnabled, startDate: plan.startDate.toISOString().slice(0, 10), endDate: plan.endDate.toISOString().slice(0, 10) }
}

export class PlanService {
  private revisions = new PlanRevisionService()
  constructor(private db: PrismaClient, private now: () => Date = () => new Date()) {}

  async list(userId: string) {
    const plans = await this.db.plan.findMany({ where: { deletedAt: null, OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' } } }] }, include: { access: { where: { userId, status: 'accepted' }, select: { accessLevel: true } } }, orderBy: { updatedAt: 'desc' } })
    return plans.map((plan) => toPlanDto(plan, userId, plan.access[0]?.accessLevel))
  }

  async listTrash(userId: string, input: { page: number; limit: number }) {
    const where = { ownerUserId: userId, deletedAt: { not: null } }
    const [total, plans] = await this.db.$transaction([
      this.db.plan.count({ where }),
      this.db.plan.findMany({ where, orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }], skip: (input.page - 1) * input.limit, take: input.limit, select: { id: true, name: true, objective: true, revision: true, deletedAt: true, purgeAfter: true, sharingEnabled: true, startDate: true, endDate: true } }),
    ])
    const now = this.now()
    return { plans: plans.map((plan) => trashListDto(plan, now)), total, page: input.page, limit: input.limit }
  }

  async create(userId: string, input: CreatePlanInput, identity: PlanAuditIdentity) {
    try {
      const result = await this.db.$transaction((tx) => this.revisions.createInitial(tx, { ownerUserId: userId, snapshot: input.snapshot, source: 'USER', identity, status: input.status, clientMutationId: input.clientMutationId, auditAction: 'plan.created' }))
      return { plan: toPlanDto(result.plan, userId), created: true }
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      const existing = await this.db.plan.findUnique({ where: { ownerUserId_clientMutationId: { ownerUserId: userId, clientMutationId: input.clientMutationId } } })
      if (!existing) throw error
      await this.requireHistoryReady(existing.id, existing.revision)
      return { plan: toPlanDto(existing, userId), created: false }
    }
  }

  async import(userId: string, inputs: ImportPlanInput[], identity: PlanAuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const results = []
      for (const input of inputs) {
        const existing = await tx.plan.findUnique({ where: { ownerUserId_importKey: { ownerUserId: userId, importKey: input.importKey } } })
        if (existing?.deletedAt) throw new ApiError(409, 'PLAN_IN_TRASH', 'Restore the existing plan before importing it again.')
        if (!existing) {
          const created = await this.revisions.createInitial(tx, { ownerUserId: userId, snapshot: input.snapshot, source: 'IMPORT', identity, status: input.status, importKey: input.importKey, auditAction: 'plan.imported', auditMetadata: { importKey: input.importKey } })
          results.push(toPlanDto(created.plan, userId, undefined, true)); continue
        }
        const currentVersion = await this.revisions.requireCurrentVersion(tx, existing.id, existing.revision)
        const incoming = prepareVersionSnapshot(input.snapshot)
        if (incoming.checksum === currentVersion.checksum) { results.push(toPlanDto(existing, userId, undefined, true)); continue }
        const updated = await this.revisions.createNext(tx, {
          planId: existing.id, expectedRevision: existing.revision, snapshot: incoming.snapshot, source: 'IMPORT', identity,
          authorizedWhere: { ownerUserId: userId }, lifecycleWhere: { deletedAt: null }, auditAction: 'plan.imported', auditMetadata: { importKey: input.importKey },
          onNoUpdate: async () => { throw this.conflict(existing.revision, (await tx.plan.findUnique({ where: { id: existing.id }, select: { revision: true } }))?.revision ?? existing.revision) },
        })
        results.push(toPlanDto(updated.plan, userId, undefined, true))
      }
      return results
    })
  }

  async get(userId: string, planId: string) {
    const plan = await this.db.plan.findFirst({ where: { id: planId, deletedAt: null, OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' } } }] }, include: { access: { where: { userId, status: 'accepted' }, select: { accessLevel: true } } } })
    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
    return toPlanDto(plan, userId, plan.access[0]?.accessLevel)
  }

  async update(userId: string, planId: string, input: PlanUpdateInput, identity: PlanAuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const authorization = { OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' as const, accessLevel: 'editor' as const } } }] }
      const result = await this.revisions.createNext(tx, { planId, expectedRevision: input.expectedRevision, snapshot: input.snapshot, source: 'USER', identity, authorizedWhere: authorization, lifecycleWhere: { deletedAt: null }, auditAction: 'plan.updated', onNoUpdate: () => this.resolveUpdateFailure(tx, planId, input.expectedRevision, authorization) })
      return toPlanDto(result.plan, userId, 'editor')
    })
  }

  async remove(userId: string, planId: string, input: PlanLifecycleInput, identity: PlanAuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.plan.findFirst({ where: { id: planId, ownerUserId: userId } })
      if (!existing) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
      const deletedAt = this.now()
      if (existing.deletedAt) return { plan: trashListDto(existing, deletedAt), deleted: false }
      if (existing.revision !== input.expectedRevision) throw this.conflict(input.expectedRevision, existing.revision)
      const purgeAfter = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
      const result = await this.revisions.createNext(tx, {
        planId, expectedRevision: input.expectedRevision, snapshot: existing.snapshot, source: 'TRASH_DELETE', identity,
        authorizedWhere: { ownerUserId: userId }, lifecycleWhere: { deletedAt: null }, planData: { deletedAt, purgeAfter, deletedByUserId: userId }, auditAction: 'plan.deleted', auditMetadata: { purgeAfter: purgeAfter.toISOString() },
        onNoUpdate: async () => { throw new ApiError(409, 'PLAN_LIFECYCLE_CONFLICT', 'The plan lifecycle changed concurrently.') },
      })
      return { plan: trashListDto(result.plan, deletedAt), deleted: true }
    })
  }

  async restore(userId: string, planId: string, input: PlanLifecycleInput, identity: PlanAuditIdentity) {
    try {
      return await this.db.$transaction(async (tx) => {
      const existing = await tx.plan.findFirst({ where: { id: planId, ownerUserId: userId } })
      if (!existing) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Deleted plan not found.')
      if (!existing.deletedAt) { await this.revisions.requireCurrentVersion(tx, existing.id, existing.revision); return { plan: toPlanDto(existing, userId), restored: false } }
      const now = this.now()
      if (!existing.purgeAfter || existing.purgeAfter.getTime() <= now.getTime()) throw new ApiError(410, 'PLAN_RESTORE_EXPIRED', 'The plan recovery period has expired.')
      if (existing.revision !== input.expectedRevision) throw this.conflict(input.expectedRevision, existing.revision)
      const recoverable = prepareVersionSnapshot(existing.snapshot, { status: 500, code: 'CORRUPTED_PLAN_SNAPSHOT' })
      const result = await this.revisions.createNext(tx, {
        planId, expectedRevision: input.expectedRevision, snapshot: recoverable.snapshot, source: 'TRASH_RESTORE', identity,
        authorizedWhere: { ownerUserId: userId }, lifecycleWhere: { deletedAt: { not: null }, purgeAfter: { gt: now } }, planData: { deletedAt: null, purgeAfter: null, deletedByUserId: null }, auditAction: 'plan.restored',
        onNoUpdate: async () => {
          const current = await tx.plan.findFirst({ where: { id: planId, ownerUserId: userId } })
          if (current && !current.deletedAt) throw new ApiError(409, 'PLAN_ALREADY_RESTORED_INTERNAL', 'The plan was already restored.')
          throw new ApiError(409, 'PLAN_LIFECYCLE_CONFLICT', 'The plan lifecycle changed concurrently.')
        },
      })
      return { plan: toPlanDto(result.plan, userId), restored: true }
      })
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'PLAN_ALREADY_RESTORED_INTERNAL') throw error
      const current = await this.db.plan.findFirst({ where: { id: planId, ownerUserId: userId, deletedAt: null } })
      if (!current) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
      await this.requireHistoryReady(current.id, current.revision)
      return { plan: toPlanDto(current, userId), restored: false }
    }
  }

  async getByLink(linkId: string) {
    const link = await this.db.planShareLink.findFirst({ where: { id: linkId, enabled: true, plan: { sharingEnabled: true, deletedAt: null } }, include: { plan: true } })
    if (!link) throw new ApiError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found.')
    return toPlanDto(link.plan, undefined, link.accessLevel)
  }

  async updateByLink(linkId: string, input: PlanUpdateInput, identity: PlanAuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const link = await tx.planShareLink.findFirst({ where: { id: linkId }, select: { planId: true } })
      if (!link) throw new ApiError(404, 'SHARE_LINK_NOT_FOUND', 'Editable share link not found.')
      const authorization = { sharingEnabled: true, shareLink: { is: { id: linkId, enabled: true, accessLevel: 'editor' as const } } }
      const result = await this.revisions.createNext(tx, { planId: link.planId, expectedRevision: input.expectedRevision, snapshot: input.snapshot, source: 'USER', identity, authorizedWhere: authorization, lifecycleWhere: { deletedAt: null }, auditAction: 'plan.updated_via_link', auditMetadata: { linkId }, onNoUpdate: () => this.resolveLinkFailure(tx, link.planId, input.expectedRevision, authorization) })
      return toPlanDto(result.plan, undefined, 'editor')
    })
  }

  async permanentlyRemove(userId: string, planId: string, input: PlanLifecycleInput, identity: PlanAuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.plan.findFirst({ where: { id: planId, ownerUserId: userId }, select: { id: true, deletedAt: true, revision: true } })
      if (!existing) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
      if (!existing.deletedAt) throw new ApiError(409, 'PLAN_NOT_IN_TRASH', 'Only a deleted plan can be permanently removed.')
      if (existing.revision !== input.expectedRevision) throw this.conflict(input.expectedRevision, existing.revision)
      await this.auditWith(tx, identity, 'plan.permanently_deleted', planId, { revision: String(input.expectedRevision) })
      const deleted = await tx.plan.deleteMany({ where: { id: planId, ownerUserId: userId, deletedAt: { not: null }, revision: input.expectedRevision } })
      if (deleted.count !== 1) throw new ApiError(409, 'PLAN_LIFECYCLE_CONFLICT', 'The plan lifecycle changed concurrently.')
      return { deleted: true }
    })
  }

  private async requireHistoryReady(planId: string, revision: number) { return this.db.planVersion.findUnique({ where: { planId_revision: { planId, revision } } }).then((version) => { if (!version) throw new ApiError(503, 'PLAN_VERSION_HISTORY_NOT_READY', 'Version history is not ready for this plan.'); return version }) }
  private async resolveUpdateFailure(tx: Prisma.TransactionClient, planId: string, expectedRevision: number, authorization: Prisma.PlanWhereInput): Promise<never> { const authorized = await tx.plan.findFirst({ where: { id: planId, deletedAt: null, ...authorization }, select: { revision: true } }); if (!authorized) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.'); if (authorized.revision !== expectedRevision) throw this.conflict(expectedRevision, authorized.revision); throw new ApiError(500, 'PLAN_UPDATE_FAILED', 'The plan could not be updated.') }
  private async resolveLinkFailure(tx: Prisma.TransactionClient, planId: string, expectedRevision: number, authorization: Prisma.PlanWhereInput): Promise<never> { const authorized = await tx.plan.findFirst({ where: { id: planId, deletedAt: null, ...authorization }, select: { revision: true } }); if (!authorized) throw new ApiError(404, 'SHARE_LINK_NOT_FOUND', 'Editable share link not found.'); if (authorized.revision !== expectedRevision) throw this.conflict(expectedRevision, authorized.revision); throw new ApiError(500, 'PLAN_UPDATE_FAILED', 'The plan could not be updated.') }
  private conflict(expectedRevision: number, currentRevision: number) { return new ApiError(409, 'PLAN_VERSION_CONFLICT', 'This plan was updated from another session.', { expectedRevision, currentRevision }) }
  private auditWith(db: Prisma.TransactionClient, identity: PlanAuditIdentity, action: string, planId: string, metadata?: Record<string, string>) { return db.auditLog.create({ data: { action, actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: planId, metadata, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } }) }
}
