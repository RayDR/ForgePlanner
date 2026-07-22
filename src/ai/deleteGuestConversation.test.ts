import { beforeEach, describe, expect, it } from 'vitest'
import { GUEST_SCOPE, setIdentityScope } from '../persistence/identityScope'
import { readTemporarySessionState, saveTemporarySessionState } from '../persistence/temporarySessionStorage'
import { MemoryStorage } from '../persistence/testStorage'
import { readAiConversation, saveAiConversation } from './aiConversationStorage'
import { deleteGuestConversation } from './deleteGuestConversation'
import { readGuestProposals, saveGuestProposal } from './guestProposalStorage'
import type { GuestProposalRecord } from './aiTypes'

const proposal = { proposalSchemaVersion: 1 as const, title: 'Plan', summary: 'Summary', primaryObjective: 'Objective', recommendedDuration: '3 months', recommendedStartDate: null, recommendedTargetDate: null, planningApproach: 'Phases', phases: [{ title: 'One', purpose: 'Start', suggestedTimeframe: 'Month 1', outcomes: [], recommendedActions: [], dependencies: [], risks: [] }], assumptions: [], risks: [], warnings: [], successIndicators: [], weeklyCommitment: '5 hours', budgetGuidance: null, clarifyingQuestions: [] }

describe('guest conversation deletion', () => {
  const storage = new MemoryStorage()
  beforeEach(() => { storage.clear(); setIdentityScope(GUEST_SCOPE) })

  it('clears the active proposal, signed token and conversation but preserves a generated plan', () => {
    const operationId = crypto.randomUUID()
    const record: GuestProposalRecord = { operation: { id: operationId, status: 'PROPOSED', selectedLanguage: 'EN', currentProposalRevision: 1, readyProposalRevision: null, expiresAt: new Date(Date.now() + 60_000).toISOString() }, proposal, signedProposalToken: 'signed-proposal-token-long-enough' }
    saveGuestProposal(record, storage)
    saveAiConversation({ goal: 'Goal', context: { scope: 'balanced', durationMonths: null, complexity: 'moderate', detail: 'detailed', hoursPerWeek: null, financialMode: 'none', financialAmount: null, currency: 'USD' }, messages: [{ id: 'proposal', role: 'assistant', kind: 'proposal', proposal, revision: 1, operationId }], clarificationCount: 0, conversationLanguage: 'en', activeOperationId: operationId }, storage)
    saveTemporarySessionState([{ id: `ai-session-${operationId}`, snapshot: { schemaVersion: 8 } }], { scope: GUEST_SCOPE, namespace: 'plans', storage })

    expect(deleteGuestConversation(operationId, storage)).toMatchObject({ activeDeleted: true, proposals: [] })
    expect(readGuestProposals(storage)).toEqual([])
    expect(readAiConversation(storage).activeOperationId).toBeNull()
    expect(readTemporarySessionState({ scope: GUEST_SCOPE, namespace: 'plans', storage })).toHaveLength(1)
  })
})
