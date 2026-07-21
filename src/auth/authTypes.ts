export interface SessionUser {
  id: string
  email: string
  status: string
  emailVerified: boolean
  profile: null | { displayName: string; handle: string; discriminator: string; code: string; avatarUrl: string | null; bio: string | null; locale: string; timezone: string; searchable: boolean; preferences?: { theme?: 'light' | 'dark' } }
}

export interface SessionPayload {
  user: SessionUser
  expiresAt: string
  permissions: string[]
  impersonation: null | { id: string; expiresAt: string; actor: SessionUser }
}
export interface AuthConfig { googleEnabled: boolean; recaptchaSiteKey: string | null; emailVerificationRequired: boolean }
export interface AccountSession { id: string; current: boolean; device: string; ipAddress: string | null; createdAt: string; lastSeenAt: string; expiresAt: string; userAgent: string | null }
