import type { NextFunction, Request, Response } from 'express'
import type { PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'
import { hashToken } from '../../security/crypto.js'
import { AuthRepository } from './auth.repository.js'

export const SESSION_COOKIE = 'northstar_session'
export const CSRF_COOKIE = 'northstar_csrf'

export function authentication(db: PrismaClient) {
  const repository = new AuthRepository(db)
  return async (request: Request, _response: Response, next: NextFunction) => {
    const token = request.cookies?.[SESSION_COOKIE]
    if (!token) { next(); return }
    const session = await repository.findSession(hashToken(token))
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'active') { next(); return }
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) await repository.touchSession(session.id)
    const actorPermissions = new Set(session.user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))
    const activeImpersonation = session.impersonation && !session.impersonation.endedAt && session.impersonation.expiresAt > new Date() && session.impersonation.targetUser.status === 'active' ? session.impersonation : null
    const effectiveUser = activeImpersonation?.targetUser ?? session.user
    const permissions = new Set(effectiveUser.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))
    request.auth = {
      sessionId: session.id,
      actorUserId: session.userId,
      effectiveUserId: effectiveUser.id,
      permissions,
      actorPermissions,
      csrfTokenHash: session.csrfTokenHash,
      impersonationSessionId: activeImpersonation?.id,
      impersonationExpiresAt: activeImpersonation?.expiresAt,
    }
    next()
  }
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.')
  next()
}

export function csrfProtection(request: Request, _response: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) { next(); return }
  const cookieToken = request.cookies?.[CSRF_COOKIE]
  const headerToken = request.get('x-csrf-token')
  if (!cookieToken || !headerToken || cookieToken !== headerToken || hashToken(headerToken) !== request.auth?.csrfTokenHash) throw new ApiError(403, 'INVALID_CSRF_TOKEN', 'The security token is invalid.')
  next()
}
