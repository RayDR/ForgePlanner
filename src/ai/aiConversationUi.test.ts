import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('inline conversational proposal UI', () => {
  const view = readFileSync(new URL('../views/AiProposalView.tsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('./aiApi.ts', import.meta.url), 'utf8')
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')

  it('renders questions, answers, and rich proposals in the existing conversation', () => {
    expect(view).toContain('data-testid="inline-ai-conversation"')
    expect(view).toContain("result.turn.action === 'ASK'")
    expect(view).toContain('ai-proposal-message')
    expect(view).toContain('message.proposal.successIndicators')
    expect(view).not.toContain("navigate('/ai/plan-proposals")
    expect(view).toContain('data-testid="ai-plan-preview"')
  })

  it('exposes all four proposal actions and uses the exact current revision', () => {
    expect(view).toContain('t.acceptProposal')
    expect(view).toContain('t.refineProposal')
    expect(view).toContain('t.reject')
    expect(view).toContain('t.continueTalking')
    expect(view).toContain('expectedRevision: current.operation.currentProposalRevision')
  })

  it('keeps the OpenAI key backend-only', () => {
    expect(api).not.toContain('OPENAI_API_KEY')
    expect(packageJson).toContain('"openai"')
  })

  it('opens a generated guest plan from the session-only boundary', () => {
    expect(view).toContain('addSessionPlan(plan)')
    expect(view).toContain('navigate(`/plans/${plan.id}/roadmap`)')
  })
})
