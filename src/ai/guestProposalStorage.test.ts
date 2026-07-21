import { beforeEach, describe, expect, it } from 'vitest'
import { GUEST_SCOPE } from '../persistence/identityScope'
import { readTemporarySessionState, saveTemporarySessionState } from '../persistence/temporarySessionStorage'
import { MemoryStorage } from '../persistence/testStorage'
import { readGuestProposals, saveGuestProposal } from './guestProposalStorage'
import type { GuestProposalRecord } from './aiTypes'

const proposal = {
  proposalSchemaVersion: 1 as const, title: 'Career plan', summary: 'A focused plan.', primaryObjective: 'Grow professionally.', recommendedDuration: 'Three months', recommendedStartDate: null, recommendedTargetDate: null, planningApproach: 'Work in phases.',
  phases: [{ title: 'Prepare', purpose: 'Set a baseline.', suggestedTimeframe: 'Month 1', outcomes: ['Baseline'], recommendedActions: ['Review'], dependencies: [], risks: [] }], assumptions: [], risks: [], warnings: [], successIndicators: ['Review complete'], weeklyCommitment: 'Five hours', budgetGuidance: null, clarifyingQuestions: [],
}
const record = (): GuestProposalRecord => ({
  operation: { id: crypto.randomUUID(), status: 'PROPOSED', selectedLanguage: 'EN', currentProposalRevision: 1, readyProposalRevision: null, expiresAt: new Date(Date.now() + 60_000).toISOString() },
  proposal,
  signedProposalToken: 'signed-proposal-token-that-is-long-enough-for-storage',
})

describe('guest proposal temporary namespace', () => {
  const storage = new MemoryStorage()
  beforeEach(() => storage.clear())

  it('does not overwrite temporary plan state', () => {
    saveTemporarySessionState({ plan: 1 }, { scope: GUEST_SCOPE, storage, namespace: 'plans' })
    saveTemporarySessionState({ proposal: 2 }, { scope: GUEST_SCOPE, storage, namespace: 'ai-proposals' })
    expect(readTemporarySessionState({ scope: GUEST_SCOPE, storage, namespace: 'plans' })).toEqual({ plan: 1 })
    expect(readTemporarySessionState({ scope: GUEST_SCOPE, storage, namespace: 'ai-proposals' })).toEqual({ proposal: 2 })
  })

  it('resumes the signed proposal after leaving and reopening in the same tab session', () => {
    const saved = record()
    saveGuestProposal(saved, storage)
    expect(readGuestProposals(storage)).toEqual([saved])
    expect(readGuestProposals(new MemoryStorage())).toEqual([])
  })
})
