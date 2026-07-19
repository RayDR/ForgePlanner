const SESSION_INVALID_EVENT = 'northstar:session-invalid'

export function notifySessionInvalid() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_INVALID_EVENT))
}

export function subscribeToSessionInvalid(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(SESSION_INVALID_EVENT, listener)
  return () => window.removeEventListener(SESSION_INVALID_EVENT, listener)
}
