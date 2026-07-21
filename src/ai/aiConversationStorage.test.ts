import { beforeEach, describe, expect, it } from 'vitest'
import { GUEST_SCOPE, setIdentityScope, userIdentityScope } from '../persistence/identityScope'
import { MemoryStorage } from '../persistence/testStorage'
import { clearAiConversation, emptyAiConversationState, readAiConversation, saveAiConversation } from './aiConversationStorage'

describe('identity-scoped AI conversation session', () => {
  const storage = new MemoryStorage()
  beforeEach(() => { storage.clear(); setIdentityScope(GUEST_SCOPE) })

  it('resumes in the same tab and clears on Start over', () => {
    const state = { ...emptyAiConversationState(), goal: 'Open a business', clarificationCount: 1, messages: [{ id: '1', role: 'assistant' as const, kind: 'text' as const, content: 'What type?' }] }
    saveAiConversation(state, storage)
    expect(readAiConversation(storage)).toMatchObject(state)
    clearAiConversation(storage)
    expect(readAiConversation(storage)).toEqual(emptyAiConversationState())
  })

  it('never mixes guest, User A, and User B conversation history', () => {
    saveAiConversation({ ...emptyAiConversationState(), goal: 'Guest goal' }, storage)
    setIdentityScope(userIdentityScope('11111111-1111-4111-8111-111111111111'))
    expect(readAiConversation(storage).goal).toBe('')
    saveAiConversation({ ...emptyAiConversationState(), goal: 'User A goal' }, storage)
    setIdentityScope(userIdentityScope('22222222-2222-4222-8222-222222222222'))
    expect(readAiConversation(storage).goal).toBe('')
    setIdentityScope(GUEST_SCOPE)
    expect(readAiConversation(storage).goal).toBe('Guest goal')
  })
})
