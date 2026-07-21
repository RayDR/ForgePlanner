import { useEffect, useState } from 'react'
import { nextRevealLength, REVEAL_INTERVAL_MS } from './typingReveal'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function AssistantTypingMessage({ messageKey, text, author, typingLabel, revealLabel }: {
  messageKey: string
  text: string
  author: string
  typingLabel: string
  revealLabel: string
}) {
  const reducedMotion = prefersReducedMotion()
  const [visibleLength, setVisibleLength] = useState(reducedMotion ? text.length : 0)
  const complete = visibleLength >= text.length

  useEffect(() => {
    if (reducedMotion) return
    const start = window.setTimeout(() => setVisibleLength(0), 0)
    let timer = 0
    timer = window.setInterval(() => {
      setVisibleLength((current) => {
        const next = nextRevealLength(current, text.length)
        if (next >= text.length) window.clearInterval(timer)
        return next
      })
    }, REVEAL_INTERVAL_MS)
    return () => { window.clearTimeout(start); window.clearInterval(timer) }
  }, [messageKey, reducedMotion, text])

  return <div className="plans-ai-message plans-ai-message--assistant" data-message-key={messageKey}>
    <strong>{author}</strong>
    <p className="plans-ai-typing-text" aria-hidden={!complete}>{text.slice(0, visibleLength)}</p>
    <span className="visually-hidden" role="status" aria-live="polite">{complete ? text : typingLabel}</span>
    {!complete ? <button className="ai-reveal-message" type="button" onClick={() => setVisibleLength(text.length)}>{revealLabel}</button> : null}
  </div>
}
