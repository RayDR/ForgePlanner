import { describe, expect, it } from 'vitest'
import { createCanonicalPlanFixture } from '../../shared/plan-contract/index.js'
import type { ForgePlan, PlanSyncMetadata } from '../types/forgePlanner'
import { buildVisiblePlanCards, eligibleLocalCards } from './visiblePlanCards'

function plan(id: string, remoteId?: string): ForgePlan {
  return {
    id, ...(remoteId ? { remoteId, remoteAccess: 'owner' as const, remoteRevision: 1 } : {}),
    title: id, description: '', startDate: '2026-01-01', endDate: '2026-12-31', planningMode: 'annual',
    categories: [], monthlyViewPreference: 'list', snapshot: createCanonicalPlanFixture(), createdAt: '', updatedAt: '',
  }
}

describe('visible plan cards', () => {
  it('combines remote, account outbox and physical guest plans without changing ownership', () => {
    const cards = buildVisiblePlanCards(
      [plan('remote', 'remote-id'), plan('outbox')],
      [plan('guest-a'), plan('guest-b')],
      { outbox: { state: 'failed' }, 'guest-a': { state: 'saving' } } as Record<string, PlanSyncMetadata>, false,
    )
    expect(cards.map(({ plan: item, source, ownership }) => [item.id, source, ownership])).toEqual([
      ['remote', 'remote-account', 'account'], ['outbox', 'account-local-outbox', 'unowned-local'],
      ['guest-a', 'guest-local', 'unowned-local'], ['guest-b', 'guest-local', 'unowned-local'],
    ])
    expect(eligibleLocalCards(cards).map(({ plan: item }) => item.id)).toEqual(['outbox', 'guest-b'])
    expect(cards.find(({ plan: item }) => item.id === 'guest-a')).toMatchObject({ syncState: 'saving', canSync: false, canRetry: false })
    expect(cards.find(({ plan: item }) => item.id === 'guest-b')?.canOpen).toBe(true)
  })

  it('never duplicates a plan already represented by the account source', () => {
    expect(buildVisiblePlanCards([plan('same', 'remote-id')], [plan('same')], {})).toHaveLength(1)
  })
})
