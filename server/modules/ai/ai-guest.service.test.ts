import { describe, expect, it } from 'vitest'
import { AiGuestService } from './ai-guest.service.js'
import { MockAiProposalProvider } from './mock-ai-proposal.provider.js'
import { proposalInputSchema } from './ai.schemas.js'
import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import type { CanonicalPlan } from '../../../shared/plan-contract/index.js'
import type { PlanConversionContext } from './ai-provider.js'

class MismatchedSavingsProvider extends MockAiProposalProvider {
  conversionCalls = 0
  override async convertAcceptedProposalToPlan(proposal: AiPlanningProposal, context: PlanConversionContext) {
    this.conversionCalls += 1
    const result = await super.convertAcceptedProposalToPlan(proposal, context)
    const plan = result.plan as CanonicalPlan
    const monthId = plan.project.startDate.slice(0, 7)
    return { ...result, plan: { ...plan, project: { ...plan.project, savingsPlan: { ...plan.project.savingsPlan, enabled: true, mode: 'monthly-target' as const, defaultMonthlyTarget: 500, targetTotal: 250, monthlyEntries: [{ monthId, target: 500, actual: 0 }] } } } }
  }
}

const key = 'a-secure-test-signing-key-with-more-than-32-characters'
const input = () => proposalInputSchema.parse({ clientRequestId: crypto.randomUUID(), goal: 'Improve my career over six months', preferredLanguage: 'en', locale: 'en', constraints: [], nonNegotiables: [], planIntensity: 'balanced' })
function session(service: AiGuestService) { const issued = service.issueSession(); return { claims: service.verifySession(issued.sessionToken, issued.csrfToken, issued.csrfToken), issued } }
describe('signed guest AI proposals', () => {
  it('checks content checksum before provider refinement', async () => { const service = new AiGuestService(new MockAiProposalProvider(), key); const { claims } = session(service); const created = await service.generate(claims, input()); await expect(service.refine(claims, created.operation.id, { clientRequestId: crypto.randomUUID(), expectedRevision: 1, instruction: 'Reduce budget', currentProposal: { ...created.proposal!, title: 'altered' }, signedProposalToken: created.signedProposalToken })).rejects.toMatchObject({ code: 'AI_PROPOSAL_CONFLICT' }) })
  it('rejects a token from another guest session', async () => { const service = new AiGuestService(new MockAiProposalProvider(), key); const a = session(service); const b = session(service); const created = await service.generate(a.claims, input()); await expect(service.refine(b.claims, created.operation.id, { clientRequestId: crypto.randomUUID(), expectedRevision: 1, instruction: 'Reduce budget', currentProposal: created.proposal!, signedProposalToken: created.signedProposalToken })).rejects.toMatchObject({ code: 'AI_PROPOSAL_NOT_FOUND' }) })
  it('rotates revisions and server-validates exact ready revision', async () => { const service = new AiGuestService(new MockAiProposalProvider(), key); const { claims } = session(service); const created = await service.generate(claims, input()); const refined = await service.refine(claims, created.operation.id, { clientRequestId: crypto.randomUUID(), expectedRevision: 1, instruction: 'Reduce budget', currentProposal: created.proposal!, signedProposalToken: created.signedProposalToken }); await expect(service.refine(claims, created.operation.id, { clientRequestId: crypto.randomUUID(), expectedRevision: 2, instruction: 'Again', currentProposal: refined.proposal!, signedProposalToken: created.signedProposalToken })).rejects.toMatchObject({ code: 'AI_PROPOSAL_CONFLICT' }); const ready = service.transition(claims, created.operation.id, { expectedRevision: 2, currentProposal: refined.proposal!, signedProposalToken: refined.signedProposalToken }, 'READY_FOR_CONVERSION'); expect(ready.operation).toMatchObject({ status: 'READY_FOR_CONVERSION', readyProposalRevision: 2 }) })
  it('retains token security after nondurable cache loss', async () => { const first = new AiGuestService(new MockAiProposalProvider(), key); const { claims, issued } = session(first); const created = await first.generate(claims, input()); const restarted = new AiGuestService(new MockAiProposalProvider(), key); const restoredClaims = restarted.verifySession(issued.sessionToken, issued.csrfToken, issued.csrfToken); expect(restarted.transition(restoredClaims, created.operation.id, { expectedRevision: 1, currentProposal: created.proposal!, signedProposalToken: created.signedProposalToken }, 'REJECTED').operation.status).toBe('REJECTED') })
  it('bounds guest operations and refinements', async () => {
    const service = new AiGuestService(new MockAiProposalProvider(), key); const { claims } = session(service)
    await service.generate(claims, input()); await service.generate(claims, input()); await service.generate(claims, input())
    await expect(service.generate(claims, input())).rejects.toMatchObject({ code: 'AI_PROPOSAL_LIMIT_REACHED' })
    const created = await service.generate(claims, { ...input(), clientRequestId: crypto.randomUUID() }).catch(() => null)
    expect(created).toBeNull()
  })
  it('repairs a derived savings total locally without a second provider request', async () => {
    const provider = new MismatchedSavingsProvider(); const service = new AiGuestService(provider, key); const { claims } = session(service)
    const created = await service.generate(claims, input()); const ready = service.transition(claims, created.operation.id, { expectedRevision: 1, currentProposal: created.proposal!, signedProposalToken: created.signedProposalToken }, 'READY_FOR_CONVERSION')
    const result = await service.convert(claims, created.operation.id, { clientRequestId: crypto.randomUUID(), currentProposal: ready.proposal!, signedProposalToken: ready.signedProposalToken })
    expect(result).toMatchObject({ status: 'PLAN_PREVIEW_READY', plan: { project: { savingsPlan: { targetTotal: 500 } } } })
    expect(provider.conversionCalls).toBe(1)
  })
})
