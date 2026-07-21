import { describe, expect, it } from 'vitest'
import { defaultAiComposerContext } from './proposalInput'
import { emptyAiWorkspaceState, hasMeaningfulAiWorkspaceState, hasSelectedPlanningContext } from './aiWorkspaceState'

describe('AI workspace start-over guard', () => {
  it('resets unchanged state immediately without requiring confirmation', () => {
    expect(hasMeaningfulAiWorkspaceState({ goal: '', instruction: '', context: defaultAiComposerContext, hasProposal: false })).toBe(false)
  })

  it.each([
    { goal: 'Build a career plan', instruction: '', context: defaultAiComposerContext, hasProposal: false },
    { goal: '', instruction: 'Make it shorter', context: defaultAiComposerContext, hasProposal: false },
    { goal: '', instruction: '', context: { ...defaultAiComposerContext, durationMonths: 12 }, hasProposal: false },
    { goal: '', instruction: '', context: defaultAiComposerContext, hasProposal: true },
  ])('requires confirmation for meaningful goal, refinement, context or proposal state', (state) => {
    expect(hasMeaningfulAiWorkspaceState(state)).toBe(true)
  })

  it('does not mistake a copied default context for a user selection', () => {
    expect(hasSelectedPlanningContext({ ...defaultAiComposerContext })).toBe(false)
  })

  it('confirmation reset clears goal, context, refinements and the proposal envelope', () => {
    expect(emptyAiWorkspaceState()).toEqual({ goal: '', instruction: '', context: defaultAiComposerContext, current: null })
  })
})
