import { Prisma, type PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { derivePlanRelationalMetadata, parsePlanDocument, type CanonicalPlan } from '../../../shared/plan-contract/index.js'

type PlanInput = { status?: 'active'; snapshot: CanonicalPlan }
type CreatePlanInput = PlanInput & { clientMutationId: string }
type ImportPlanInput = PlanInput & { importKey: string }
type PlanUpdateInput = { snapshot: CanonicalPlan; expectedRevision: number }
type PlanLifecycleInput = { expectedRevision: number }
type AuditIdentity = { actorUserId: string; effectiveUserId: string; impersonationSessionId?: string; ipAddress?: string; userAgent?: string }

const relational = (snapshot: CanonicalPlan) => {
  const metadata = derivePlanRelationalMetadata(snapshot)
  return { ...metadata, startDate: new Date(`${metadata.startDate}T00:00:00Z`), endDate: new Date(`${metadata.endDate}T00:00:00Z`) }
}

type PlanRecord = { id: string; ownerUserId: string; name: string; objective: string | null; startDate: Date; endDate: Date; status: string; sharingEnabled: boolean; snapshot: Prisma.JsonValue; importKey: string | null; revision: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null; purgeAfter: Date | null; deletedByUserId: string | null }

function dto(plan: PlanRecord, userId?: string, sharedLevel?: 'editor' | 'viewer', includeImportKey = false) {
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

type TrashListRecord = Pick<PlanRecord, 'id' | 'name' | 'objective' | 'revision' | 'deletedAt' | 'purgeAfter' | 'sharingEnabled' | 'startDate' | 'endDate'>

function trashListDto(plan: TrashListRecord, now = new Date()) {
  if (!plan.deletedAt || !plan.purgeAfter) throw new ApiError(500, 'INVALID_TRASH_STATE', 'The deleted plan has incomplete retention metadata.')
  return {
    id: plan.id,
    name: plan.name,
    objective: plan.objective,
    revision: plan.revision,
    deletedAt: plan.deletedAt,
    purgeAfter: plan.purgeAfter,
    restoreEligible: plan.purgeAfter.getTime() > now.getTime(),
    sharingEnabled: plan.sharingEnabled,
    startDate: plan.startDate.toISOString().slice(0, 10),
    endDate: plan.endDate.toISOString().slice(0, 10),
  }
}

export class PlanService {
  constructor(private db: PrismaClient, private now: () => Date = () => new Date()) {}
  async list(userId: string) {
    const plans = await this.db.plan.findMany({ where: { deletedAt: null, OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' } } }] }, include: { access: { where: { userId, status: 'accepted' }, select: { accessLevel: true } } }, orderBy: { updatedAt: 'desc' } })
    return plans.map((plan) => dto(plan, userId, plan.access[0]?.accessLevel))
  }
  async listTrash(userId: string, input: { page: number; limit: number }) {
    const where = { ownerUserId: userId, deletedAt: { not: null } }
    const [total, plans] = await this.db.$transaction([
      this.db.plan.count({ where }),
      this.db.plan.findMany({
        where,
        orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: { id: true, name: true, objective: true, revision: true, deletedAt: true, purgeAfter: true, sharingEnabled: true, startDate: true, endDate: true },
      }),
    ])
    const now = this.now()
    return { plans: plans.map((plan) => trashListDto(plan, now)), total, page: input.page, limit: input.limit }
  }
  async create(userId: string, input: CreatePlanInput, identity: AuditIdentity) {
    try {
      const plan = await this.db.$transaction(async (tx) => {
        const created = await tx.plan.create({ data: { ownerUserId: userId, clientMutationId: input.clientMutationId, ...relational(input.snapshot), status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue } })
        await tx.auditLog.create({ data: { action: 'plan.created', actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: created.id, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } })
        return created
      })
      return { plan: dto(plan, userId), created: true }
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      const existing = await this.db.plan.findUnique({ where: { ownerUserId_clientMutationId: { ownerUserId: userId, clientMutationId: input.clientMutationId } } })
      if (!existing) throw error
      return { plan: dto(existing, userId), created: false }
    }
  }
  async import(userId: string, inputs: ImportPlanInput[], identity: AuditIdentity) {
    return this.db.$transaction(async (tx) => Promise.all(inputs.map(async (input) => {
      const existing = await tx.plan.findUnique({ where: { ownerUserId_importKey: { ownerUserId: userId, importKey: input.importKey! } } })
      if (existing?.deletedAt) throw new ApiError(409, 'PLAN_IN_TRASH', 'Restore the existing plan before importing it again.')
      const plan = existing
        ? await tx.plan.update({ where: { id: existing.id }, data: { ...relational(input.snapshot), status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue, revision: { increment: 1 } } })
        : await tx.plan.create({ data: { ownerUserId: userId, importKey: input.importKey, ...relational(input.snapshot), status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue } })
      await tx.auditLog.create({ data: { action: 'plan.imported', actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: plan.id, metadata: { importKey: input.importKey! }, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } })
      return dto(plan, userId, undefined, true)
    })))
  }
  async get(userId: string, planId: string) {
    const plan = await this.db.plan.findFirst({ where: { id: planId, deletedAt: null, OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' } } }] }, include: { access: { where: { userId, status: 'accepted' }, select: { accessLevel: true } } } })
    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
    return dto(plan, userId, plan.access[0]?.accessLevel)
  }
  async update(userId: string, planId: string, input: PlanUpdateInput, identity: AuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const authorization = { OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' as const, accessLevel: 'editor' as const } } }] }
      const updated = await tx.plan.updateMany({ where: { id: planId, revision: input.expectedRevision, deletedAt: null, ...authorization }, data: { ...relational(input.snapshot), snapshot: input.snapshot as Prisma.InputJsonValue, revision: { increment: 1 } } })
      if (updated.count !== 1) {
        const authorized = await tx.plan.findFirst({ where: { id: planId, deletedAt: null, ...authorization }, select: { revision: true } })
        if (!authorized) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
        if (authorized.revision !== input.expectedRevision) throw new ApiError(409, 'PLAN_VERSION_CONFLICT', 'This plan was updated from another session.', { expectedRevision: input.expectedRevision, currentRevision: authorized.revision })
        throw new ApiError(500, 'PLAN_UPDATE_FAILED', 'The plan could not be updated.')
      }
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } })
      await tx.auditLog.create({ data: { action: 'plan.updated', actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: plan.id, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } })
      return dto(plan, userId, 'editor')
    })
  }
  async remove(userId: string, planId: string, input: PlanLifecycleInput, identity: AuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const deletedAt = this.now(); const purgeAfter = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
      const updated = await tx.plan.updateMany({ where: { id: planId, ownerUserId: userId, deletedAt: null, revision: input.expectedRevision }, data: { deletedAt, purgeAfter, deletedByUserId: userId, revision: { increment: 1 } } })
      if (updated.count === 1) {
        const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } })
        await this.auditWith(tx, identity, 'plan.deleted', planId, { revision: String(plan.revision), purgeAfter: purgeAfter.toISOString() })
        return { plan: trashListDto(plan, deletedAt), deleted: true }
      }
      const existing = await tx.plan.findFirst({ where: { id: planId, ownerUserId: userId } })
      if (!existing) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
      if (existing.deletedAt) return { plan: trashListDto(existing, deletedAt), deleted: false }
      if (existing.revision !== input.expectedRevision) throw this.conflict(input.expectedRevision, existing.revision)
      throw new ApiError(500, 'PLAN_DELETE_FAILED', 'The plan could not be deleted.')
    })
  }

  async restore(userId: string, planId: string, input: PlanLifecycleInput, identity: AuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const now = this.now()
      const updated = await tx.plan.updateMany({ where: { id: planId, ownerUserId: userId, deletedAt: { not: null }, purgeAfter: { gt: now }, revision: input.expectedRevision }, data: { deletedAt: null, purgeAfter: null, deletedByUserId: null, revision: { increment: 1 } } })
      if (updated.count === 1) {
        const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } })
        await this.auditWith(tx, identity, 'plan.restored', planId, { revision: String(plan.revision) })
        return { plan: dto(plan, userId), restored: true }
      }
      const existing = await tx.plan.findFirst({ where: { id: planId, ownerUserId: userId } })
      if (!existing) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Deleted plan not found.')
      if (!existing.deletedAt) return { plan: dto(existing, userId), restored: false }
      if (!existing.purgeAfter || existing.purgeAfter.getTime() <= now.getTime()) throw new ApiError(410, 'PLAN_RESTORE_EXPIRED', 'The plan recovery period has expired.')
      if (existing.revision !== input.expectedRevision) throw this.conflict(input.expectedRevision, existing.revision)
      throw new ApiError(500, 'PLAN_RESTORE_FAILED', 'The plan could not be restored.')
    })
  }

  async getByLink(linkId: string) {
    const link = await this.db.planShareLink.findFirst({ where: { id: linkId, enabled: true, plan: { sharingEnabled: true, deletedAt: null } }, include: { plan: true } })
    if (!link) throw new ApiError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found.')
    return dto(link.plan, undefined, link.accessLevel)
  }

  async updateByLink(linkId: string, input: PlanUpdateInput, identity: AuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const link = await tx.planShareLink.findFirst({ where: { id: linkId }, select: { planId: true } })
      if (!link) throw new ApiError(404, 'SHARE_LINK_NOT_FOUND', 'Editable share link not found.')
      const authorization = { sharingEnabled: true, shareLink: { is: { id: linkId, enabled: true, accessLevel: 'editor' as const } } }
      const updated = await tx.plan.updateMany({ where: { id: link.planId, revision: input.expectedRevision, deletedAt: null, ...authorization }, data: { ...relational(input.snapshot), snapshot: input.snapshot as Prisma.InputJsonValue, revision: { increment: 1 } } })
      if (updated.count !== 1) {
        const authorized = await tx.plan.findFirst({ where: { id: link.planId, deletedAt: null, ...authorization }, select: { revision: true } })
        if (!authorized) throw new ApiError(404, 'SHARE_LINK_NOT_FOUND', 'Editable share link not found.')
        if (authorized.revision !== input.expectedRevision) throw new ApiError(409, 'PLAN_VERSION_CONFLICT', 'This plan was updated from another session.', { expectedRevision: input.expectedRevision, currentRevision: authorized.revision })
        throw new ApiError(500, 'PLAN_UPDATE_FAILED', 'The plan could not be updated.')
      }
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: link.planId } })
      await tx.auditLog.create({ data: { action: 'plan.updated_via_link', actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: plan.id, metadata: { linkId }, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } })
      return dto(plan, undefined, 'editor')
    })
  }

  async permanentlyRemove(userId: string, planId: string, input: PlanLifecycleInput, identity: AuditIdentity) {
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
  private conflict(expectedRevision: number, currentRevision: number) { return new ApiError(409, 'PLAN_VERSION_CONFLICT', 'This plan was updated from another session.', { expectedRevision, currentRevision }) }
  private auditWith(db: Prisma.TransactionClient, identity: AuditIdentity, action: string, planId: string, metadata?: Record<string, string>) { return db.auditLog.create({ data: { action, actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: planId, metadata, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } }) }
  private audit(identity: AuditIdentity, action: string, planId: string, metadata?: Record<string, string>) { return this.auditWith(this.db, identity, action, planId, metadata) }
}
