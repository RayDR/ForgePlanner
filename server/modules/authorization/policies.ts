import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../../http/errors.js'

export const permissions = {
  USER_READ: 'user.read', USER_MANAGE: 'user.manage', PLAN_CREATE: 'plan.create', PLAN_READ: 'plan.read',
  PLAN_UPDATE: 'plan.update', PLAN_DELETE: 'plan.delete', PLAN_SHARE: 'plan.share', ADMIN_IMPERSONATE: 'admin.impersonate',
  EMAIL_SETTINGS_MANAGE: 'settings.email.manage', EMAIL_TEMPLATE_MANAGE: 'emailTemplate.manage',
} as const

export function requirePermission(permission: string) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth?.permissions.has(permission)) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
    next()
  }
}

export function requireActorPermission(permission: string) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth?.actorPermissions.has(permission)) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
    next()
  }
}
