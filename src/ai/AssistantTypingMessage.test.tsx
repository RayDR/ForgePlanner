import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantTypingMessage } from './AssistantTypingMessage'
import { nextRevealLength } from './typingReveal'

describe('assistant response reveal', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('advances progressively in short readable chunks and can finish exactly', () => {
    expect(nextRevealLength(0, 20)).toBe(3)
    expect(nextRevealLength(18, 20)).toBe(20)
  })

  it('renders the complete inert response immediately for reduced motion', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: true }) } })
    const markup = renderToStaticMarkup(<AssistantTypingMessage messageKey="one" text={'First line\nSecond line'} author="NorthStar AI" typingLabel="Writing" revealLabel="Reveal" />)
    expect(markup).toContain('First line\nSecond line')
    expect(markup).not.toContain('>Reveal<')
    expect(markup).not.toContain('dangerouslySetInnerHTML')
  })

  it('offers a keyboard-operable reveal action while animation is incomplete', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false }) } })
    const markup = renderToStaticMarkup(<AssistantTypingMessage messageKey="two" text="Response" author="NorthStar AI" typingLabel="Writing" revealLabel="Reveal" />)
    expect(markup).toContain('<button')
    expect(markup).toContain('>Reveal</button>')
    expect(markup).toContain('aria-live="polite"')
  })
})
