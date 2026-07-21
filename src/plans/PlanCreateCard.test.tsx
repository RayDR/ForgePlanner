import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PlanCreateCard } from './PlanCreateCard'

describe('PlanCreateCard', () => {
  it('renders one reusable creation card containing AI, manual and import actions', () => {
    const markup = renderToStaticMarkup(<PlanCreateCard locale="en" onAi={vi.fn()} onManual={vi.fn()} onImport={vi.fn()} />)
    expect(markup.match(/data-testid="plan-create-card"/g)).toHaveLength(1)
    expect(markup).toContain('Plan with NorthStar AI')
    expect(markup).toContain('Create manually')
    expect(markup).toContain('Import')
    expect(markup).not.toContain('plans-create-tile')
  })
})
