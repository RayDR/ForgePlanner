import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { requireAuth, csrfProtection } from '../auth/auth.middleware.js'
import { updatePreferencesSchema } from './profile.schemas.js'
import { ProfileService } from './profile.service.js'

export function profileRoutes(db: PrismaClient) {
  const router = Router()
  const dto = (profile: { displayName: string; handle: string; discriminator: string; avatarUrl: string | null; bio: string | null; locale: string; timezone: string; searchable: boolean; preferences: unknown }) => ({
    displayName: profile.displayName,
    handle: profile.handle,
    discriminator: profile.discriminator,
    code: `${profile.handle}#${profile.discriminator}`,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    locale: profile.locale,
    timezone: profile.timezone,
    searchable: profile.searchable,
    preferences: profile.preferences,
  })
  router.use(requireAuth)
  router.get('/', async (request, response) => {
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: request.auth!.effectiveUserId } })
    response.json({ profile: dto(profile) })
  })
  router.patch('/', csrfProtection, async (request, response) => {
    if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Profile changes are unavailable during impersonation.')
    const input = updatePreferencesSchema.parse(request.body)
    const profile = await new ProfileService(db).update(request.auth!.effectiveUserId, input)
    await db.auditLog.create({ data: { action: 'profile.updated', actorUserId: request.auth!.actorUserId, effectiveUserId: request.auth!.effectiveUserId, targetType: 'profile', targetId: profile.id, metadata: { fields: Object.keys(input).filter((key) => key !== 'theme'), appearanceChanged: Boolean(input.locale || input.theme) }, ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) } })
    response.json({ profile: dto(profile) })
  })
  return router
}
