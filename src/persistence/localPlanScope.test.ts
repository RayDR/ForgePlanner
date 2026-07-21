import { describe, expect, it } from 'vitest'
import { getEligibleLocalPlans } from './localPlanScope'
import type { ForgePlan } from '../types/forgePlanner'

const plan = (id: string, extra: Partial<ForgePlan> = {}) => ({ id, title: id, description: '', startDate: '2026-01-01', endDate: '2026-01-31', planningMode: 'annual', categories: [], monthlyViewPreference: 'list', snapshot: {} as ForgePlan['snapshot'], createdAt: '', updatedAt: '', ...extra }) as ForgePlan

describe('getEligibleLocalPlans', () => {
  it('returns only unsynced recoverable local plans', () => {
    const plans = [plan('local'), plan('remote', { remoteId: 'r1' }), plan('deleted')]
    expect(getEligibleLocalPlans(plans, { deleted: { state: 'failed' } }, ['deleted']).map((item) => item.id)).toEqual(['local'])
  })

  it('keeps failed and offline plans explicitly saveable but excludes transitions', () => {
    const plans = [plan('failed'), plan('offline'), plan('saving'), plan('conflict')]
    const sync = { failed: { state: 'failed' as const }, offline: { state: 'offline' as const }, saving: { state: 'saving' as const }, conflict: { state: 'conflict' as const } }
    expect(getEligibleLocalPlans(plans, sync).map((item) => item.id)).toEqual(['failed', 'offline'])
  })
})
