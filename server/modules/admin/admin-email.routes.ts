import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { requireAuth, csrfProtection } from '../auth/auth.middleware.js'
import { permissions, requirePermission } from '../authorization/policies.js'
import { EmailConfigurationService } from '../email/email-configuration.service.js'
import { SmtpEmailProvider } from '../email/smtp.provider.js'
import { emailSettingsSchema, testEmailSchema } from './admin-email.schemas.js'

export function adminEmailRoutes(db: PrismaClient, env: AppEnv) {
  const router = Router(); const service = new EmailConfigurationService(db, env)
  router.use(requireAuth, requirePermission(permissions.EMAIL_SETTINGS_MANAGE))
  router.get('/', async (_request, response) => response.json({ configuration: await service.publicConfiguration() }))
  router.patch('/', csrfProtection, async (request, response) => {
    if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Email settings cannot be changed during impersonation.')
    const configuration = await service.update(emailSettingsSchema.parse(request.body))
    await db.auditLog.create({ data: { action: 'admin.email_configuration_updated', actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, targetType: 'email_configuration', targetId: env.NODE_ENV, metadata: { enabled: configuration.enabled, host: configuration.host, passwordChanged: request.body?.password ? true : false }, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) } })
    response.json({ configuration })
  })
  router.post('/test', csrfProtection, async (request, response) => {
    if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Test email cannot be sent during impersonation.')
    const input = testEmailSchema.parse(request.body); const settings = await service.resolve()
    if (!settings) throw new ApiError(409, 'SMTP_NOT_CONFIGURED', 'SMTP is not configured or enabled.')
    const recipient = input.recipient ?? settings.senderEmail
    const result = await new SmtpEmailProvider(settings).send({ to: recipient, subject: 'NorthStar Planner SMTP test', text: 'NorthStar Planner SMTP configuration is working.', html: '<p><strong>NorthStar Planner</strong> SMTP configuration is working.</p>' })
    await db.emailDeliveryLog.create({ data: { templateKey: 'smtp-test', templateVersion: 1, recipientHash: (await import('../../security/crypto.js')).hashToken(recipient), provider: result.provider, status: 'sent' } })
    response.json({ delivered: true })
  })
  return router
}
