import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishIdentitySignal, subscribeToIdentitySignals } from './identitySignals'
import { MemoryStorage } from './testStorage'

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>()
  onmessage: ((event: MessageEvent<'session-changed'>) => void) | null = null
  constructor(private readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) ?? new Set()
    channels.add(this); FakeBroadcastChannel.channels.set(name, channels)
  }
  postMessage(message: 'session-changed') {
    FakeBroadcastChannel.channels.get(this.name)?.forEach((channel) => {
      if (channel !== this) channel.onmessage?.({ data: message } as MessageEvent<'session-changed'>)
    })
  }
  close() { FakeBroadcastChannel.channels.get(this.name)?.delete(this) }
}

describe('cross-tab identity invalidation', () => {
  afterEach(() => {
    FakeBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it('signals other tabs to re-read the server session without sharing planner data', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    vi.stubGlobal('window', { BroadcastChannel: FakeBroadcastChannel, localStorage: new MemoryStorage() })
    const listener = vi.fn()
    const unsubscribe = subscribeToIdentitySignals(listener)
    publishIdentitySignal('session-changed')
    expect(listener).toHaveBeenCalledWith('session-changed')
    expect(listener.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ plans: expect.anything() }))
    unsubscribe()
  })
})
