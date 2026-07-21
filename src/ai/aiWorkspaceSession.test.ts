import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStorage } from '../persistence/testStorage'
import { aiWorkspaceSessionKeys, dismissSensitiveWarning, isSensitiveWarningDismissed } from './aiWorkspaceSession'

describe('AI workspace session preferences', () => {
  const sessionStorage = new MemoryStorage()

  beforeEach(() => sessionStorage.clear())

  it('dismisses the sensitive-data warning only in the provided browser session', () => {
    expect(isSensitiveWarningDismissed(sessionStorage)).toBe(false)
    dismissSensitiveWarning(sessionStorage)
    expect(isSensitiveWarningDismissed(sessionStorage)).toBe(true)
    expect(isSensitiveWarningDismissed(new MemoryStorage())).toBe(false)
    expect(sessionStorage.getItem(aiWorkspaceSessionKeys.sensitiveWarning)).toBe('true')
  })
})
