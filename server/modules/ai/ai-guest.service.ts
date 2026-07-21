import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { ApiError } from '../../http/errors.js'
import { parsePlanningTurn, type AiPlanningProposal, type PlanningTurn } from '../../../shared/ai-proposal-contract/index.js'
import { assertSafeAiInput } from './ai-input-safety.js'
import { fingerprint, prepareProposal } from './ai-integrity.js'
import { detectProposalLanguage, selectProposalLanguage } from './ai-language.js'
import type { AiProposalProvider } from './ai-provider.js'
import type { PlanningInput } from './ai.schemas.js'

export const AI_GUEST_COOKIE = 'northstar_ai_guest'
export const AI_GUEST_CSRF_COOKIE = 'northstar_ai_csrf'
const SESSION_MS = 4 * 60 * 60 * 1000
type SessionClaims = { v: 1; sid: string; csrfHash: string; exp: number }
type ProposalClaims = { v: 1; sessionHash: string; operationId: string; revision: number; checksum: string; language: 'EN' | 'ES'; status: 'PROPOSED' | 'READY_FOR_CONVERSION' | 'REJECTED'; exp: number; readyRevision?: number; readyChecksum?: string }
type CacheEntry = { fingerprint: string; expiresAt: number; response?: unknown; pending?: Promise<unknown> }
type GuestGenerationResponse = {
  turn: PlanningTurn
  operation: { id: string; status: 'PROPOSED'; selectedLanguage: 'EN' | 'ES'; detectedLanguage: 'EN' | 'ES' | 'MIXED' | 'UNKNOWN'; currentProposalRevision: number; readyProposalRevision: null; refinementCount: number; expiresAt: string }
  proposal: AiPlanningProposal
  signedProposalToken: string
}

function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
function decode<T>(value: string) { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T }

export class AiGuestService {
  private cache = new Map<string, CacheEntry>()
  /** Bounded, process-local accounting for guest proposal sessions. This is
   * deliberately not a durability or authorization boundary; signed tokens
   * and checksums remain authoritative. */
  private operationIds = new Map<string, Set<string>>()
  private sessionExpirations = new Map<string, number>()
  constructor(private provider: AiProposalProvider, private key: string, private now = () => Date.now()) { if (key.length < 32) throw new Error('AI_GUEST_SESSION_SIGNING_KEY must contain at least 32 characters.') }

  issueSession() {
    const csrf = randomUUID(); const claims: SessionClaims = { v: 1, sid: randomUUID(), csrfHash: this.hash(csrf), exp: this.now() + SESSION_MS }
    return { sessionToken: this.sign(claims), csrfToken: csrf, expiresAt: new Date(claims.exp).toISOString() }
  }

  verifySession(token: string | undefined, csrfCookie: string | undefined, csrfHeader: string | undefined) {
    const claims = this.verify<SessionClaims>(token, 'AI_GUEST_SESSION_INVALID')
    if (claims.v !== 1 || claims.exp <= this.now()) throw new ApiError(401, 'AI_GUEST_SESSION_EXPIRED', 'The guest proposal session has expired.')
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader || this.hash(csrfHeader) !== claims.csrfHash) throw new ApiError(403, 'INVALID_CSRF_TOKEN', 'The security token is invalid.')
    return claims
  }

  async generate(session: SessionClaims, input: PlanningInput, signal?: AbortSignal): Promise<GuestGenerationResponse> {
    assertSafeAiInput([input.goal, input.additionalContext ?? '', ...input.constraints, ...input.nonNegotiables, ...input.conversation.map((item) => item.content)]); this.cleanup()
    const sessionHash = this.hash(session.sid); this.sessionExpirations.set(sessionHash, session.exp); const cacheKey = `${sessionHash}:generate:${input.clientRequestId}`; const requestFingerprint = fingerprint({ ...input, clientRequestId: undefined })
    const operations = this.operationIds.get(sessionHash) ?? new Set<string>()
    const existingGeneration = this.cache.get(cacheKey)
    if (!existingGeneration && operations.size >= 3) throw new ApiError(429, 'AI_PROPOSAL_LIMIT_REACHED', 'The guest proposal limit has been reached.')
    return this.cached<GuestGenerationResponse>(cacheKey, requestFingerprint, async () => {
      const detected = detectProposalLanguage(`${input.goal} ${input.additionalContext ?? ''}`); const language = selectProposalLanguage({ preferred: input.preferredLanguage, detected, fallback: input.locale })
      const result = await this.provider.planningTurn(input, { language, correlationId: input.clientRequestId, signal: signal ?? new AbortController().signal }).catch((error) => { throw this.providerError(error) })
      let turn
      try { turn = parsePlanningTurn(result.turn) } catch { throw new ApiError(502, 'AI_PROPOSAL_INVALID_OUTPUT', 'The proposal provider returned invalid content.') }
      if (turn.action === 'ASK') return { turn } as unknown as GuestGenerationResponse
      const operationId = randomUUID(); operations.add(operationId); this.operationIds.set(sessionHash, operations)
      let prepared
      try { prepared = prepareProposal(turn.proposal) } catch { throw new ApiError(502, 'AI_PROPOSAL_INVALID_OUTPUT', 'The proposal provider returned invalid content.') }
      const claims: ProposalClaims = { v: 1, sessionHash, operationId, revision: 1, checksum: prepared.checksum, language, status: 'PROPOSED', exp: session.exp }
      return { turn, operation: { id: operationId, status: 'PROPOSED', selectedLanguage: language, detectedLanguage: detected, currentProposalRevision: 1, readyProposalRevision: null, refinementCount: 0, expiresAt: new Date(session.exp).toISOString() }, proposal: prepared.proposal, signedProposalToken: this.sign(claims) }
    })
  }

  async refine(session: SessionClaims, operationId: string, input: { clientRequestId: string; expectedRevision: number; instruction: string; currentProposal: AiPlanningProposal; signedProposalToken: string }, signal?: AbortSignal) {
    assertSafeAiInput([input.instruction]); const claims = this.assertProposal(session, operationId, input.expectedRevision, input.currentProposal, input.signedProposalToken, 'PROPOSED'); this.cleanup()
    if (claims.revision >= 9) throw new ApiError(429, 'AI_PROPOSAL_REFINEMENT_LIMIT', 'The guest refinement limit has been reached.')
    const key = `${claims.sessionHash}:${operationId}:refine:${input.clientRequestId}:${input.expectedRevision}`; const requestFingerprint = fingerprint({ expectedRevision: input.expectedRevision, instruction: input.instruction, checksum: claims.checksum })
    return this.cached(key, requestFingerprint, async () => {
      const result = await this.provider.refineProposal(input.currentProposal, input.instruction, { language: claims.language, correlationId: input.clientRequestId, signal: signal ?? new AbortController().signal }).catch((error) => { throw this.providerError(error) })
      let turn
      try { turn = parsePlanningTurn(result.turn) } catch { throw new ApiError(502, 'AI_PROPOSAL_INVALID_OUTPUT', 'The proposal provider returned invalid content.') }
      if (turn.action !== 'PROPOSE') throw new ApiError(502, 'AI_PROPOSAL_INVALID_OUTPUT', 'A refinement must return a proposal.')
      let prepared
      try { prepared = prepareProposal(turn.proposal) } catch { throw new ApiError(502, 'AI_PROPOSAL_INVALID_OUTPUT', 'The proposal provider returned invalid content.') }
      const next: ProposalClaims = { ...claims, revision: claims.revision + 1, checksum: prepared.checksum, status: 'PROPOSED' }
      return { turn, operation: { id: operationId, status: next.status, selectedLanguage: next.language, currentProposalRevision: next.revision, readyProposalRevision: null, expiresAt: new Date(next.exp).toISOString() }, proposal: prepared.proposal, signedProposalToken: this.sign(next) }
    })
  }

  transition(session: SessionClaims, operationId: string, input: { expectedRevision: number; currentProposal: AiPlanningProposal; signedProposalToken: string }, target: 'READY_FOR_CONVERSION' | 'REJECTED') {
    const claims = this.assertProposal(session, operationId, input.expectedRevision, input.currentProposal, input.signedProposalToken, target)
    const next: ProposalClaims = { ...claims, status: target, ...(target === 'READY_FOR_CONVERSION' ? { readyRevision: claims.revision, readyChecksum: claims.checksum } : {}) }
    return { turn: { action: 'PROPOSE' as const, proposal: input.currentProposal, language: next.language.toLowerCase() as 'en' | 'es' }, operation: { id: operationId, status: target, selectedLanguage: next.language, currentProposalRevision: next.revision, readyProposalRevision: next.readyRevision ?? null, expiresAt: new Date(next.exp).toISOString() }, proposal: input.currentProposal, signedProposalToken: this.sign(next) }
  }

  private assertProposal(session: SessionClaims, operationId: string, revision: number, proposal: AiPlanningProposal, token: string, target: 'PROPOSED' | 'READY_FOR_CONVERSION' | 'REJECTED') {
    const claims = this.verify<ProposalClaims>(token, 'AI_PROPOSAL_FORBIDDEN'); const prepared = prepareProposal(proposal)
    if (claims.v !== 1 || claims.exp <= this.now()) throw new ApiError(410, 'AI_PROPOSAL_EXPIRED', 'This proposal has expired.')
    if (claims.sessionHash !== this.hash(session.sid) || claims.operationId !== operationId) throw new ApiError(404, 'AI_PROPOSAL_NOT_FOUND', 'Proposal not found.')
    if (claims.revision !== revision || claims.checksum !== prepared.checksum) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'The proposal token or content is stale.')
    if (target === 'PROPOSED' && claims.status !== 'PROPOSED') throw new ApiError(409, 'AI_PROPOSAL_INVALID_STATE', 'This proposal cannot be refined.')
    if (target !== 'PROPOSED' && claims.status !== 'PROPOSED' && claims.status !== target) throw new ApiError(409, 'AI_PROPOSAL_INVALID_STATE', 'This proposal cannot change to that state.')
    return claims
  }

  private async cached<T>(key: string, requestFingerprint: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.cache.get(key)
    if (existing) { if (existing.fingerprint !== requestFingerprint) throw new ApiError(409, 'AI_PROPOSAL_CONFLICT', 'This request identifier was already used with different input.'); if (existing.response) return existing.response as T; if (existing.pending) return existing.pending as Promise<T> }
    const pending = operation().then((response) => { this.cache.set(key, { fingerprint: requestFingerprint, expiresAt: this.now() + SESSION_MS, response }); return response }).catch((error) => { this.cache.delete(key); throw error })
    this.cache.set(key, { fingerprint: requestFingerprint, expiresAt: this.now() + SESSION_MS, pending })
    return pending
  }
  private cleanup() {
    const now = this.now()
    for (const [key, value] of this.cache) if (value.expiresAt <= now) this.cache.delete(key)
    for (const [sessionHash, expiresAt] of this.sessionExpirations) if (expiresAt <= now) { this.sessionExpirations.delete(sessionHash); this.operationIds.delete(sessionHash) }
    while (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!)
  }
  private sign(claims: object) { const payload = encode(claims); return `${payload}.${createHmac('sha256', this.key).update(payload).digest('base64url')}` }
  private verify<T>(token: string | undefined, code: string): T { if (!token) throw new ApiError(401, code, 'The signed guest session is invalid.'); const [payload, signature] = token.split('.'); if (!payload || !signature) throw new ApiError(401, code, 'The signed guest session is invalid.'); const expected = createHmac('sha256', this.key).update(payload).digest(); const received = Buffer.from(signature, 'base64url'); if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new ApiError(401, code, 'The signed guest session is invalid.'); try { return decode<T>(payload) } catch { throw new ApiError(401, code, 'The signed guest session is invalid.') } }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex') }
  private providerError(error: unknown) { return error instanceof DOMException && error.name === 'AbortError' ? new ApiError(504, 'AI_PROVIDER_TIMEOUT', 'The proposal provider timed out.') : new ApiError(503, 'AI_PROVIDER_UNAVAILABLE', 'The proposal provider is unavailable.') }
}
