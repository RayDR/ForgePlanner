import { clearAiConversation, readAiConversation, saveAiConversation } from './aiConversationStorage'
import { removeGuestProposal } from './guestProposalStorage'

export function deleteGuestConversation(operationId: string, storage?: Storage) {
  const conversation = readAiConversation(storage)
  const activeDeleted = conversation.activeOperationId === operationId
  const proposals = removeGuestProposal(operationId, storage)
  if (activeDeleted) clearAiConversation(storage)
  else saveAiConversation({ ...conversation, messages: conversation.messages.filter((message) => message.kind !== 'proposal' || message.operationId !== operationId) }, storage)
  return { proposals, activeDeleted }
}
