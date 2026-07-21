import type { ForgePlan, ServerTrashPlan } from '../types/forgePlanner'
import { notifySessionInvalid } from '../auth/sessionInvalidation'
import { parsePlanDocument } from '../../shared/plan-contract/index.js'

export interface RemotePlan { id: string; importKey?: string | null; accessLevel?: 'owner' | 'editor' | 'viewer'; sharingEnabled: boolean; name: string; objective: string | null; startDate: string; endDate: string; status: string; snapshot: unknown; revision: number; createdAt: string; updatedAt: string }
export interface RemoteTrashPlan { id: string; sharingEnabled: boolean; name: string; objective: string | null; startDate: string; endDate: string; revision: number; deletedAt: string; purgeAfter: string; restoreEligible: boolean }
export type PlanVersionSource = 'USER' | 'IMPORT' | 'MIGRATION' | 'SYSTEM' | 'TRASH_DELETE' | 'TRASH_RESTORE' | 'VERSION_RESTORE' | 'AI_GENERATION' | 'AI_REFINEMENT' | 'AI_PATCH'
export interface PlanVersionMetadata { id: string; revision: number; schemaVersion: number; source: PlanVersionSource; createdAt: string; checksum: string; snapshotSizeBytes: number; isCurrent: boolean; actorDisplayName?: string | null; restoredFromRevision: number | null }
export interface PlanVersionDetail extends Omit<PlanVersionMetadata, 'isCurrent'> { snapshot: unknown; summary: { title: string; startDate: string; endDate: string; goals: number; milestones: number; activities: number } }

export class PlanRequestError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) { super(message); this.name = 'PlanRequestError'; this.status = status; this.code = code }
}

export class PlanConflictError extends Error {
  currentRevision: number
  constructor(currentRevision: number) { super('This plan was updated from another session.'); this.name = 'PlanConflictError'; this.currentRevision = currentRevision }
}

function csrfToken() { return document.cookie.split('; ').find((item) => item.startsWith('northstar_csrf='))?.split('=').slice(1).join('=') }
async function request<T>(path: string, init: RequestInit = {}) {
  const token = csrfToken()
  const controller = new AbortController()
  const callerSignal = init.signal
  const onCallerAbort = () => controller.abort(callerSignal?.reason)
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
  const timeout = window.setTimeout(() => controller.abort('timeout'), 15_000)
  let response: Response
  try {
    response = await fetch(`/api/plans${path}`, { ...init, signal: controller.signal, credentials: 'include', headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-csrf-token': decodeURIComponent(token) } : {}), ...init.headers } })
  } catch (error) {
    if (controller.signal.aborted && !callerSignal?.aborted) throw new PlanRequestError(0, 'REQUEST_TIMEOUT', 'The request timed out. You can retry safely.')
    throw error
  } finally {
    window.clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; details?: { current?: RemotePlan; currentRevision?: number } } } | null
    if (response.status === 401) notifySessionInvalid()
    if (response.status === 409 && payload?.error?.code === 'PLAN_VERSION_CONFLICT') throw new PlanConflictError(payload.error.details?.currentRevision ?? 0)
    throw new PlanRequestError(response.status, payload?.error?.code ?? 'PLAN_REQUEST_FAILED', payload?.error?.message ?? 'Plan request failed.')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function payload(plan: ForgePlan) {
  return { status: 'active', snapshot: plan.snapshot }
}

function fromRemote(remote: RemotePlan, remoteLinkId?: string): ForgePlan {
  const result = parsePlanDocument(remote.snapshot)
  if (!result.success) throw new PlanRequestError(500, 'CORRUPTED_PLAN_SNAPSHOT', 'The stored plan failed contract validation.')
  const snapshot = result.plan
  return { id: remote.importKey ?? remote.id, remoteId: remote.id, remoteAccess: remote.accessLevel ?? 'owner', remoteRevision: remote.revision, remoteSharingEnabled: remote.sharingEnabled, remoteLinkId, title: snapshot.project.name, description: snapshot.project.objective, startDate: snapshot.project.startDate, endDate: snapshot.project.endDate, planningMode: snapshot.metadata.planningMode ?? 'auto', templateKey: snapshot.metadata.templateKey, categories: snapshot.project.categoryDefinitions.map((item) => item.key), monthlyViewPreference: result.extractedUiState?.monthlyViewPreference ?? 'list', snapshot, createdAt: remote.createdAt, updatedAt: remote.updatedAt }
}

function fromRemoteTrash(remote: RemoteTrashPlan): ServerTrashPlan {
  if (!remote.deletedAt || !remote.purgeAfter || typeof remote.restoreEligible !== 'boolean') throw new PlanRequestError(500, 'INVALID_TRASH_STATE', 'The deleted plan has incomplete retention metadata.')
  return { id: remote.id, remoteId: remote.id, remoteRevision: remote.revision, remoteSharingEnabled: remote.sharingEnabled, title: remote.name, description: remote.objective ?? '', startDate: remote.startDate, endDate: remote.endDate, deletedAt: remote.deletedAt, purgeAfter: remote.purgeAfter, restoreEligible: remote.restoreEligible }
}

export const planApi = {
  list: async (signal?: AbortSignal) => (await request<{ plans: RemotePlan[] }>('', { signal })).plans.map((plan) => fromRemote(plan)),
  trash: async (signal?: AbortSignal, page = 1, limit = 50) => {
    const result = await request<{ plans: RemoteTrashPlan[]; total: number; page: number; limit: number }>(`/trash?page=${page}&limit=${limit}`, { signal })
    return { ...result, plans: result.plans.map(fromRemoteTrash) }
  },
  create: async (plan: ForgePlan, clientMutationId: string, signal?: AbortSignal) => {
    const result = await request<{ plan: RemotePlan; created: boolean }>('', { method: 'POST', body: JSON.stringify({ ...payload(plan), clientMutationId }), signal })
    return { plan: fromRemote(result.plan), created: result.created }
  },
  get: async (remoteId: string) => fromRemote((await request<{ plan: RemotePlan }>(`/${remoteId}`)).plan),
  import: async (plans: ForgePlan[]) => (await request<{ plans: RemotePlan[] }>('/import', { method: 'POST', body: JSON.stringify({ plans: plans.map((plan) => ({ ...payload(plan), importKey: plan.id })) }) })).plans,
  update: async (plan: ForgePlan, expectedRevision = plan.remoteRevision ?? 1, signal?: AbortSignal) => fromRemote((await request<{ plan: RemotePlan }>(plan.remoteLinkId ? `/link/${plan.remoteLinkId}` : `/${plan.remoteId}`, { method: 'PATCH', body: JSON.stringify({ ...payload(plan), expectedRevision }), signal })).plan, plan.remoteLinkId),
  openSharedLink: async (linkId: string) => fromRemote((await request<{ plan: RemotePlan }>(`/link/${linkId}`)).plan, linkId),
  remove: async (remoteId: string, expectedRevision: number) => {
    const result = await request<{ plan: RemoteTrashPlan; deleted: boolean }>(`/${remoteId}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision }) })
    return { plan: fromRemoteTrash(result.plan), deleted: result.deleted }
  },
  restore: async (remoteId: string, expectedRevision: number) => {
    const result = await request<{ plan: RemotePlan; restored: boolean }>(`/${remoteId}/restore`, { method: 'POST', body: JSON.stringify({ expectedRevision }) })
    return { plan: fromRemote(result.plan), restored: result.restored }
  },
  purge: (remoteId: string, expectedRevision: number) => request<{ deleted: boolean }>(`/${remoteId}/permanent`, { method: 'DELETE', body: JSON.stringify({ expectedRevision }) }),
  versions: (remoteId: string, page = 1, limit = 25, signal?: AbortSignal) => request<{ versions: PlanVersionMetadata[]; total: number; page: number; limit: number }>(`/${remoteId}/versions?page=${page}&limit=${limit}`, { signal }),
  version: (remoteId: string, revision: number, signal?: AbortSignal) => request<{ version: PlanVersionDetail }>(`/${remoteId}/versions/${revision}`, { signal }).then((result) => result.version),
  restoreVersion: async (remoteId: string, revision: number, expectedRevision: number, signal?: AbortSignal) => {
    const result = await request<{ plan: RemotePlan; restoredFromRevision: number; createdRevision: number }>(`/${remoteId}/versions/${revision}/restore`, { method: 'POST', body: JSON.stringify({ expectedRevision }), signal })
    return { ...result, plan: fromRemote(result.plan) }
  },
}
