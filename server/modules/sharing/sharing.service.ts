import type { PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { NotificationService } from '../notifications/notification.service.js'

const publicProfile = { id: true, displayName: true, handle: true, discriminator: true, avatarUrl: true } as const
const profileDto = (profile: { id: string; displayName: string; handle: string; discriminator: string; avatarUrl: string | null }) => ({ ...profile, code: `${profile.handle}#${profile.discriminator}` })
type AuditIdentity = { actorUserId: string; effectiveUserId: string; impersonationSessionId?: string; ipAddress?: string; userAgent?: string }

export class SharingService {
  constructor(private db: PrismaClient) {}

  async searchProfile(requesterId: string, code: string) {
    const [handle, discriminator] = code.toLowerCase().split('#')
    const profile = await this.db.profile.findFirst({ where: { handle: { equals: handle, mode: 'insensitive' }, discriminator, searchable: true, userId: { not: requesterId }, user: { status: 'active' } }, select: publicProfile })
    return profile ? profileDto(profile) : null
  }

  async listAccess(ownerId: string, planId: string) {
    const plan = await this.requireOwner(ownerId, planId)
    const records = await this.db.planAccess.findMany({ where: { planId }, include: { user: { select: { profile: { select: publicProfile } } } }, orderBy: { createdAt: 'desc' } })
    const link = await this.db.planShareLink.findUnique({ where: { planId }, select: { id: true, accessLevel: true, enabled: true } })
    return { sharingEnabled: plan.sharingEnabled, link, records: records.map((record) => ({ id: record.id, accessLevel: record.accessLevel, status: record.status, createdAt: record.createdAt, acceptedAt: record.acceptedAt, profile: record.user.profile ? profileDto(record.user.profile) : null })) }
  }

  async setSharingState(ownerId: string, planId: string, enabled: boolean, identity: AuditIdentity) {
    await this.requireOwner(ownerId, planId)
    await this.db.plan.update({ where: { id: planId }, data: { sharingEnabled: enabled } })
    await this.audit(identity, 'plan.sharing_state_updated', planId, { enabled: String(enabled) })
    return { enabled }
  }

  async createShareLink(ownerId: string, planId: string, accessLevel: 'viewer' | 'editor', identity: AuditIdentity) {
    await this.requireOwner(ownerId, planId)
    const link = await this.db.planShareLink.upsert({ where: { planId }, create: { planId, accessLevel, enabled: true }, update: { accessLevel, enabled: true } })
    await this.audit(identity, 'plan.share_link_created', planId, { accessLevel })
    return { id: link.id, accessLevel: link.accessLevel, enabled: link.enabled }
  }

  async updateShareLink(ownerId: string, planId: string, input: { accessLevel?: 'viewer' | 'editor'; enabled?: boolean }, identity: AuditIdentity) {
    await this.requireOwner(ownerId, planId)
    const existing = await this.db.planShareLink.findUnique({ where: { planId } })
    if (!existing) throw new ApiError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found.')
    const link = await this.db.planShareLink.update({ where: { planId }, data: input })
    await this.audit(identity, 'plan.share_link_updated', planId, { accessLevel: link.accessLevel, enabled: String(link.enabled) })
    return { id: link.id, accessLevel: link.accessLevel, enabled: link.enabled }
  }

  async deleteShareLink(ownerId: string, planId: string, identity: AuditIdentity) {
    await this.requireOwner(ownerId, planId)
    await this.db.planShareLink.deleteMany({ where: { planId } })
    await this.audit(identity, 'plan.share_link_deleted', planId, {})
  }

  async grant(ownerId: string, planId: string, profileCode: string, accessLevel: 'viewer' | 'editor', identity: AuditIdentity) {
    const plan = await this.requireOwner(ownerId, planId)
    const [handle, discriminator] = profileCode.toLowerCase().split('#')
    const target = await this.db.user.findFirst({ where: { status: 'active', profile: { handle: { equals: handle, mode: 'insensitive' }, discriminator, searchable: true } }, select: { id: true, profile: { select: publicProfile } } })
    if (!target?.profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Public profile not found.')
    if (target.id === ownerId) throw new ApiError(400, 'CANNOT_SHARE_WITH_SELF', 'A plan cannot be shared with its owner.')
    const access = await this.db.planAccess.upsert({
      where: { planId_userId: { planId, userId: target.id } },
      create: { planId, userId: target.id, accessLevel, status: 'pending', grantedByUserId: ownerId },
      update: { accessLevel, status: 'pending', grantedByUserId: ownerId, acceptedAt: null, revokedAt: null },
    })
    await this.audit(identity, 'plan.access_granted', plan.id, { accessId: access.id, accessLevel })
    const owner = await this.db.profile.findUnique({ where: { userId: ownerId }, select: { displayName: true } })
    await new NotificationService(this.db).create(target.id, 'plan_invitation', { planId: plan.id, planName: plan.name, actorName: owner?.displayName ?? 'NorthStar user', accessLevel })
    return { id: access.id, accessLevel: access.accessLevel, status: access.status, profile: profileDto(target.profile) }
  }

  async update(ownerId: string, planId: string, accessId: string, accessLevel: 'viewer' | 'editor', identity: AuditIdentity) {
    await this.requireOwner(ownerId, planId)
    const existing = await this.db.planAccess.findFirst({ where: { id: accessId, planId, status: { not: 'revoked' } } })
    if (!existing) throw new ApiError(404, 'PLAN_ACCESS_NOT_FOUND', 'Plan access was not found.')
    const access = await this.db.planAccess.update({ where: { id: accessId }, data: { accessLevel } })
    await this.audit(identity, 'plan.access_updated', planId, { accessId, accessLevel })
    return access
  }

  async revoke(ownerId: string, planId: string, accessId: string, identity: AuditIdentity) {
    await this.requireOwner(ownerId, planId)
    const result = await this.db.planAccess.updateMany({ where: { id: accessId, planId, status: { not: 'revoked' } }, data: { status: 'revoked', revokedAt: new Date() } })
    if (!result.count) throw new ApiError(404, 'PLAN_ACCESS_NOT_FOUND', 'Plan access was not found.')
    await this.audit(identity, 'plan.access_revoked', planId, { accessId })
  }

  async invitations(userId: string) {
    const records = await this.db.planAccess.findMany({ where: { userId, status: 'pending', plan: { deletedAt: null, sharingEnabled: true } }, include: { plan: { select: { id: true, name: true, objective: true } }, grantedBy: { select: { profile: { select: publicProfile } } } }, orderBy: { createdAt: 'desc' } })
    return records.map((record) => ({ id: record.id, accessLevel: record.accessLevel, createdAt: record.createdAt, plan: record.plan, grantedBy: record.grantedBy.profile ? profileDto(record.grantedBy.profile) : null }))
  }

  async respond(userId: string, accessId: string, response: 'accepted' | 'declined', identity: AuditIdentity) {
    const access = await this.db.planAccess.findFirst({ where: { id: accessId, userId, status: 'pending', plan: { deletedAt: null } }, include: { plan: { select: { name: true } }, user: { select: { profile: { select: { displayName: true } } } } } })
    if (!access) throw new ApiError(404, 'PLAN_ACCESS_NOT_FOUND', 'Plan invitation was not found.')
    const updated = await this.db.planAccess.update({ where: { id: accessId }, data: { status: response, acceptedAt: response === 'accepted' ? new Date() : null } })
    await this.audit(identity, `plan.access_${response}`, access.planId, { accessId })
    await new NotificationService(this.db).create(access.grantedByUserId, response === 'accepted' ? 'plan_invitation_accepted' : 'plan_invitation_declined', { planId: access.planId, planName: access.plan.name, actorName: access.user.profile?.displayName ?? 'NorthStar user' })
    return updated
  }

  private async requireOwner(userId: string, planId: string) {
    const plan = await this.db.plan.findFirst({ where: { id: planId, ownerUserId: userId, deletedAt: null }, select: { id: true, name: true, sharingEnabled: true } })
    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.')
    return plan
  }

  private audit(identity: AuditIdentity, action: string, planId: string, metadata: Record<string, string>) { return this.db.auditLog.create({ data: { action, actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'plan', targetId: planId, metadata, impersonationSessionId: identity.impersonationSessionId, ipAddress: identity.ipAddress, userAgent: identity.userAgent } }) }
}
