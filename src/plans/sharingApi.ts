export interface PublicProfile { id: string; displayName: string; code: string; avatarUrl: string | null }
export interface PlanAccessRecord { id: string; accessLevel: 'viewer' | 'editor'; status: 'pending' | 'accepted' | 'declined' | 'revoked'; createdAt: string; profile: PublicProfile | null }
export interface PlanShareLink { id: string; accessLevel: 'viewer' | 'editor'; enabled: boolean }
export interface PlanAccessState { sharingEnabled: boolean; link: PlanShareLink | null; records: PlanAccessRecord[] }
export interface PlanInvitation { id: string; accessLevel: 'viewer' | 'editor'; createdAt: string; plan: { id: string; name: string; objective: string | null }; grantedBy: PublicProfile | null }

function csrfToken() { return document.cookie.split('; ').find((item) => item.startsWith('northstar_csrf='))?.split('=').slice(1).join('=') }
async function request<T>(path: string, init: RequestInit = {}) {
  const token = csrfToken()
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-csrf-token': decodeURIComponent(token) } : {}), ...init.headers } })
  if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(payload?.error?.message ?? 'Sharing request failed.') }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const sharingApi = {
  search: async (code: string) => (await request<{ profile: PublicProfile | null }>(`/profiles/search?code=${encodeURIComponent(code)}`)).profile,
  invitations: async () => (await request<{ invitations: PlanInvitation[] }>('/plans/invitations')).invitations,
  respond: (accessId: string, response: 'accepted' | 'declined') => request(`/plans/access/${accessId}/respond`, { method: 'PATCH', body: JSON.stringify({ response }) }),
  list: async (planId: string) => (await request<{ access: PlanAccessState }>(`/plans/${planId}/access`)).access,
  setSharingEnabled: async (planId: string, enabled: boolean) => (await request<{ state: { enabled: boolean } }>(`/plans/${planId}/access-state`, { method: 'PATCH', body: JSON.stringify({ enabled }) })).state,
  createLink: async (planId: string, accessLevel: 'viewer' | 'editor') => (await request<{ link: PlanShareLink }>(`/plans/${planId}/share-link`, { method: 'POST', body: JSON.stringify({ accessLevel }) })).link,
  updateLink: async (planId: string, input: { enabled?: boolean; accessLevel?: 'viewer' | 'editor' }) => (await request<{ link: PlanShareLink }>(`/plans/${planId}/share-link`, { method: 'PATCH', body: JSON.stringify(input) })).link,
  deleteLink: (planId: string) => request<void>(`/plans/${planId}/share-link`, { method: 'DELETE' }),
  grant: (planId: string, profileCode: string, accessLevel: 'viewer' | 'editor') => request(`/plans/${planId}/access`, { method: 'POST', body: JSON.stringify({ profileCode, accessLevel }) }),
  update: (planId: string, accessId: string, accessLevel: 'viewer' | 'editor') => request(`/plans/${planId}/access/${accessId}`, { method: 'PATCH', body: JSON.stringify({ accessLevel }) }),
  revoke: (planId: string, accessId: string) => request(`/plans/${planId}/access/${accessId}`, { method: 'DELETE' }),
}
