import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiApi } from './aiApi'

describe('AI API error boundary', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves controlled status/code so guest initialization can show a localized retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'AI_GUEST_NOT_CONFIGURED', message: 'internal' } }), { status: 503, headers: { 'content-type': 'application/json' } })))
    await expect(aiApi.guestSession()).rejects.toMatchObject({ status: 503, code: 'AI_GUEST_NOT_CONFIGURED' })
  })
})
