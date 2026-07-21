import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { PrismaClient } from '@prisma/client'
import { csrfProtection, requireAuth } from '../auth/auth.middleware.js'
import { permissions, requirePermission } from '../authorization/policies.js'
import { grantAccessSchema, profileCodeSchema, respondAccessSchema, shareLinkSchema, sharingStateSchema, updateAccessSchema, updateShareLinkSchema } from './sharing.schemas.js'
import { SharingService } from './sharing.service.js'

const identity = (request: import('express').Request) => ({ actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, impersonationSessionId: request.auth!.impersonationSessionId, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) })

export function profileSearchRoutes(db: PrismaClient) {
  const router = Router(); const service = new SharingService(db)
  router.use(requireAuth, rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }))
  router.get('/search', async (request, response) => { const code = profileCodeSchema.parse(request.query.code); response.json({ profile: await service.searchProfile(request.auth!.effectiveUserId, code) }) })
  return router
}

export function sharingRoutes(db: PrismaClient) {
  const router = Router(); const service = new SharingService(db)
  router.use(requireAuth)
  router.get('/invitations', requirePermission(permissions.PLAN_READ), async (request, response) => response.json({ invitations: await service.invitations(request.auth!.effectiveUserId) }))
  router.patch('/access/:accessId/respond', csrfProtection, requirePermission(permissions.PLAN_READ), async (request, response) => response.json({ access: await service.respond(request.auth!.effectiveUserId, String(request.params.accessId), respondAccessSchema.parse(request.body).response, identity(request)) }))
  router.get('/:planId/access', requirePermission(permissions.PLAN_SHARE), async (request, response) => response.json({ access: await service.listAccess(request.auth!.effectiveUserId, String(request.params.planId)) }))
  router.patch('/:planId/access-state', csrfProtection, requirePermission(permissions.PLAN_SHARE), async (request, response) => response.json({ state: await service.setSharingState(request.auth!.effectiveUserId, String(request.params.planId), sharingStateSchema.parse(request.body).enabled, identity(request)) }))
  router.post('/:planId/share-link', csrfProtection, requirePermission(permissions.PLAN_SHARE), async (request, response) => response.status(201).json({ link: await service.createShareLink(request.auth!.effectiveUserId, String(request.params.planId), shareLinkSchema.parse(request.body).accessLevel, identity(request)) }))
  router.patch('/:planId/share-link', csrfProtection, requirePermission(permissions.PLAN_SHARE), async (request, response) => response.json({ link: await service.updateShareLink(request.auth!.effectiveUserId, String(request.params.planId), updateShareLinkSchema.parse(request.body), identity(request)) }))
  router.delete('/:planId/share-link', csrfProtection, requirePermission(permissions.PLAN_SHARE), async (request, response) => { await service.deleteShareLink(request.auth!.effectiveUserId, String(request.params.planId), identity(request)); response.status(204).end() })
  router.post('/:planId/access', csrfProtection, requirePermission(permissions.PLAN_SHARE), async (request, response) => { const input = grantAccessSchema.parse(request.body); response.status(201).json({ access: await service.grant(request.auth!.effectiveUserId, String(request.params.planId), input.profileCode, input.accessLevel, identity(request)) }) })
  router.patch('/:planId/access/:accessId', csrfProtection, requirePermission(permissions.PLAN_SHARE), async (request, response) => response.json({ access: await service.update(request.auth!.effectiveUserId, String(request.params.planId), String(request.params.accessId), updateAccessSchema.parse(request.body).accessLevel, identity(request)) }))
  router.delete('/:planId/access/:accessId', csrfProtection, requirePermission(permissions.PLAN_SHARE), async (request, response) => { await service.revoke(request.auth!.effectiveUserId, String(request.params.planId), String(request.params.accessId), identity(request)); response.status(204).end() })
  return router
}
