import type { Prisma, PrismaClient, UserStatus } from '@prisma/client'
import { ApiError } from '../../http/errors.js'

type RequestIdentity = { sessionId: string; actorUserId: string; effectiveUserId: string; impersonationSessionId?: string; ipAddress?: string; userAgent?: string }
const profileSelect = { displayName: true, handle: true, discriminator: true, avatarUrl: true, locale: true, timezone: true } as const

export class AdminService {
  constructor(private db: PrismaClient) {}

  async listUsers(input: { q?: string; status?: UserStatus; role?: 'admin' | 'user'; page: number; limit: number }) {
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.role ? { roles: { some: { role: { key: input.role } } } } : {}),
      ...(input.q ? { OR: [{ email: { contains: input.q, mode: 'insensitive' } }, { profile: { displayName: { contains: input.q, mode: 'insensitive' } } }, { profile: { handle: { contains: input.q.replace(/#.*/, ''), mode: 'insensitive' } } }] } : {}),
    }
    const [total, users] = await this.db.$transaction([
      this.db.user.count({ where }),
      this.db.user.findMany({ where, include: { profile: { select: profileSelect }, roles: { select: { role: { select: { key: true, name: true } } } }, _count: { select: { ownedPlans: true, planAccess: true, sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } } }, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit }),
    ])
    return { total, page: input.page, limit: input.limit, users: users.map((user) => this.userDto(user)) }
  }

  async getUser(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId }, include: { profile: { select: profileSelect }, roles: { select: { role: { select: { key: true, name: true } } } }, _count: { select: { ownedPlans: true, planAccess: true, sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } } } })
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.')
    return this.userDto(user)
  }

  async updateUser(actorUserId: string, userId: string, input: { status?: UserStatus; roles?: ('admin' | 'user')[] }, identity: RequestIdentity) {
    if (actorUserId === userId) throw new ApiError(400, 'SELF_ADMIN_CHANGE_BLOCKED', 'Use a separate administrator to change your own administrative access or status.')
    const current = await this.db.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } })
    if (!current) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.')
    const isAdmin = current.roles.some(({ role }) => role.key === 'admin')
    const removesAdmin = input.roles ? !input.roles.includes('admin') : false
    const disablesAdmin = input.status !== undefined && input.status !== 'active'
    if (isAdmin && (removesAdmin || disablesAdmin)) {
      const activeAdmins = await this.db.user.count({ where: { status: 'active', roles: { some: { role: { key: 'admin' } } } } })
      if (activeAdmins <= 1) throw new ApiError(409, 'LAST_ADMIN_PROTECTED', 'The last active administrator cannot be disabled or demoted.')
    }
    await this.db.$transaction(async (tx) => {
      if (input.status) {
        await tx.user.update({ where: { id: userId }, data: { status: input.status } })
        if (input.status !== 'active') await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
      }
      if (input.roles) {
        const roles = await tx.role.findMany({ where: { key: { in: input.roles } } })
        if (roles.length !== input.roles.length) throw new ApiError(500, 'RBAC_CONFIGURATION_ERROR', 'A required role is missing.')
        await tx.userRole.deleteMany({ where: { userId } })
        await tx.userRole.createMany({ data: roles.map((role) => ({ userId, roleId: role.id })) })
      }
      await tx.auditLog.create({ data: { action: 'admin.user_updated', actorUserId: identity.actorUserId, effectiveUserId: identity.effectiveUserId, targetType: 'user', targetId: userId, metadata: { status: input.status ?? null, roles: input.roles ?? null }, ipAddress: identity.ipAddress, userAgent: identity.userAgent, impersonationSessionId: identity.impersonationSessionId } })
    })
    return this.getUser(userId)
  }

  async startImpersonation(targetUserId: string, reason: string, identity: RequestIdentity) {
    if (identity.impersonationSessionId) throw new ApiError(409, 'IMPERSONATION_ALREADY_ACTIVE', 'End the current impersonation first.')
    if (targetUserId === identity.actorUserId) throw new ApiError(400, 'CANNOT_IMPERSONATE_SELF', 'You cannot impersonate your own account.')
    const target = await this.db.user.findFirst({ where: { id: targetUserId, status: 'active' }, include: { profile: true } })
    if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'An active target user was not found.')
    const expiresAt = new Date(Date.now() + 60 * 60_000)
    const impersonation = await this.db.$transaction(async (tx) => {
      const record = await tx.impersonationSession.upsert({ where: { sessionId: identity.sessionId }, create: { sessionId: identity.sessionId, adminUserId: identity.actorUserId, targetUserId, reason, expiresAt, ipAddress: identity.ipAddress, userAgent: identity.userAgent }, update: { adminUserId: identity.actorUserId, targetUserId, reason, startedAt: new Date(), expiresAt, endedAt: null, ipAddress: identity.ipAddress, userAgent: identity.userAgent } })
      await tx.auditLog.create({ data: { action: 'admin.impersonation_started', actorUserId: identity.actorUserId, effectiveUserId: targetUserId, targetType: 'user', targetId: targetUserId, metadata: { reason }, ipAddress: identity.ipAddress, userAgent: identity.userAgent, impersonationSessionId: record.id } })
      return record
    })
    return { id: impersonation.id, expiresAt, target: { id: target.id, email: target.email, displayName: target.profile?.displayName ?? target.email } }
  }

  async endImpersonation(identity: RequestIdentity) {
    const record = await this.db.impersonationSession.findFirst({ where: { sessionId: identity.sessionId, adminUserId: identity.actorUserId, endedAt: null } })
    if (!record) throw new ApiError(404, 'IMPERSONATION_NOT_ACTIVE', 'No active impersonation was found.')
    await this.db.$transaction([
      this.db.impersonationSession.update({ where: { id: record.id }, data: { endedAt: new Date() } }),
      this.db.auditLog.create({ data: { action: 'admin.impersonation_ended', actorUserId: identity.actorUserId, effectiveUserId: record.targetUserId, targetType: 'user', targetId: record.targetUserId, ipAddress: identity.ipAddress, userAgent: identity.userAgent, impersonationSessionId: record.id } }),
    ])
  }

  async auditLogs(input: { action?: string; userId?: string; page: number; limit: number }) {
    const where: Prisma.AuditLogWhereInput = { ...(input.action ? { action: { contains: input.action, mode: 'insensitive' } } : {}), ...(input.userId ? { OR: [{ actorUserId: input.userId }, { effectiveUserId: input.userId }] } : {}) }
    const [total, logs] = await this.db.$transaction([this.db.auditLog.count({ where }), this.db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit, select: { id: true, action: true, actorUserId: true, effectiveUserId: true, targetType: true, targetId: true, metadata: true, ipAddress: true, createdAt: true, impersonationSessionId: true } })])
    return { total, page: input.page, limit: input.limit, logs }
  }

  private userDto(user: { id: string; email: string; status: UserStatus; emailVerifiedAt: Date | null; lastLoginAt: Date | null; createdAt: Date; updatedAt: Date; profile: { displayName: string; handle: string; discriminator: string; avatarUrl: string | null; locale: string; timezone: string } | null; roles: { role: { key: string; name: string } }[]; _count: { ownedPlans: number; planAccess: number; sessions: number } }) {
    return { id: user.id, email: user.email, status: user.status, emailVerifiedAt: user.emailVerifiedAt, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt, updatedAt: user.updatedAt, profile: user.profile ? { ...user.profile, code: `${user.profile.handle}#${user.profile.discriminator}` } : null, roles: user.roles.map(({ role }) => role), counts: user._count }
  }
}
