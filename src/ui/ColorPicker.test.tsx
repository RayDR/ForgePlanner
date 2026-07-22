import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ColorPicker } from './ColorPicker'

describe('ColorPicker', () => {
  it('renders an unrestricted native color input and an accessible preset palette', () => {
    const html = renderToStaticMarkup(<ColorPicker fallback="blue" label="Choose color" onChange={vi.fn()} />)
    expect(html).toContain('type="color"')
    expect(html).toContain('aria-label="Choose color"')
    expect(html.match(/paint-color-swatch/g)?.length).toBeGreaterThan(10)
  })
})
