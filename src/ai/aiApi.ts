import type { AiPlanningProposal } from '../../shared/ai-proposal-contract/index.js'
import type { AiOperationDto, AiPlanningTurnResult, AiProposalResult } from './aiTypes'

export class AiRequestError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'AiRequestError'
    this.status = status
    this.code = code
  }
}

function cookie(name: string) {
  if (typeof document === 'undefined') return undefined
  return document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))?.split('=').slice(1).join('=')
}

async function request<T>(path: string, init: RequestInit = {}) {
  const csrf = cookie('northstar_csrf')
  const guestCsrf = cookie('northstar_ai_csrf')
  const response = await fetch(`/api/ai${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
      ...(guestCsrf ? { 'x-ai-guest-csrf': decodeURIComponent(guestCsrf) } : {}),
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
  if (!response.ok) throw new AiRequestError(response.status, body?.error?.code ?? 'AI_REQUEST_FAILED', body?.error?.message ?? 'AI proposal request failed.')
  return body as T
}

export const aiApi = {
  guestSession: (signal?: AbortSignal) => request<{ expiresAt: string; csrfToken: string }>('/guest/session', { method: 'POST', signal }),
  generate: (input: object, guest: boolean, signal?: AbortSignal) => request<AiPlanningTurnResult>(guest ? '/guest/plan-proposals' : '/plan-proposals', { method: 'POST', body: JSON.stringify(input), signal }),
  refine: (id: string, input: { clientRequestId: string; expectedRevision: number; instruction: string; currentProposal?: AiPlanningProposal; signedProposalToken?: string }, guest: boolean, signal?: AbortSignal) => request<AiProposalResult>(guest ? `/guest/plan-proposals/${id}/refine` : `/plan-proposals/${id}/refine`, { method: 'POST', body: JSON.stringify(input), signal }),
  transition: (id: string, input: { expectedRevision: number; clientRequestId?: string; currentProposal?: AiPlanningProposal; signedProposalToken?: string }, target: 'ready' | 'reject', guest: boolean) => request<AiProposalResult>(guest ? `/guest/plan-proposals/${id}/${target}` : `/plan-proposals/${id}/${target}`, { method: 'POST', body: JSON.stringify(input) }),
  list: () => request<{ operations: AiOperationDto[]; total: number }>('/plan-proposals?page=1&limit=20'),
  get: (id: string, signal?: AbortSignal) => request<AiProposalResult>(`/plan-proposals/${id}`, { signal }),
  remove: (id: string) => request<{ deleted: true }>(`/plan-proposals/${id}`, { method: 'DELETE' }),
}
