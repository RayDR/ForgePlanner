import { createHash } from 'node:crypto'
import { Router } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { csrfProtection, requireAuth } from '../auth/auth.middleware.js'
import { AiProposalService } from './ai.service.js'
import { AiGuestService, AI_GUEST_COOKIE, AI_GUEST_CSRF_COOKIE } from './ai-guest.service.js'
import { guestRefinementSchema, guestTransitionSchema, listSchema, planningInputSchema, refinementSchema, revisionSchema, transitionSchema } from './ai.schemas.js'
import { createAiProposalProvider } from './ai-provider.factory.js'

const identity = (request: import('express').Request) => ({ actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, impersonationSessionId: request.auth!.impersonationSessionId, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) })
const controllerFor = (request: import('express').Request) => { const controller = new AbortController(); request.once('aborted', () => controller.abort()); return controller }

export function aiProposalRoutes(db: PrismaClient, env: AppEnv) {
  const router = Router(); const provider = createAiProposalProvider(env); const service = new AiProposalService(db, provider)
  const guest = env.AI_GUEST_SESSION_SIGNING_KEY ? new AiGuestService(provider, env.AI_GUEST_SESSION_SIGNING_KEY) : null
  const authKey = (request: import('express').Request) => request.auth?.effectiveUserId ?? ipKeyGenerator(request.ip ?? 'unknown')
  const guestKey = (request: import('express').Request) => `${ipKeyGenerator(request.ip ?? 'unknown')}:${createHash('sha256').update(request.cookies?.[AI_GUEST_COOKIE] ?? 'none').digest('hex').slice(0, 20)}`
  const generationLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, keyGenerator: authKey, standardHeaders: true, legacyHeaders: false })
  const guestGenerationLimit = rateLimit({ windowMs: 15 * 60_000, limit: 3, keyGenerator: guestKey, standardHeaders: true, legacyHeaders: false })
  const refinementLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, keyGenerator: authKey, standardHeaders: true, legacyHeaders: false })
  const readLimit = rateLimit({ windowMs: 60_000, limit: 120, keyGenerator: authKey, standardHeaders: true, legacyHeaders: false })
  const transitionLimit = rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: authKey, standardHeaders: true, legacyHeaders: false })
  const guestTransitionLimit = rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: guestKey, standardHeaders: true, legacyHeaders: false })

  router.post('/guest/session', (request, response) => {
    if (!guest) throw new ApiError(503, 'AI_GUEST_NOT_CONFIGURED', 'Guest proposal sessions are unavailable.')
    const issued = guest.issueSession(); const cookie = { httpOnly: true, sameSite: 'lax' as const, secure: env.COOKIE_SECURE, path: '/api/ai' }
    response.cookie(AI_GUEST_COOKIE, issued.sessionToken, cookie); response.cookie(AI_GUEST_CSRF_COOKIE, issued.csrfToken, { ...cookie, path: '/', httpOnly: false }).json({ expiresAt: issued.expiresAt, csrfToken: issued.csrfToken })
  })
  const guestSession = (request: import('express').Request) => { if (!guest) throw new ApiError(503, 'AI_GUEST_NOT_CONFIGURED', 'Guest proposal sessions are unavailable.'); return guest.verifySession(request.cookies?.[AI_GUEST_COOKIE], request.cookies?.[AI_GUEST_CSRF_COOKIE], request.get('x-ai-guest-csrf')) }
  router.post('/guest/plan-proposals', guestGenerationLimit, async (request, response) => { const controller = controllerFor(request); response.status(201).json(await guest!.generate(guestSession(request), planningInputSchema.parse(request.body), controller.signal)) })
  router.post('/guest/plan-proposals/:operationId/refine', guestGenerationLimit, async (request, response) => { const controller = controllerFor(request); response.json(await guest!.refine(guestSession(request), String(request.params.operationId), guestRefinementSchema.parse(request.body), controller.signal)) })
  router.post('/guest/plan-proposals/:operationId/ready', guestTransitionLimit, (request, response) => { const session = guestSession(request); response.json(guest!.transition(session, String(request.params.operationId), guestTransitionSchema.parse(request.body), 'READY_FOR_CONVERSION')) })
  router.post('/guest/plan-proposals/:operationId/reject', guestTransitionLimit, (request, response) => { const session = guestSession(request); response.json(guest!.transition(session, String(request.params.operationId), guestTransitionSchema.parse(request.body), 'REJECTED')) })

  router.use(requireAuth)
  router.post('/plan-proposals', generationLimit, csrfProtection, async (request, response) => { const controller = controllerFor(request); response.status(201).json(await service.generate(request.auth!.effectiveUserId, planningInputSchema.parse(request.body), identity(request), controller.signal)) })
  router.get('/plan-proposals', readLimit, async (request, response) => { const query = listSchema.parse(request.query); response.json(await service.list(request.auth!.effectiveUserId, query.page, query.limit)) })
  router.get('/plan-proposals/:operationId/revisions', readLimit, async (request, response) => response.json({ revisions: await service.revisions(request.auth!.effectiveUserId, String(request.params.operationId)) }))
  router.get('/plan-proposals/:operationId/revisions/:revision', readLimit, async (request, response) => response.json({ revision: await service.revision(request.auth!.effectiveUserId, String(request.params.operationId), revisionSchema.parse(request.params.revision)) }))
  router.get('/plan-proposals/:operationId', readLimit, async (request, response) => response.json(await service.get(request.auth!.effectiveUserId, String(request.params.operationId))))
  router.post('/plan-proposals/:operationId/refine', refinementLimit, csrfProtection, async (request, response) => { const controller = controllerFor(request); response.json(await service.refine(request.auth!.effectiveUserId, String(request.params.operationId), refinementSchema.parse(request.body), identity(request), controller.signal)) })
  router.post('/plan-proposals/:operationId/ready', transitionLimit, csrfProtection, async (request, response) => { const input = transitionSchema.parse(request.body); response.json(await service.transition(request.auth!.effectiveUserId, String(request.params.operationId), input.expectedRevision, 'READY_FOR_CONVERSION', identity(request))) })
  router.post('/plan-proposals/:operationId/reject', transitionLimit, csrfProtection, async (request, response) => { const input = transitionSchema.parse(request.body); response.json(await service.transition(request.auth!.effectiveUserId, String(request.params.operationId), input.expectedRevision, 'REJECTED', identity(request))) })
  router.delete('/plan-proposals/:operationId', transitionLimit, csrfProtection, async (request, response) => response.json(await service.remove(request.auth!.effectiveUserId, String(request.params.operationId), identity(request))))
  return router
}
