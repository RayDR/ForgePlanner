import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForgePlan } from '../types/forgePlanner'
import { planApi } from './planApi'
import { createCanonicalPlanFixture } from '../../shared/plan-contract/index.js'

const plan = {
  id: 'outbox:mutation', title: 'Plan', description: 'Goal', startDate: '2026-01-01', endDate: '2026-12-31', planningMode: 'annual', categories: [], monthlyViewPreference: 'list', createdAt: '', updatedAt: '',
  snapshot: createCanonicalPlanFixture(),
} as unknown as ForgePlan

describe('plan API server-first creation', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { cookie: 'northstar_csrf=csrf' })
    vi.stubGlobal('window', { setTimeout, clearTimeout, dispatchEvent: vi.fn() })
  })

  it('posts a mutation ID without client synchronization or ownership metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ created: true, plan: { id: '11111111-1111-4111-8111-111111111111', accessLevel: 'owner', sharingEnabled: true, name: 'Plan', objective: 'Goal', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active', snapshot: plan.snapshot, revision: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } }), { status: 201, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await planApi.create(plan, '22222222-2222-4222-8222-222222222222')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(result.created).toBe(true); expect(result.plan.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(body.clientMutationId).toBe('22222222-2222-4222-8222-222222222222')
    expect(body).not.toHaveProperty('ownerUserId'); expect(body).not.toHaveProperty('name'); expect(body).not.toHaveProperty('objective'); expect(body).not.toHaveProperty('syncState'); expect(body.snapshot).not.toHaveProperty('syncByPlanId')
  })

  it('loads server trash and sends expected revisions for lifecycle mutations', async () => {
    const remote = { id: '11111111-1111-4111-8111-111111111111', sharingEnabled: true, name: 'Plan', objective: 'Goal', startDate: '2026-01-01', endDate: '2026-12-31', revision: 2, deletedAt: '2026-07-20T00:00:00.000Z', purgeAfter: '2026-08-19T00:00:00.000Z', restoreEligible: true }
    const restored = { id: remote.id, accessLevel: 'owner', sharingEnabled: true, name: 'Plan', objective: 'Goal', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active', snapshot: plan.snapshot, revision: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ plans: [remote], total: 1, page: 1, limit: 50 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ plan: remote, deleted: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ plan: restored, restored: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const trash = await planApi.trash(); expect(trash.plans[0]).toMatchObject({ remoteId: remote.id, purgeAfter: remote.purgeAfter })
    expect(trash.plans[0]).not.toHaveProperty('snapshot')
    await planApi.remove(remote.id, 2); await planApi.restore(remote.id, 2); await planApi.purge(remote.id, 2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ expectedRevision: 2 })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ expectedRevision: 2 })
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ expectedRevision: 2 })
  })
})
