import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { AppEnv } from '../../config/env.js'
import type { PrismaClient } from '@prisma/client'
import { AuthController } from './auth.controller.js'
import { csrfProtection, requireAuth } from './auth.middleware.js'

export function authRoutes(db: PrismaClient, env: AppEnv) {
  const router = Router()
  const controller = new AuthController(db, env)
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false })
  router.get('/config', controller.config)
  router.get('/google/start', controller.googleStart)
  router.get('/google/callback', controller.googleCallback)
  router.post('/register', authLimiter, controller.register)
  router.post('/login', authLimiter, controller.login)
  router.post('/password/forgot', authLimiter, controller.forgotPassword)
  router.post('/password/reset', authLimiter, controller.resetPassword)
  router.post('/email-verification/request', authLimiter, controller.requestEmailVerification)
  router.post('/email-verification/confirm', authLimiter, controller.confirmEmailVerification)
  router.get('/session', controller.session)
  router.get('/sessions', requireAuth, controller.sessions)
  router.delete('/sessions/:sessionId', requireAuth, csrfProtection, controller.revokeSession)
  router.post('/logout', requireAuth, csrfProtection, controller.logout)
  router.post('/logout-all', requireAuth, csrfProtection, controller.logoutAll)
  return router
}
