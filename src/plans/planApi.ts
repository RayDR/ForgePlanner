import type { ForgePlan } from '../types/forgePlanner'

export interface RemotePlan { id: string; importKey: string | null; accessLevel?: 'owner' | 'editor' | 'viewer'; sharingEnabled: boolean; name: string; objective: string | null; startDate: string; endDate: string; status: string; snapshot: Record<string, unknown>; revision: number; createdAt: string; updatedAt: string }

export class PlanConflictError extends Error {
  current: ForgePlan
  currentRevision: number
  constructor(current: ForgePlan, currentRevision: number) { super('This plan was updated from another session.'); this.name = 'PlanConflictError'; this.current = current; this.currentRevision = currentRevision }
}

function csrfToken() { return document.cookie.split('; ').find((item) => item.startsWith('northstar_csrf='))?.split('=').slice(1).join('=') }
async function request<T>(path: string, init: RequestInit = {}) {
  const token = csrfToken(); const response = await fetch(`/api/plans${path}`, { ...init, credentials: 'include', headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-csrf-token': decodeURIComponent(token) } : {}), ...init.headers } })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; details?: { current?: RemotePlan; currentRevision?: number } } } | null
    if (response.status === 409 && payload?.error?.code === 'PLAN_VERSION_CONFLICT' && payload.error.details?.current) throw new PlanConflictError(fromRemote(payload.error.details.current), payload.error.details.currentRevision ?? payload.error.details.current.revision)
    throw new Error(payload?.error?.message ?? 'Plan request failed.')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function payload(plan: ForgePlan) {
  return { importKey: plan.id, name: plan.title, objective: plan.description, startDate: plan.startDate, endDate: plan.endDate, status: 'active', snapshot: { ...plan.snapshot, _forge: { planningMode: plan.planningMode, templateKey: plan.templateKey, categories: plan.categories, monthlyViewPreference: plan.monthlyViewPreference } } }
}

function fromRemote(remote: RemotePlan, remoteLinkId?: string): ForgePlan {
  const metadata = remote.snapshot._forge as Partial<ForgePlan> | undefined
  const { _forge: _ignored, ...snapshot } = remote.snapshot
  void _ignored
  return { id: remote.importKey ?? remote.id, remoteId: remote.id, remoteAccess: remote.accessLevel ?? 'owner', remoteRevision: remote.revision, remoteSharingEnabled: remote.sharingEnabled, remoteLinkId, title: remote.name, description: remote.objective ?? '', startDate: remote.startDate, endDate: remote.endDate, planningMode: metadata?.planningMode ?? 'auto', templateKey: metadata?.templateKey, categories: metadata?.categories ?? [], monthlyViewPreference: metadata?.monthlyViewPreference ?? 'list', snapshot: snapshot as unknown as ForgePlan['snapshot'], createdAt: remote.createdAt, updatedAt: remote.updatedAt }
}

export const planApi = {
  list: async (signal?: AbortSignal) => (await request<{ plans: RemotePlan[] }>('', { signal })).plans.map((plan) => fromRemote(plan)),
  get: async (remoteId: string) => fromRemote((await request<{ plan: RemotePlan }>(`/${remoteId}`)).plan),
  import: async (plans: ForgePlan[]) => (await request<{ plans: RemotePlan[] }>('/import', { method: 'POST', body: JSON.stringify({ plans: plans.map(payload) }) })).plans,
  update: async (plan: ForgePlan, expectedRevision = plan.remoteRevision ?? 1, signal?: AbortSignal) => fromRemote((await request<{ plan: RemotePlan }>(plan.remoteLinkId ? `/link/${plan.remoteLinkId}` : `/${plan.remoteId}`, { method: 'PATCH', body: JSON.stringify({ ...payload(plan), expectedRevision }), signal })).plan, plan.remoteLinkId),
  openSharedLink: async (linkId: string) => fromRemote((await request<{ plan: RemotePlan }>(`/link/${linkId}`)).plan, linkId),
  remove: (remoteId: string) => request<void>(`/${remoteId}`, { method: 'DELETE' }),
  restore: async (remoteId: string) => fromRemote((await request<{ plan: RemotePlan }>(`/${remoteId}/restore`, { method: 'POST', body: '{}' })).plan),
  purge: (remoteId: string) => request<void>(`/${remoteId}/permanent`, { method: 'DELETE' }),
}
