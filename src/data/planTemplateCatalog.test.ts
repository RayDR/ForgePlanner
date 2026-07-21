import { describe, expect, it } from 'vitest'
import { getPlanTemplate } from './planTemplateCatalog'

describe('savings plan template', () => {
  it('enables the existing monthly savings model and exposes all relevant activity categories', () => {
    const template = getPlanTemplate('savings-goal')
    expect(template.planningMode).toBe('monthly')
    expect(template.savings).toEqual({ enabled: true, mode: 'monthly-target', defaultMonthlyTarget: 300 })
    expect(template.categories.map((category) => category.key)).toEqual(['goal', 'contributions', 'expenses', 'checkpoints', 'progress'])
  })
})
