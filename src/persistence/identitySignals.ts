const CHANNEL_NAME = 'northstar-identity'
const STORAGE_SIGNAL_KEY = 'northstar:v1:identity-signal'

export type IdentitySignal = 'session-changed'

export function publishIdentitySignal(signal: IdentitySignal) {
  if (typeof window === 'undefined') return
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage(signal)
    channel.close()
    return
  }
  window.localStorage.setItem(STORAGE_SIGNAL_KEY, JSON.stringify({ signal, nonce: crypto.randomUUID() }))
}

export function subscribeToIdentitySignals(listener: (signal: IdentitySignal) => void) {
  if (typeof window === 'undefined') return () => undefined
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent<IdentitySignal>) => {
      if (event.data === 'session-changed') listener(event.data)
    }
    return () => channel.close()
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_SIGNAL_KEY || !event.newValue) return
    try {
      const message = JSON.parse(event.newValue) as { signal?: IdentitySignal }
      if (message.signal === 'session-changed') listener(message.signal)
    } catch {
      // Ignore malformed cross-tab messages; session is always re-read from API.
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
