import { Router } from 'express'
import type { Request } from 'express'
import type { PrismaClient } from '@prisma/client'
import { csrfProtection, requireAuth } from '../auth/auth.middleware.js'
import { permissions, requireActorPermission, requirePermission } from '../authorization/policies.js'
import { AdminService } from './admin.service.js'
import { auditQuerySchema, impersonationSchema, updateUserSchema, userListQuerySchema } from './admin.schemas.js'
import { ApiError } from '../../http/errors.js'

function identity(request: Request) { return { sessionId: request.auth!.sessionId, actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, impersonationSessionId: request.auth!.impersonationSessionId, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) } }

export function adminRoutes(db: PrismaClient) {
  const router = Router(); const service = new AdminService(db)
  router.use(requireAuth)
  router.delete('/impersonation', csrfProtection, requireActorPermission(permissions.ADMIN_IMPERSONATE), async (request, response) => { await service.endImpersonation(identity(request)); response.status(204).end() })
  router.use((request, _response, next) => { if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Administrative operations are unavailable during impersonation.'); next() })
  router.get('/users', requirePermission(permissions.USER_READ), async (request, response) => response.json(await service.listUsers(userListQuerySchema.parse(request.query))))
  router.get('/users/:userId', requirePermission(permissions.USER_READ), async (request, response) => response.json({ user: await service.getUser(String(request.params.userId)) }))
  router.patch('/users/:userId', csrfProtection, requirePermission(permissions.USER_MANAGE), async (request, response) => response.json({ user: await service.updateUser(request.auth!.actorUserId, String(request.params.userId), updateUserSchema.parse(request.body), identity(request)) }))
  router.post('/impersonation', csrfProtection, requirePermission(permissions.ADMIN_IMPERSONATE), async (request, response) => { const input = impersonationSchema.parse(request.body); response.status(201).json({ impersonation: await service.startImpersonation(input.targetUserId, input.reason, identity(request)) }) })
  router.get('/audit-logs', requirePermission(permissions.USER_READ), async (request, response) => response.json(await service.auditLogs(auditQuerySchema.parse(request.query))))
  return router
}
