import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { aiProposalCopy } from './aiProposalCopy'
import { AiContextControls } from './AiContextControls'
import { defaultAiComposerContext } from './proposalInput'

describe('AI optional planning context controls', () => {
  it('renders accessible compact selection groups with explicit selected state', () => {
    const markup = renderToStaticMarkup(<AiContextControls value={defaultAiComposerContext} onChange={vi.fn()} copy={aiProposalCopy.en} />)
    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('role="radio"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('Balanced')
    expect(markup).toContain('Selected')
    expect(markup).not.toContain('<select><option>Focused')
  })

  it('reveals amount and currency fields only for an active financial context', () => {
    const none = renderToStaticMarkup(<AiContextControls value={defaultAiComposerContext} onChange={vi.fn()} copy={aiProposalCopy.en} />)
    const savings = renderToStaticMarkup(<AiContextControls value={{ ...defaultAiComposerContext, financialMode: 'savings', financialAmount: 300 }} onChange={vi.fn()} copy={aiProposalCopy.en} />)
    expect(none).not.toContain('ai-financial-fields')
    expect(savings).toContain('ai-financial-fields')
    expect(savings).toContain('value="300"')
    expect(savings).toContain('Currency')
  })
})
