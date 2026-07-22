import { describe, expect, it } from 'vitest'
import { isAiProviderRateLimit, safeAiProviderRequestReason } from './ai-provider.js'

describe('AI provider transport errors', () => {
  it('recognizes provider rate limits without exposing the provider message', () => {
    const error = Object.assign(new Error('sensitive provider response'), {
      name: 'RateLimitError',
      status: 429,
      code: 'rate_limit_exceeded',
      error: { type: 'tokens' },
    })

    expect(isAiProviderRateLimit(error)).toBe(true)
    expect(safeAiProviderRequestReason(error)).toBe('http_429:rate_limit_exceeded:tokens:RateLimitError')
    expect(safeAiProviderRequestReason(error)).not.toContain('sensitive')
  })

  it('does not copy malformed provider metadata into diagnostics', () => {
    const error = Object.assign(new Error('private request body'), {
      status: 503,
      code: 'bad code with private content',
      error: { type: 'invalid type' },
    })

    expect(isAiProviderRateLimit(error)).toBe(false)
    expect(safeAiProviderRequestReason(error)).toBe('http_503:Error')
  })
})
