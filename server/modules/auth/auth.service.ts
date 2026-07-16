import argon2 from 'argon2'
import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { createOpaqueToken, hashToken } from '../../security/crypto.js'
import { AuditService } from '../audit/audit.service.js'
import { ProfileService } from '../profiles/profile.service.js'
import type { RequestMetadata } from './auth.types.js'
import type { z } from 'zod'
import type { loginSchema, registerSchema } from './auth.schemas.js'

const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$0YZanKSWvtwqfXIrhx+N1g$pn5izxmDmOJZ/R4wpYwiWJiKsZzbciFbP6VsUy3xCec'

export class AuthService {
  private audit: AuditService
  constructor(private db: PrismaClient, private env: AppEnv) { this.audit = new AuditService(db) }

  async register(input: z.infer<typeof registerSchema>, metadata: RequestMetadata) {
    if (!this.env.REGISTRATION_ENABLED) throw new ApiError(403, 'REGISTRATION_DISABLED', 'Registration is currently disabled.')
    const existing = await this.db.user.findUnique({ where: { email: input.email }, select: { id: true } })
    if (existing) throw new ApiError(409, 'REGISTRATION_UNAVAILABLE', 'An account cannot be created with these details.')
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        email: input.email,
        passwordHash,
        status: this.env.EMAIL_VERIFICATION_REQUIRED ? 'pending' : 'active',
        termsAcceptedAt: input.acceptTerms ? new Date() : null,
      } })
      await new ProfileService(tx).create(created.id, input.displayName)
      const userRole = await tx.role.findUnique({ where: { key: 'user' } })
      if (!userRole) throw new Error('RBAC seed is missing the user role')
      await tx.userRole.create({ data: { userId: created.id, roleId: userRole.id } })
      return created
    })
    await this.audit.record({ action: 'user.registered', actorUserId: user.id, effectiveUserId: user.id, targetType: 'user', targetId: user.id, ...metadata })
    if (this.env.EMAIL_VERIFICATION_REQUIRED) return { requiresVerification: true as const, userId: user.id, email: input.email }
    const session = await this.login({ email: input.email, password: input.password, recaptchaToken: input.recaptchaToken }, metadata)
    return { ...session, requiresVerification: false as const }
  }

  async login(input: z.infer<typeof loginSchema>, metadata: RequestMetadata) {
    const user = await this.db.user.findUnique({ where: { email: input.email }, include: { profile: true } })
    const passwordMatches = await argon2.verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password)
    if (!user || !passwordMatches) {
      await this.audit.record({ action: 'auth.login_failed', metadata: { emailHash: hashToken(input.email) }, ...metadata })
      throw invalidCredentials()
    }
    if (user.status !== 'active') throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available.')
    return this.createSession(user, metadata)
  }

  async createSession(user: { id: string; email: string; status: string; profile: { displayName: string; handle: string; discriminator: string; locale: string; timezone: string; preferences: unknown } | null }, metadata: RequestMetadata) {
    if (user.status !== 'active') throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available.')
    const token = createOpaqueToken()
    const csrfToken = createOpaqueToken(24)
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3_600_000)
    const session = await this.db.session.create({ data: { userId: user.id, tokenHash: hashToken(token), csrfTokenHash: hashToken(csrfToken), expiresAt, ...metadata } })
    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await this.audit.record({ action: 'auth.login_succeeded', actorUserId: user.id, effectiveUserId: user.id, targetType: 'session', targetId: session.id, ...metadata })
    return { token, csrfToken, expiresAt, user: this.publicUser(user) }
  }

  async logout(sessionId: string, userId: string, metadata: RequestMetadata) {
    await this.db.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.audit.record({ action: 'auth.logout', actorUserId: userId, effectiveUserId: userId, targetType: 'session', targetId: sessionId, ...metadata })
  }

  async logoutAll(userId: string, metadata: RequestMetadata) {
    await this.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await this.audit.record({ action: 'auth.logout_all', actorUserId: userId, effectiveUserId: userId, targetType: 'user', targetId: userId, ...metadata })
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.db.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true } })
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId, ipAddress: this.maskIp(session.ipAddress), device: this.deviceLabel(session.userAgent) }))
  }

  async revokeSession(userId: string, sessionId: string, currentSessionId: string, metadata: RequestMetadata) {
    const result = await this.db.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } })
    if (!result.count) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found.')
    await this.audit.record({ action: 'auth.session_revoked', actorUserId: userId, effectiveUserId: userId, targetType: 'session', targetId: sessionId, metadata: { current: sessionId === currentSessionId }, ...metadata })
    return { current: sessionId === currentSessionId }
  }

  publicUser(user: { id: string; email: string; status: string; emailVerifiedAt?: Date | null; profile: { displayName: string; handle: string; discriminator: string; locale: string; timezone: string; preferences: unknown } | null }) {
    const profile = user.profile as (typeof user.profile & { avatarUrl?: string | null; bio?: string | null; searchable?: boolean })
    return { id: user.id, email: user.email, status: user.status, emailVerified: Boolean(user.emailVerifiedAt), profile: profile ? { displayName: profile.displayName, handle: profile.handle, discriminator: profile.discriminator, code: `${profile.handle}#${profile.discriminator}`, avatarUrl: profile.avatarUrl ?? null, bio: profile.bio ?? null, locale: profile.locale, timezone: profile.timezone, searchable: profile.searchable ?? true, preferences: profile.preferences } : null }
  }

  private maskIp(value: string | null) {
    if (!value) return null
    if (value.includes(':')) return `${value.split(':').slice(0, 3).join(':')}:…`
    const parts = value.split('.'); return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : 'hidden'
  }

  private deviceLabel(value: string | null) {
    if (!value) return 'Unknown device'
    const browser = /Edg\//.test(value) ? 'Edge' : /Firefox\//.test(value) ? 'Firefox' : /Chrome\//.test(value) ? 'Chrome' : /Safari\//.test(value) ? 'Safari' : 'Browser'
    const system = /Android/.test(value) ? 'Android' : /iPhone|iPad/.test(value) ? 'iOS' : /Windows/.test(value) ? 'Windows' : /Mac OS/.test(value) ? 'macOS' : /Linux/.test(value) ? 'Linux' : 'Unknown OS'
    return `${browser} · ${system}`
  }
}
