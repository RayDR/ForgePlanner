import { describe, expect, it } from 'vitest'
import type { Activity } from '../types/roadmap'
import { activitiesForMonth, activityTouchesMonth } from './dateUtils'

function datedActivity(input: Partial<Activity> = {}) {
  return {
    id: 'activity-ai',
    startDate: '2027-02-10',
    endDate: '2027-04-20',
    monthlyEntries: {},
    ...input,
  } as Activity
}

describe('activity month placement', () => {
  it('derives non-recurring AI activity months from the activity date range', () => {
    const activity = datedActivity()

    expect(activityTouchesMonth(activity, '2027-01')).toBe(false)
    expect(activityTouchesMonth(activity, '2027-02')).toBe(true)
    expect(activityTouchesMonth(activity, '2027-03')).toBe(true)
    expect(activityTouchesMonth(activity, '2027-04')).toBe(true)
    expect(activityTouchesMonth(activity, '2027-05')).toBe(false)
  })

  it('preserves an explicit monthly placement outside the activity date range', () => {
    const activity = datedActivity({
      monthlyEntries: { '2027-06': { monthId: '2027-06', status: 'continued', progress: 0 } },
    })

    expect(activityTouchesMonth(activity, '2027-06')).toBe(true)
    expect(activitiesForMonth([activity], '2027-06')).toEqual([activity])
  })

  it('uses the recurrence end month for recurring activities', () => {
    const activity = datedActivity({
      startDate: '2027-01-15',
      endDate: '2027-01-15',
      recurrence: { frequency: 'monthly', endDate: '2027-07-15' },
    })

    expect(activityTouchesMonth(activity, '2027-07')).toBe(true)
    expect(activityTouchesMonth(activity, '2027-08')).toBe(false)
  })
})
