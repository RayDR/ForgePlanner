import { describe, expect, it } from 'vitest'
import { getEffectiveMonthlySavingsTarget, isSavingsTrackingEnabled, shouldShowMonthlySavings } from './roadmapModel'

describe('savings feature visibility', () => {
  it('is enabled only after an explicit opt-in', () => {
    const savingsPlan = { currency: 'USD' as const, targetTotal: 0, monthlyEntries: [] }
    expect(isSavingsTrackingEnabled({ savingsPlan: { ...savingsPlan, enabled: true } })).toBe(true)
    expect(isSavingsTrackingEnabled({ savingsPlan: { ...savingsPlan, enabled: false } })).toBe(false)
    expect(isSavingsTrackingEnabled({ savingsPlan })).toBe(false)
  })
})

describe('default monthly savings target', () => {
  const project = {
    savingsPlan: {
      currency: 'USD' as const,
      enabled: true,
      mode: 'monthly-target' as const,
      defaultMonthlyTarget: 300,
      targetTotal: 0,
      monthlyEntries: [],
    },
  }

  it('uses the configured default when a month has no explicit target', () => {
    expect(getEffectiveMonthlySavingsTarget(project, '2027-02')).toBe(300)
  })

  it('preserves an explicitly edited monthly target, including zero', () => {
    const edited = { ...project, savingsPlan: { ...project.savingsPlan, monthlyEntries: [{ monthId: '2027-02', target: 0, actual: 0, updatedAt: '2026-07-14' }] } }
    expect(getEffectiveMonthlySavingsTarget(edited, '2027-02')).toBe(0)
  })
})

describe('monthly savings footer visibility', () => {
  const emptyMonth = { savingsEnabled: true, insidePlanWindow: false, activityCount: 0, target: 0, actual: 0 }

  it('hides inside the plan window when no task or savings was registered', () => {
    expect(shouldShowMonthlySavings({ ...emptyMonth, insidePlanWindow: true })).toBe(false)
  })

  it('shows tasks or registered savings only inside the plan window', () => {
    expect(shouldShowMonthlySavings({ ...emptyMonth, insidePlanWindow: true, activityCount: 1 })).toBe(true)
    expect(shouldShowMonthlySavings({ ...emptyMonth, insidePlanWindow: true, target: 300 })).toBe(true)
    expect(shouldShowMonthlySavings({ ...emptyMonth, insidePlanWindow: true, actual: 25 })).toBe(true)
    expect(shouldShowMonthlySavings({ ...emptyMonth, target: 300 })).toBe(false)
  })

  it('hides when outside the window', () => {
    expect(shouldShowMonthlySavings(emptyMonth)).toBe(false)
  })

  it('always hides when savings tracking is disabled', () => {
    expect(shouldShowMonthlySavings({ ...emptyMonth, savingsEnabled: false, insidePlanWindow: true })).toBe(false)
  })
})
