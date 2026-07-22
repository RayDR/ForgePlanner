import type { AiConversationMessage } from './aiTypes'

export function textConversation(messages: AiConversationMessage[]) {
  const textMessages = messages
    .flatMap((message) => message.kind === 'text' ? [{ role: message.role, content: message.content }] : [])
  return textMessages
    .filter((message, index) => index === 0 || message.role !== textMessages[index - 1].role || message.content !== textMessages[index - 1].content)
    .slice(-8)
}
