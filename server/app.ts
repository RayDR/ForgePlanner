import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from './config/env.js'
import { logger } from './config/logger.js'
import { errorHandler } from './http/errors.js'
import { authentication } from './modules/auth/auth.middleware.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { profileRoutes } from './modules/profiles/profile.routes.js'
import { planRoutes } from './modules/plans/plan.routes.js'
import { profileSearchRoutes, sharingRoutes } from './modules/sharing/sharing.routes.js'
import { adminRoutes } from './modules/admin/admin.routes.js'
import { adminEmailRoutes } from './modules/admin/admin-email.routes.js'
import { adminTemplateRoutes } from './modules/admin/admin-template.routes.js'
import { notificationRoutes } from './modules/notifications/notification.routes.js'
import { collaborationRoutes } from './modules/collaboration/collaboration.routes.js'

export function createApp(db: PrismaClient, env: AppEnv) {
  const app = express()
  if (env.TRUST_PROXY) app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(pinoHttp({ logger }))
  app.use(helmet())
  app.use(cors({ origin: env.APP_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }))
  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())
  app.use(authentication(db))
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
  app.use('/api/auth', authRoutes(db, env))
  app.use('/api/admin', adminRoutes(db))
  app.use('/api/admin/settings/email', adminEmailRoutes(db, env))
  app.use('/api/admin/email-templates', adminTemplateRoutes(db))
  app.use('/api/profile', profileRoutes(db))
  app.use('/api/notifications', notificationRoutes(db))
  app.use('/api/collaboration', collaborationRoutes(db))
  app.use('/api/profiles', profileSearchRoutes(db))
  app.use('/api/plans', sharingRoutes(db))
  app.use('/api/plans', planRoutes(db))
  app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }))
  app.use(errorHandler)
  return app
}
