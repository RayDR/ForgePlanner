import { clearTemporarySessionState, readTemporarySessionState, saveTemporarySessionState } from '../persistence/temporarySessionStorage'
import type { AiConversationMessage } from './aiTypes'
import { defaultAiComposerContext, type AiComposerContext } from './proposalInput'

export interface AiConversationState {
  goal: string
  context: AiComposerContext
  messages: AiConversationMessage[]
  clarificationCount: number
  conversationLanguage: 'en' | 'es' | null
  activeOperationId: string | null
}

const options = (storage?: Storage) => ({ namespace: 'ai-conversation' as const, storage })

export function emptyAiConversationState(): AiConversationState {
  return { goal: '', context: { ...defaultAiComposerContext }, messages: [], clarificationCount: 0, conversationLanguage: null, activeOperationId: null }
}

export function readAiConversation(storage?: Storage): AiConversationState {
  const value = readTemporarySessionState<AiConversationState>(options(storage))
  if (!value || typeof value.goal !== 'string' || !Array.isArray(value.messages)) return emptyAiConversationState()
  return { ...emptyAiConversationState(), ...value, context: { ...defaultAiComposerContext, ...value.context }, messages: value.messages.slice(-20), clarificationCount: Math.min(3, Math.max(0, value.clarificationCount ?? 0)) }
}

export function saveAiConversation(value: AiConversationState, storage?: Storage) {
  saveTemporarySessionState({ ...value, messages: value.messages.slice(-20) }, { ...options(storage), ttlMs: 4 * 60 * 60 * 1000, maxBytes: 900 * 1024 })
}

export function clearAiConversation(storage?: Storage) {
  clearTemporarySessionState(options(storage))
}
