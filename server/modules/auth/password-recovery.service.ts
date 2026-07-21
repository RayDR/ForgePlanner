import argon2 from 'argon2'
import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { createOpaqueToken, hashToken } from '../../security/crypto.js'
import { SmtpEmailProvider } from '../email/smtp.provider.js'
import { TemplateService } from '../email/template.service.js'
import type { RequestMetadata } from './auth.types.js'
import { EmailConfigurationService } from '../email/email-configuration.service.js'

export class PasswordRecoveryService {
  constructor(private db: PrismaClient, private env: AppEnv) {}

  async request(email: string, metadata: RequestMetadata) {
    const user = await this.db.user.findUnique({ where: { email }, include: { profile: true } })
    if (!user || !user.passwordHash || user.status === 'deleted') return
    const configurationService = new EmailConfigurationService(this.db, this.env)
    const publicConfiguration = await configurationService.publicConfiguration()
    const resetExpiresMinutes = publicConfiguration.resetExpiresMinutes
    const token = createOpaqueToken(40)
    const expiresAt = new Date(Date.now() + resetExpiresMinutes * 60_000)
    await this.db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt, requestedIp: metadata.ipAddress, userAgent: metadata.userAgent } })
    await this.db.auditLog.create({ data: { action: 'auth.password_reset_requested', actorUserId: user.id, effectiveUserId: user.id, targetType: 'user', targetId: user.id, ...metadata } })
    const settings = await configurationService.resolve()
    if (!settings) return
    const provider = new SmtpEmailProvider(settings)
    const templateService = new TemplateService(this.db)
    const template = await templateService.get()
    const content = await templateService.passwordReset({ displayName: user.profile?.displayName ?? 'NorthStar user', resetUrl: `${publicConfiguration.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`, expiresMinutes: resetExpiresMinutes })
    try {
      const delivery = await provider.send({ to: user.email, ...content })
      await this.db.emailDeliveryLog.create({ data: { templateKey: template.key, templateVersion: template.version, recipientHash: hashToken(user.email), provider: delivery.provider, status: 'sent' } })
    } catch {
      await this.db.emailDeliveryLog.create({ data: { templateKey: template.key, templateVersion: template.version, recipientHash: hashToken(user.email), provider: 'smtp', status: 'failed', errorCode: 'DELIVERY_FAILED' } })
    }
  }

  async reset(token: string, password: string, metadata: RequestMetadata) {
    const tokenHash = hashToken(token)
    const record = await this.db.passwordResetToken.findUnique({ where: { tokenHash } })
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new ApiError(400, 'RESET_TOKEN_INVALID', 'The reset link is invalid or expired.')
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
    await this.db.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })
      if (consumed.count !== 1) throw new ApiError(400, 'RESET_TOKEN_INVALID', 'The reset link is invalid or expired.')
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })
      await tx.auditLog.create({ data: { action: 'auth.password_reset_completed', actorUserId: record.userId, effectiveUserId: record.userId, targetType: 'user', targetId: record.userId, ...metadata } })
    })
  }
}
