import { OAuth2Client } from 'google-auth-library'
import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { ProfileService } from '../profiles/profile.service.js'
import { AuthService } from './auth.service.js'
import type { RequestMetadata } from './auth.types.js'

export class GoogleAuthService {
  private client: OAuth2Client
  constructor(private db: PrismaClient, private env: AppEnv) {
    this.client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI)
  }

  enabled() { return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET && this.env.GOOGLE_REDIRECT_URI) }

  authorizationUrl(state: string) {
    if (!this.enabled()) throw new ApiError(404, 'GOOGLE_AUTH_DISABLED', 'Google sign-in is not configured.')
    return this.client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' })
  }

  async callback(code: string, metadata: RequestMetadata) {
    if (!this.enabled()) throw new ApiError(404, 'GOOGLE_AUTH_DISABLED', 'Google sign-in is not configured.')
    const { tokens } = await this.client.getToken(code)
    const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token!, audience: this.env.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email || !payload.email_verified) throw new ApiError(401, 'GOOGLE_IDENTITY_INVALID', 'Google could not verify this account.')
    const email = payload.email.toLowerCase()
    let identity = await this.db.externalIdentity.findUnique({ where: { provider_providerUserId: { provider: 'google', providerUserId: payload.sub } }, include: { user: { include: { profile: true } } } })
    if (!identity) {
      const existingUser = await this.db.user.findUnique({ where: { email }, include: { profile: true } })
      const user = existingUser ?? await this.db.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, status: 'active', emailVerifiedAt: new Date() } })
        await new ProfileService(tx).create(created.id, payload.name?.slice(0, 80) || email.split('@')[0])
        const role = await tx.role.findUniqueOrThrow({ where: { key: 'user' } })
        await tx.userRole.create({ data: { userId: created.id, roleId: role.id } })
        return tx.user.findUniqueOrThrow({ where: { id: created.id }, include: { profile: true } })
      })
      identity = await this.db.externalIdentity.create({ data: { userId: user.id, provider: 'google', providerUserId: payload.sub, providerEmail: email }, include: { user: { include: { profile: true } } } })
    }
    await this.db.auditLog.create({ data: { action: 'auth.google_login', actorUserId: identity.userId, effectiveUserId: identity.userId, targetType: 'user', targetId: identity.userId, ...metadata } })
    return new AuthService(this.db, this.env).createSession(identity.user, metadata)
  }
}
