import { defaultAiComposerContext, type AiComposerContext } from './proposalInput'

export function hasSelectedPlanningContext(context: AiComposerContext) {
  return JSON.stringify(context) !== JSON.stringify(defaultAiComposerContext)
}

export function hasMeaningfulAiWorkspaceState(input: {
  goal: string
  instruction: string
  context: AiComposerContext
  hasProposal: boolean
}) {
  return Boolean(input.goal.trim() || input.instruction.trim() || input.hasProposal || hasSelectedPlanningContext(input.context))
}

export function emptyAiWorkspaceState() {
  return {
    goal: '',
    instruction: '',
    context: { ...defaultAiComposerContext },
    current: null,
  }
}
