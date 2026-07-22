import { describe, expect, it } from 'vitest'
import { textConversation } from './aiConversationBoundary'
import type { AiConversationMessage } from './aiTypes'

describe('AI conversation request boundary', () => {
  it('removes consecutive retry duplicates and sends at most eight text messages', () => {
    const messages: AiConversationMessage[] = [
      { id: '1', role: 'user', kind: 'text', content: 'Goal' },
      { id: '2', role: 'assistant', kind: 'text', content: 'Question one?' },
      { id: '3', role: 'user', kind: 'text', content: 'Answer one' },
      { id: '4', role: 'assistant', kind: 'text', content: 'Question two?' },
      { id: '5', role: 'user', kind: 'text', content: 'Answer two' },
      { id: '6', role: 'assistant', kind: 'text', content: 'Question three?' },
      { id: '7', role: 'user', kind: 'text', content: 'Final answer' },
      { id: '8', role: 'user', kind: 'text', content: 'Final answer' },
      { id: '9', role: 'user', kind: 'text', content: 'Final answer' },
      { id: '10', role: 'assistant', kind: 'text', content: 'Follow-up' },
      { id: 'proposal', role: 'assistant', kind: 'proposal', operationId: 'op', revision: 1, proposal: {} as never },
    ]

    const result = textConversation(messages)
    expect(result).toHaveLength(8)
    expect(result.filter((message) => message.content === 'Final answer')).toHaveLength(1)
    expect(result.at(-1)).toEqual({ role: 'assistant', content: 'Follow-up' })
  })
})
