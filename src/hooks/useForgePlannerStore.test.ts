import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForgePlan } from '../types/forgePlanner'
import { MemoryStorage } from '../persistence/testStorage'
import { userIdentityScope } from '../persistence/identityScope'

const storage = new MemoryStorage()
let store: typeof import('./useForgePlannerStore').useForgePlannerStore
let reset: typeof import('./useForgePlannerStore').resetForgePlannerMemory
let transition: typeof import('../persistence/identityTransition').transitionBrowserIdentity

const plan = (id: string, remoteId?: string): ForgePlan => ({ id, remoteId, remoteAccess: remoteId ? 'owner' : undefined, remoteRevision: remoteId ? 1 : undefined, title: id, description: '', startDate: '2026-01-01', endDate: '2026-12-31', planningMode: 'annual', categories: [], monthlyViewPreference: 'list', snapshot: { schemaVersion: 7, project: { id } } as unknown as ForgePlan['snapshot'], createdAt: '', updatedAt: '' })

describe('authenticated plan cache and outbox', () => {
  beforeAll(async () => {
    vi.stubGlobal('window', { localStorage: storage, sessionStorage: new MemoryStorage() })
    ;({ useForgePlannerStore: store, resetForgePlannerMemory: reset } = await import('./useForgePlannerStore'))
    ;({ transitionBrowserIdentity: transition } = await import('../persistence/identityTransition'))
  })
  beforeEach(async () => { storage.clear(); reset(); await transition(userIdentityScope('11111111-1111-4111-8111-111111111111')) })

  it('keeps a failed create recoverable and atomically replaces it with the canonical plan', () => {
    const draft = plan('outbox:mutation')
    store.getState().retainFailedCreate(draft, { state: 'offline', clientMutationId: '22222222-2222-4222-8222-222222222222' })
    expect(store.getState().syncByPlanId[draft.id].state).toBe('offline')
    store.getState().acceptServerPlan(plan('server-id', 'server-id'), draft.id)
    expect(store.getState().plans.map((item) => item.id)).toEqual(['server-id'])
    expect(store.getState().activePlanId).toBe('server-id')
    expect(store.getState().syncByPlanId['server-id'].state).toBe('synced')
    expect(store.getState().syncByPlanId[draft.id]).toBeUndefined()
  })

  it('removes stale remote records but preserves a valid failed outbox item', () => {
    store.setState({ plans: [plan('stale', 'stale'), plan('outbox:failed')], syncByPlanId: { stale: { state: 'synced' }, 'outbox:failed': { state: 'failed', clientMutationId: 'mutation' } } })
    store.getState().reconcileRemotePlans([])
    expect(store.getState().plans.map((item) => item.id)).toEqual(['outbox:failed'])
  })

  it('clears the route-derived roadmap snapshot when reconciliation removes the active remote plan', async () => {
    const remote = plan('server', 'remote-server')
    const { useRoadmapStore } = await import('./useRoadmapStore')
    store.setState({ plans: [remote], activePlanId: remote.id, syncByPlanId: { [remote.id]: { state: 'synced' } } })
    useRoadmapStore.setState((state) => ({ project: { ...state.project, name: 'Private plan from another device' } }))

    store.getState().reconcileRemotePlans([])

    expect(store.getState().activePlanId).toBeUndefined()
    expect(useRoadmapStore.getState().project.name).not.toBe('Private plan from another device')
  })

  it('preserves a failed update while the server still authorizes the same plan', () => {
    const local = { ...plan('server', 'server'), title: 'Local unsaved edit' }
    store.setState({ plans: [local], syncByPlanId: { server: { state: 'failed', error: { code: 'NETWORK', message: 'offline' } } } })
    store.getState().reconcileRemotePlans([{ ...local, title: 'Remote title' }])
    expect(store.getState().plans[0].title).toBe('Local unsaved edit')
  })

  it('removes a server-confirmed deleted plan and clears active selection and sync metadata', () => {
    const remote = plan('server', 'remote-server')
    store.setState({ plans: [remote], activePlanId: remote.id, syncByPlanId: { [remote.id]: { state: 'synced' } } })
    store.getState().removeConfirmedRemotePlan('remote-server')
    expect(store.getState().plans).toEqual([])
    expect(store.getState().activePlanId).toBeUndefined()
    expect(store.getState().syncByPlanId[remote.id]).toBeUndefined()
  })
})
