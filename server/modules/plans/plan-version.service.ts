import { Prisma, type PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { PlanRevisionService, type PlanAuditIdentity } from './plan-revision.service.js'
import { toPlanDto } from './plan.service.js'
import { verifyStoredVersion } from './plan-version-integrity.js'

type AccessLevel = 'owner' | 'editor' | 'viewer'

export class PlanVersionService {
  private revisions = new PlanRevisionService()
  constructor(private db: PrismaClient) {}

  async list(userId: string, planId: string, input: { page: number; limit: number }) {
    const access = await this.requireAccess(this.db, userId, planId, false)
    const [total, versions] = await this.db.$transaction([
      this.db.planVersion.count({ where: { planId } }),
      this.db.planVersion.findMany({
        where: { planId }, orderBy: [{ revision: 'desc' }, { id: 'asc' }], skip: (input.page - 1) * input.limit, take: input.limit,
        select: { id: true, revision: true, schemaVersion: true, source: true, createdAt: true, checksum: true, snapshotSizeBytes: true, actorUser: { select: { profile: { select: { displayName: true } } } }, restoredFromVersion: { select: { revision: true } } },
      }),
    ])
    return {
      versions: versions.map((version) => ({ id: version.id, revision: version.revision, schemaVersion: version.schemaVersion, source: version.source, createdAt: version.createdAt, checksum: version.checksum, snapshotSizeBytes: version.snapshotSizeBytes, isCurrent: version.revision === access.revision, ...(access.level === 'viewer' ? {} : { actorDisplayName: version.actorUser?.profile?.displayName ?? null }), restoredFromRevision: version.restoredFromVersion?.revision ?? null })),
      total, page: input.page, limit: input.limit,
    }
  }

  async get(userId: string, planId: string, revision: number) {
    await this.requireAccess(this.db, userId, planId, true)
    const version = await this.db.planVersion.findUnique({ where: { planId_revision: { planId, revision } }, select: { id: true, revision: true, schemaVersion: true, source: true, createdAt: true, checksum: true, snapshotSizeBytes: true, snapshot: true, actorUser: { select: { profile: { select: { displayName: true } } } }, restoredFromVersion: { select: { revision: true } } } })
    if (!version) throw new ApiError(404, 'PLAN_VERSION_NOT_FOUND', 'Plan version not found.')
    const verified = verifyStoredVersion(version)
    const snapshot = verified.snapshot
    return { id: version.id, revision: version.revision, schemaVersion: version.schemaVersion, source: version.source, createdAt: version.createdAt, checksum: version.checksum, snapshotSizeBytes: version.snapshotSizeBytes, actorDisplayName: version.actorUser?.profile?.displayName ?? null, restoredFromRevision: version.restoredFromVersion?.revision ?? null, snapshot, summary: { title: snapshot.project.name, startDate: snapshot.project.startDate, endDate: snapshot.project.endDate, goals: snapshot.project.goals.length, milestones: snapshot.project.milestones.length, activities: snapshot.activities.length } }
  }

  async restore(userId: string, planId: string, revision: number, expectedRevision: number, identity: PlanAuditIdentity) {
    return this.db.$transaction(async (tx) => {
      const access = await this.requireAccess(tx, userId, planId, true)
      if (access.level === 'viewer') throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
      const selected = await tx.planVersion.findUnique({ where: { planId_revision: { planId, revision } } })
      if (!selected) throw new ApiError(404, 'PLAN_VERSION_NOT_FOUND', 'Plan version not found.')
      const verified = verifyStoredVersion(selected)
      const authorization: Prisma.PlanWhereInput = { OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted', accessLevel: 'editor' } } }] }
      const result = await this.revisions.createNext(tx, {
        planId, expectedRevision, snapshot: verified.snapshot, source: 'VERSION_RESTORE', identity,
        authorizedWhere: authorization, lifecycleWhere: { deletedAt: null }, restoredFromVersionId: selected.id,
        auditAction: 'plan.version_restored', auditMetadata: { restoredFromRevision: revision },
        onNoUpdate: async () => {
          const current = await tx.plan.findFirst({ where: { id: planId, deletedAt: null, ...authorization }, select: { revision: true } })
          if (!current) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
          throw new ApiError(409, 'PLAN_VERSION_CONFLICT', 'This plan was updated from another session.', { expectedRevision, currentRevision: current.revision })
        },
      })
      return { plan: toPlanDto(result.plan, userId, 'editor'), restoredFromRevision: revision, createdRevision: result.version.revision }
    })
  }

  private async requireAccess(db: PrismaClient | Prisma.TransactionClient, userId: string, planId: string, requireSnapshot: boolean): Promise<{ level: AccessLevel; revision: number }> {
    const plan = await db.plan.findFirst({ where: { id: planId, deletedAt: null, OR: [{ ownerUserId: userId }, { sharingEnabled: true, access: { some: { userId, status: 'accepted' } } }] }, select: { ownerUserId: true, revision: true, access: { where: { userId, status: 'accepted' }, select: { accessLevel: true } } } })
    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
    await this.revisions.requireCurrentVersion(db as Prisma.TransactionClient, planId, plan.revision)
    const level: AccessLevel = plan.ownerUserId === userId ? 'owner' : (plan.access[0]?.accessLevel ?? 'viewer')
    if (requireSnapshot && level === 'viewer') throw new ApiError(404, 'PLAN_VERSION_NOT_FOUND', 'Plan version not found.')
    return { level, revision: plan.revision }
  }
}
