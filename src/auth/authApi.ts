import type { AccountSession, AuthConfig, SessionPayload } from './authTypes'

function csrfToken() {
  return document.cookie.split('; ').find((item) => item.startsWith('northstar_csrf='))?.split('=').slice(1).join('=')
}

async function request<T>(path: string, init: RequestInit = {}) {
  const token = csrfToken()
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-csrf-token': decodeURIComponent(token) } : {}), ...init.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null
    throw new Error(payload?.error?.message ?? 'The request could not be completed.')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const authApi = {
  config: () => request<AuthConfig>('/auth/config'),
  session: () => request<SessionPayload>('/auth/session'),
  login: (email: string, password: string, recaptchaToken?: string) => request<void>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, recaptchaToken }) }),
  register: (input: { email: string; password: string; displayName: string; acceptTerms: boolean; recaptchaToken?: string }) => request<{ requiresVerification: boolean }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  updatePreferences: (input: { displayName?: string; handle?: string; avatarUrl?: string; bio?: string; locale?: 'es' | 'en'; theme?: 'light' | 'dark'; timezone?: string; searchable?: boolean }) => request('/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  logoutAll: () => request<void>('/auth/logout-all', { method: 'POST' }),
  forgotPassword: (email: string) => request<{ message: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ message: string }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  requestEmailVerification: (email: string) => request<{ message: string }>('/auth/email-verification/request', { method: 'POST', body: JSON.stringify({ email }) }),
  confirmEmailVerification: (token: string) => request<{ message: string }>('/auth/email-verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }),
  sessions: async () => (await request<{ sessions: AccountSession[] }>('/auth/sessions')).sessions,
  revokeSession: (sessionId: string) => request<{ current: boolean }>(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
}
