import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { csrfProtection, requireAuth } from '../auth/auth.middleware.js'
import { notificationIdSchema, notificationPreferenceSchema } from './notification.schemas.js'
import { NotificationService } from './notification.service.js'

export function notificationRoutes(db: PrismaClient) {
  const router = Router(); const service = new NotificationService(db)
  router.use(requireAuth)
  router.get('/', async (request, response) => response.json(await service.list(request.auth!.effectiveUserId)))
  router.get('/preferences', async (request, response) => response.json({ preferences: await service.preferences(request.auth!.effectiveUserId) }))
  router.patch('/preferences', csrfProtection, async (request, response) => response.json({ preferences: await service.updatePreferences(request.auth!.effectiveUserId, notificationPreferenceSchema.parse(request.body)) }))
  router.patch('/read-all', csrfProtection, async (request, response) => { await service.markAllRead(request.auth!.effectiveUserId); response.status(204).end() })
  router.patch('/:notificationId/read', csrfProtection, async (request, response) => { await service.markRead(request.auth!.effectiveUserId, notificationIdSchema.parse(request.params.notificationId)); response.status(204).end() })
  return router
}
