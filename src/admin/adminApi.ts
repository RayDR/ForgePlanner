export interface AdminUser { id: string; email: string; status: 'pending' | 'active' | 'suspended' | 'disabled' | 'deleted'; emailVerifiedAt: string | null; lastLoginAt: string | null; createdAt: string; profile: null | { displayName: string; code: string; locale: string; timezone: string }; roles: { key: string; name: string }[]; counts: { ownedPlans: number; planAccess: number; sessions: number } }
export interface AuditRecord { id: string; action: string; actorUserId: string | null; effectiveUserId: string | null; targetType: string | null; targetId: string | null; metadata: unknown; ipAddress: string | null; createdAt: string; impersonationSessionId: string | null }
export interface EmailConfiguration { environment: string; enabled: boolean; host: string; port: number; secure: boolean; username: string; senderEmail: string; senderName: string; replyTo: string; timeoutMs: number; frontendUrl: string; resetExpiresMinutes: number; passwordConfigured: boolean; source: 'database' | 'environment' }
export interface EmailTemplate { key: string; version: number; subject: string; htmlBody: string; textBody: string; source: 'database' | 'default'; updatedAt: string | null; allowedTags: string[] }

function csrfToken() { return document.cookie.split('; ').find((item) => item.startsWith('northstar_csrf='))?.split('=').slice(1).join('=') }
async function request<T>(path: string, init: RequestInit = {}) {
  const token = csrfToken(); const response = await fetch(`/api/admin${path}`, { ...init, credentials: 'include', headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-csrf-token': decodeURIComponent(token) } : {}), ...init.headers } })
  if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(payload?.error?.message ?? 'Administrative request failed.') }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const adminApi = {
  users: (query = '') => request<{ users: AdminUser[]; total: number; page: number; limit: number }>(`/users${query ? `?${query}` : ''}`),
  updateUser: (userId: string, input: { status?: AdminUser['status']; roles?: ('admin' | 'user')[] }) => request<{ user: AdminUser }>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  startImpersonation: (targetUserId: string, reason: string) => request('/impersonation', { method: 'POST', body: JSON.stringify({ targetUserId, reason }) }),
  endImpersonation: () => request<void>('/impersonation', { method: 'DELETE' }),
  audit: () => request<{ logs: AuditRecord[]; total: number; page: number; limit: number }>('/audit-logs?limit=50'),
  emailConfiguration: async () => (await request<{ configuration: EmailConfiguration }>('/settings/email')).configuration,
  updateEmailConfiguration: async (input: Omit<EmailConfiguration, 'environment' | 'passwordConfigured' | 'source'> & { password?: string }) => (await request<{ configuration: EmailConfiguration }>('/settings/email', { method: 'PATCH', body: JSON.stringify(input) })).configuration,
  testEmail: (recipient?: string) => request<{ delivered: boolean }>('/settings/email/test', { method: 'POST', body: JSON.stringify({ recipient: recipient || undefined }) }),
  emailTemplate: async () => (await request<{ template: EmailTemplate }>('/email-templates/password-reset')).template,
  updateEmailTemplate: async (input: Pick<EmailTemplate, 'subject' | 'htmlBody' | 'textBody'>) => (await request<{ template: EmailTemplate }>('/email-templates/password-reset', { method: 'PATCH', body: JSON.stringify(input) })).template,
  previewEmailTemplate: async (input: Pick<EmailTemplate, 'subject' | 'htmlBody' | 'textBody'>) => (await request<{ preview: { subject: string; html: string; text: string } }>('/email-templates/password-reset/preview', { method: 'POST', body: JSON.stringify(input) })).preview,
  resetEmailTemplate: async () => (await request<{ template: EmailTemplate }>('/email-templates/password-reset/reset', { method: 'POST', body: '{}' })).template,
}
