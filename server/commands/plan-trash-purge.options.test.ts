import { describe, expect, it } from 'vitest'
import { parsePlanTrashPurgeOptions } from './plan-trash-purge.options.js'

describe('plan trash purge command safety', () => {
  it('defaults to dry-run semantics and bounds execution batches', () => {
    expect(parsePlanTrashPurgeOptions([], 'postgresql://isolated')).toEqual({ execute: false, limit: 500 })
    expect(parsePlanTrashPurgeOptions(['--execute', '--limit=25'], 'postgresql://isolated')).toEqual({ execute: true, limit: 25 })
    expect(() => parsePlanTrashPurgeOptions(['--execute'], undefined)).toThrow('DATABASE_URL is required')
    expect(() => parsePlanTrashPurgeOptions(['--limit=1001'], 'postgresql://isolated')).toThrow('--limit')
  })
})
