import { describe, expect, it } from 'vitest'
import { proposalProcessingLeaseMs } from './ai.service.js'

describe('AI proposal processing timeout policy', () => {
  it('keeps the database lease open for a provider call and one output-repair attempt', () => {
    expect(proposalProcessingLeaseMs(60_000)).toBe(135_000)
    expect(proposalProcessingLeaseMs(20_000)).toBe(55_000)
  })
})
