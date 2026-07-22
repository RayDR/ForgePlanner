import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { createOpaqueToken, hashToken } from '../../security/crypto.js'
import { EmailConfigurationService } from '../email/email-configuration.service.js'
import { SmtpEmailProvider } from '../email/smtp.provider.js'
import type { RequestMetadata } from './auth.types.js'

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!) }

export class EmailVerificationService {
  constructor(private db: PrismaClient, private env: AppEnv) {}

  async request(email: string, metadata: RequestMetadata) {
    const user = await this.db.user.findUnique({ where: { email }, include: { profile: true } })
    if (!user || user.emailVerifiedAt || user.status === 'deleted') return
    const recent = await this.db.emailVerificationToken.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } })
    if (recent) return
    const token = createOpaqueToken(40)
    const expiresAt = new Date(Date.now() + this.env.EMAIL_VERIFICATION_TTL_HOURS * 3_600_000)
    await this.db.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt, requestedIp: metadata.ipAddress, userAgent: metadata.userAgent } })
    await this.db.auditLog.create({ data: { action: 'auth.email_verification_requested', actorUserId: user.id, effectiveUserId: user.id, targetType: 'user', targetId: user.id, ...metadata } })
    const configuration = new EmailConfigurationService(this.db, this.env)
    const settings = await configuration.resolve()
    if (!settings) return
    const publicSettings = await configuration.publicConfiguration()
    const es = user.profile?.locale !== 'en'
    const url = `${publicSettings.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`
    const name = escapeHtml(user.profile?.displayName ?? 'NorthStar user')
    const subject = es ? 'Verifica tu correo de ForgePlanner' : 'Verify your ForgePlanner email'
    const text = es ? `Hola ${user.profile?.displayName ?? ''}, verifica tu correo: ${url}\nEste enlace vence en ${this.env.EMAIL_VERIFICATION_TTL_HOURS} horas.` : `Hello ${user.profile?.displayName ?? ''}, verify your email: ${url}\nThis link expires in ${this.env.EMAIL_VERIFICATION_TTL_HOURS} hours.`
    const html = `<main><h1>${es ? 'Verifica tu correo' : 'Verify your email'}</h1><p>${es ? `Hola ${name}. Confirma que esta dirección te pertenece.` : `Hello ${name}. Confirm that this address belongs to you.`}</p><p><a href="${escapeHtml(url)}">${es ? 'Verificar correo' : 'Verify email'}</a></p><p>${es ? `El enlace vence en ${this.env.EMAIL_VERIFICATION_TTL_HOURS} horas.` : `The link expires in ${this.env.EMAIL_VERIFICATION_TTL_HOURS} hours.`}</p></main>`
    try {
      const delivery = await new SmtpEmailProvider(settings).send({ to: user.email, subject, html, text })
      await this.db.emailDeliveryLog.create({ data: { templateKey: 'email-verification', templateVersion: 1, recipientHash: hashToken(user.email), provider: delivery.provider, status: 'sent' } })
    } catch {
      await this.db.emailDeliveryLog.create({ data: { templateKey: 'email-verification', templateVersion: 1, recipientHash: hashToken(user.email), provider: 'smtp', status: 'failed', errorCode: 'DELIVERY_FAILED' } })
    }
  }

  async confirm(token: string, metadata: RequestMetadata) {
    const record = await this.db.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new ApiError(400, 'VERIFICATION_TOKEN_INVALID', 'The verification link is invalid or expired.')
    await this.db.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })
      if (consumed.count !== 1) throw new ApiError(400, 'VERIFICATION_TOKEN_INVALID', 'The verification link is invalid or expired.')
      await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date(), status: record.user.status === 'pending' ? 'active' : record.user.status } })
      await tx.emailVerificationToken.updateMany({ where: { userId: record.userId, id: { not: record.id }, usedAt: null }, data: { usedAt: new Date() } })
      await tx.auditLog.create({ data: { action: 'auth.email_verified', actorUserId: record.userId, effectiveUserId: record.userId, targetType: 'user', targetId: record.userId, ...metadata } })
    })
  }
}
