import { Prisma, type PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'

type PlanInput = { name: string; objective?: string; startDate: string; endDate: string; status?: string; snapshot: Record<string, unknown> }
type CreatePlanInput = PlanInput & { clientMutationId: string }
type ImportPlanInput = PlanInput & { importKey: string }
type PlanUpdateInput = Partial<PlanInput> & { expectedRevision: number }
type AuditIdentity = { actorUserId: string; effectiveUserId: string; impersonationSessionId?: string; ipAddress?: string; userAgent?: string }

type PlanRecord = { id: string; ownerUserId: string; name: string; objective: string | null; startDate: Date; endDate: Date; status: string; sharingEnabled: boolean; snapshot: Prisma.JsonValue; importKey: string | null; revision: number; createdAt: Date; updatedAt: Date }

function dto(plan: PlanRecord, userId?: string, sharedLevel?: 'editor' | 'viewer', includeImportKey = false) {
  return {
    id: plan.id,
    accessLevel: userId && plan.ownerUserId === userId ? 'owner' as const : sharedLevel,
    sharingEnabled: plan.sharingEnabled,
    name: plan.name,
    objective: plan.objective,
    startDate: plan.startDate.toISOString().slice(0, 10),
    endDate: plan.endDate.toISOString().slice(0, 10),
    status: plan.status,
    snapshot: plan.snapshot,
    revision: plan.revision,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    ...(includeImportKey ? { importKey: plan.importKey } : {}),
  }
}

export class PlanService {
  constructor(private db: PrismaClient) {}
  async list(userId: string) {
    const plans = await this.db.plan.findMany({ where: { deletedAt: null, OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' } } }] }, include: { access: { where: { userId, status: 'accepted' }, select: { accessLevel: true } } }, orderBy: { updatedAt: 'desc' } })
    return plans.map((plan) => dto(plan, userId, plan.access[0]?.accessLevel))
  }
  async create(userId: string, input: CreatePlanInput, identity: AuditIdentity) {
    try {
      const plan = await this.db.$transaction(async (tx) => {
        const created = await tx.plan.create({ data: { ownerUserId: userId, clientMutationId: input.clientMutationId, name: input.name, objective: input.objective, startDate: new Date(`${input.startDate}T00:00:00Z`), endDate: new Date(`${input.endDate}T00:00:00Z`), status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue } })
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
      const plan = await tx.plan.upsert({ where: { ownerUserId_importKey: { ownerUserId: userId, importKey: input.importKey! } }, create: { ownerUserId: userId, importKey: input.importKey, name: input.name, objective: input.objective, startDate: new Date(`${input.startDate}T00:00:00Z`), endDate: new Date(`${input.endDate}T00:00:00Z`), status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue }, update: { name: input.name, objective: input.objective, startDate: new Date(`${input.startDate}T00:00:00Z`), endDate: new Date(`${input.endDate}T00:00:00Z`), status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue, deletedAt: null, revision: { increment: 1 } } })
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
      const updated = await tx.plan.updateMany({ where: { id: planId, revision: input.expectedRevision, deletedAt: null, ...authorization }, data: { name: input.name, objective: input.objective, startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : undefined, endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : undefined, status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue | undefined, revision: { increment: 1 } } })
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
  async remove(userId: string, planId: string, identity: AuditIdentity) {
    const plan = await this.db.plan.findFirst({ where: { id: planId, ownerUserId: userId, deletedAt: null }, select: { id: true } })
    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
    await this.db.plan.update({ where: { id: planId }, data: { deletedAt: new Date() } })
    await this.audit(identity, 'plan.deleted', planId)
  }

  async restore(userId: string, planId: string, identity: AuditIdentity) {
    const existing = await this.db.plan.findFirst({ where: { id: planId, ownerUserId: userId, deletedAt: { not: null } } })
    if (!existing) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Deleted plan not found.')
    const plan = await this.db.plan.update({ where: { id: planId }, data: { deletedAt: null, revision: { increment: 1 } } })
    await this.audit(identity, 'plan.restored', planId)
    return dto(plan, userId)
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
      const updated = await tx.plan.updateMany({ where: { id: link.planId, revision: input.expectedRevision, deletedAt: null, ...authorization }, data: { name: input.name, objective: input.objective, startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : undefined, endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : undefined, status: input.status, snapshot: input.snapshot as Prisma.InputJsonValue | undefined, revision: { increment: 1 } } })
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

  async permanentlyRemove(userId: string, planId: string, identity: AuditIdentity) {
    const plan = await this.db.plan.findFirst({ where: { id: planId, ownerUserId: userId }, select: { id: true, name: true } })
    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
    await this.audit(identity, 'plan.permanently_deleted', plan.id, { name: plan.name })
    await this.db.plan.delete({ where: { id: plan.id } })
  }
  private audit(identity: AuditIdentity, action: string, planId: string, metadata?: Record<string, string>) { return this.db.auditLog.create({ data: { action, actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: planId, metadata, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } }) }
}
