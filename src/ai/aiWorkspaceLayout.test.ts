import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('embedded AI workspace structure', () => {
  const view = readFileSync(new URL('../views/PlansHomeView.tsx', import.meta.url), 'utf8')
  const proposal = readFileSync(new URL('../views/AiProposalView.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

  it('keeps filter tabs before a dedicated fixed workspace row', () => {
    expect(view.indexOf('plans-filter-tabs')).toBeLessThan(view.indexOf('plans-workspace'))
    expect(css).toMatch(/\.plans-workspace\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s)
    expect(css).toMatch(/\.ai-proposal-page--embedded\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/s)
  })

  it('places Back to plans first in the header and Start over by the conversation', () => {
    expect(proposal.indexOf('ai-header-left')).toBeLessThan(proposal.indexOf('ai-header-title'))
    expect(proposal).toContain('ai-conversation-toolbar')
    expect(proposal.indexOf('ai-conversation-toolbar')).toBeGreaterThan(proposal.indexOf('ai-proposal-main'))
    expect(proposal).not.toMatch(/ai-header-(?:actions|left)[^\n]*startOver/)
  })

  it('renders the warning before the conversation and removes redundant tab-storage copy', () => {
    expect(proposal.indexOf('ai-sensitive-warning')).toBeLessThan(proposal.indexOf('plans-ai-conversation'))
    expect(proposal).not.toContain('guestNotice')
  })
})
