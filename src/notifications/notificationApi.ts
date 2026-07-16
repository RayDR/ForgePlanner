export interface NotificationItem { id: string; type: 'plan_invitation' | 'plan_invitation_accepted' | 'plan_invitation_declined'; data: { planId?: string; planName?: string; actorName?: string; accessLevel?: string }; readAt: string | null; createdAt: string }
export interface NotificationPreferences { inAppPlanInvitations: boolean; inAppPlanUpdates: boolean; emailPlanInvitations: boolean }
function csrfToken() { return document.cookie.split('; ').find((item) => item.startsWith('northstar_csrf='))?.split('=').slice(1).join('=') }
async function request<T>(path: string, init: RequestInit = {}) { const token = csrfToken(); const response = await fetch(`/api/notifications${path}`, { ...init, credentials: 'include', headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-csrf-token': decodeURIComponent(token) } : {}), ...init.headers } }); if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(payload?.error?.message ?? 'Notification request failed.') } return response.status === 204 ? undefined as T : response.json() as Promise<T> }
export const notificationApi = {
  list: () => request<{ items: NotificationItem[]; unreadCount: number }>(''),
  markRead: (id: string) => request<void>(`/${id}/read`, { method: 'PATCH', body: '{}' }),
  markAllRead: () => request<void>('/read-all', { method: 'PATCH', body: '{}' }),
  preferences: async () => (await request<{ preferences: NotificationPreferences }>('/preferences')).preferences,
  updatePreferences: async (input: Partial<NotificationPreferences>) => (await request<{ preferences: NotificationPreferences }>('/preferences', { method: 'PATCH', body: JSON.stringify(input) })).preferences,
}
