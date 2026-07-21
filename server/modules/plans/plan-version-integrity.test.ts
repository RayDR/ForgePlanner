import { describe, expect, it } from 'vitest'
import { createCanonicalPlanFixture } from '../../../shared/plan-contract/index.js'
import { canonicalPlanSerialization, prepareVersionSnapshot } from './plan-version-integrity.js'

describe('canonical plan version integrity', () => {
  it('produces the same checksum regardless of object insertion order', () => {
    const plan = createCanonicalPlanFixture()
    const reordered = Object.fromEntries(Object.entries(plan).reverse())
    expect(prepareVersionSnapshot(reordered).checksum).toBe(prepareVersionSnapshot(plan).checksum)
    expect(canonicalPlanSerialization(prepareVersionSnapshot(reordered).snapshot)).toBe(canonicalPlanSerialization(plan))
  })

  it('changes checksum for meaningful content and meaningful array order', () => {
    const plan = createCanonicalPlanFixture()
    const changed = { ...plan, project: { ...plan.project, name: 'A different plan' } }
    const withTags = { ...plan, tags: ['alpha', 'beta'] }
    const reordered = { ...withTags, tags: ['beta', 'alpha'] }
    expect(prepareVersionSnapshot(changed).checksum).not.toBe(prepareVersionSnapshot(plan).checksum)
    expect(prepareVersionSnapshot(reordered).checksum).not.toBe(prepareVersionSnapshot(withTags).checksum)
  })

  it('uses the exact canonical UTF-8 byte size and remains stable', () => {
    const first = prepareVersionSnapshot(createCanonicalPlanFixture())
    const second = prepareVersionSnapshot(JSON.parse(first.serialized))
    expect(first.snapshotSizeBytes).toBe(Buffer.byteLength(first.serialized, 'utf8'))
    expect(second).toMatchObject({ checksum: first.checksum, snapshotSizeBytes: first.snapshotSizeBytes, schemaVersion: 8 })
  })

  it('rejects an oversized but otherwise canonical snapshot', () => {
    const plan = createCanonicalPlanFixture()
    const activities = Array.from({ length: 20 }, (_, index) => ({ ...plan.activities[0], id: `activity-${index}`, title: `Activity ${index}`, description: 'x'.repeat(20_000), sequenceNumber: index + 1, history: [{ ...plan.activities[0].history[0], id: `history-${index}`, activityId: `activity-${index}` }] }))
    expect(() => prepareVersionSnapshot({ ...plan, project: { ...plan.project, milestones: [] }, activities })).toThrow(/exceeds/)
  })
})
