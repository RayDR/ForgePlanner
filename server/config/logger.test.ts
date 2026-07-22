import { describe, expect, it } from 'vitest'
import { LOGGER_REDACT_PATHS } from './logger.js'

describe('AI logger redaction', () => {
  it('covers prompts, generated plans, provider output, and guest security fields', () => {
    for (const path of [
      '*.goal', '*.currentProposal', '*.instruction', '*.prompt', '*.providerInput',
      '*.providerOutput', '*.plan', '*.snapshot', '*.conversionSnapshot',
      '*.signedProposalToken', '*.signedConversionToken', 'req.headers.cookie',
      'req.headers.x-ai-guest-csrf', 'res.headers.set-cookie',
    ]) expect(LOGGER_REDACT_PATHS).toContain(path)
  })
})
