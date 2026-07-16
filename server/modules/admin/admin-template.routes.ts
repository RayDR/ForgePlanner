import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { requireAuth, csrfProtection } from '../auth/auth.middleware.js'
import { permissions, requirePermission } from '../authorization/policies.js'
import { TemplateService } from '../email/template.service.js'
import { templateContentSchema } from './admin-template.schemas.js'

export function adminTemplateRoutes(db: PrismaClient) {
  const router = Router(); const service = new TemplateService(db)
  router.use(requireAuth, requirePermission(permissions.EMAIL_TEMPLATE_MANAGE))
  router.get('/', async (_request, response) => response.json({ templates: [await service.get()] }))
  router.get('/:templateKey', async (request, response) => { if (request.params.templateKey !== 'password-reset') throw new ApiError(404, 'EMAIL_TEMPLATE_NOT_FOUND', 'Email template not found.'); response.json({ template: await service.get() }) })
  router.patch('/:templateKey', csrfProtection, async (request, response) => {
    if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Email templates cannot be changed during impersonation.')
    if (request.params.templateKey !== 'password-reset') throw new ApiError(404, 'EMAIL_TEMPLATE_NOT_FOUND', 'Email template not found.')
    const template = await service.save(templateContentSchema.parse(request.body))
    await db.auditLog.create({ data: { action: 'admin.email_template_updated', actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, targetType: 'email_template', targetId: template.key, metadata: { version: template.version }, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) } })
    response.json({ template })
  })
  router.post('/:templateKey/preview', csrfProtection, async (request, response) => { if (request.params.templateKey !== 'password-reset') throw new ApiError(404, 'EMAIL_TEMPLATE_NOT_FOUND', 'Email template not found.'); response.json({ preview: await service.preview(templateContentSchema.parse(request.body)) }) })
  router.post('/:templateKey/reset', csrfProtection, async (request, response) => {
    if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Email templates cannot be changed during impersonation.')
    if (request.params.templateKey !== 'password-reset') throw new ApiError(404, 'EMAIL_TEMPLATE_NOT_FOUND', 'Email template not found.')
    const template = await service.reset()
    await db.auditLog.create({ data: { action: 'admin.email_template_reset', actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, targetType: 'email_template', targetId: template.key, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) } })
    response.json({ template })
  })
  return router
}
