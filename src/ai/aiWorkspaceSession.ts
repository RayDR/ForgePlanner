const SENSITIVE_WARNING_KEY = 'northstar-ai-sensitive-warning-dismissed'

function browserSessionStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.sessionStorage
}

export function isSensitiveWarningDismissed(storage: Storage | undefined = browserSessionStorage()) {
  return storage?.getItem(SENSITIVE_WARNING_KEY) === 'true'
}

export function dismissSensitiveWarning(storage: Storage | undefined = browserSessionStorage()) {
  storage?.setItem(SENSITIVE_WARNING_KEY, 'true')
}

export const aiWorkspaceSessionKeys = { sensitiveWarning: SENSITIVE_WARNING_KEY } as const
