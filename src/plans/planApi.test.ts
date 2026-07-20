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
})
