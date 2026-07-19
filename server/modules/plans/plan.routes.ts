import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { csrfProtection, requireAuth } from '../auth/auth.middleware.js'
import { permissions, requirePermission } from '../authorization/policies.js'
import { createPlanSchema, importPlansSchema, updatePlanSchema } from './plan.schemas.js'
import { PlanService } from './plan.service.js'

const identity = (request: import('express').Request) => ({ actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, impersonationSessionId: request.auth!.impersonationSessionId, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) })

export function planRoutes(db: PrismaClient) {
  const router = Router(); const service = new PlanService(db)
  router.use(requireAuth)
  router.get('/', requirePermission(permissions.PLAN_READ), async (request, response) => response.json({ plans: await service.list(request.auth!.effectiveUserId) }))
  router.get('/link/:linkId', requirePermission(permissions.PLAN_READ), async (request, response) => response.json({ plan: await service.getByLink(String(request.params.linkId)) }))
  router.patch('/link/:linkId', csrfProtection, requirePermission(permissions.PLAN_UPDATE), async (request, response) => response.json({ plan: await service.updateByLink(String(request.params.linkId), updatePlanSchema.parse(request.body), identity(request)) }))
  router.post('/', csrfProtection, requirePermission(permissions.PLAN_CREATE), async (request, response) => {
    const result = await service.create(request.auth!.effectiveUserId, createPlanSchema.parse(request.body), identity(request))
    response.status(result.created ? 201 : 200).json(result)
  })
  router.post('/import', csrfProtection, requirePermission(permissions.PLAN_CREATE), async (request, response) => response.json({ plans: await service.import(request.auth!.effectiveUserId, importPlansSchema.parse(request.body).plans, identity(request)) }))
  router.get('/:planId', requirePermission(permissions.PLAN_READ), async (request, response) => response.json({ plan: await service.get(request.auth!.effectiveUserId, String(request.params.planId)) }))
  router.patch('/:planId', csrfProtection, requirePermission(permissions.PLAN_UPDATE), async (request, response) => response.json({ plan: await service.update(request.auth!.effectiveUserId, String(request.params.planId), updatePlanSchema.parse(request.body), identity(request)) }))
  router.post('/:planId/restore', csrfProtection, requirePermission(permissions.PLAN_DELETE), async (request, response) => response.json({ plan: await service.restore(request.auth!.effectiveUserId, String(request.params.planId), identity(request)) }))
  router.delete('/:planId/permanent', csrfProtection, requirePermission(permissions.PLAN_DELETE), async (request, response) => { await service.permanentlyRemove(request.auth!.effectiveUserId, String(request.params.planId), identity(request)); response.status(204).end() })
  router.delete('/:planId', csrfProtection, requirePermission(permissions.PLAN_DELETE), async (request, response) => { await service.remove(request.auth!.effectiveUserId, String(request.params.planId), identity(request)); response.status(204).end() })
  return router
}
