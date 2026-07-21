export interface AuthContext {
  sessionId: string
  actorUserId: string
  effectiveUserId: string
  permissions: Set<string>
  actorPermissions: Set<string>
  csrfTokenHash: string
  impersonationSessionId?: string
  impersonationExpiresAt?: Date
}

export interface RequestMetadata {
  ipAddress?: string
  userAgent?: string
}
