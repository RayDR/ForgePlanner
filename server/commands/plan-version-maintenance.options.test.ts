import { describe, expect, it } from 'vitest'
import { parseBackfillOptions, parseVerifyOptions } from './plan-version-maintenance.options.js'

const database = 'postgresql://user:password@localhost:5432/northstar_history_test'

describe('plan version maintenance options', () => {
  it('uses bounded dry-run backfill defaults and requires explicit database confirmation to write', () => {
    expect(parseBackfillOptions([], database)).toMatchObject({ execute: false, limit: 100, databaseName: 'northstar_history_test' })
    expect(() => parseBackfillOptions(['--execute'], database)).toThrow(/confirm-database/)
    expect(parseBackfillOptions(['--execute', '--limit=25', '--confirm-database=northstar_history_test'], database)).toMatchObject({ execute: true, limit: 25 })
    expect(() => parseBackfillOptions(['--limit=251'], database)).toThrow()
  })

  it('keeps immutable-version repair disabled', () => {
    expect(() => parseVerifyOptions(['--execute-repair'], database)).toThrow(/disabled/)
  })
})
