import { describe, expect, it } from 'vitest'
import type { Activity } from '../types/roadmap'
import { getApplicableRecurrenceOptions } from './recurrence'
import { activityOccursOnDate, getActivityDisplayId } from './roadmapModel'

const recurring = { startDate: '2026-08-03', endDate: '2026-08-03', recurrence: { frequency: 'weekly', endDate: '2026-09-30' } } as Activity

describe('activity recurrence', () => {
  it('calculates weekly occurrences without duplicating tasks', () => {
    expect(activityOccursOnDate(recurring, '2026-08-10')).toBe(true)
    expect(activityOccursOnDate(recurring, '2026-08-11')).toBe(false)
  })

  it('preserves the task duration in every weekly occurrence', () => {
    const twoDayTask = { ...recurring, endDate: '2026-08-04' } as Activity
    expect(activityOccursOnDate(twoDayTask, '2026-08-10')).toBe(true)
    expect(activityOccursOnDate(twoDayTask, '2026-08-11')).toBe(true)
    expect(activityOccursOnDate(twoDayTask, '2026-08-12')).toBe(false)
  })

  it('does not offer recurrence intervals longer than the available plan window', () => {
    const values = getApplicableRecurrenceOptions('2026-08-01', '2026-08-20').map((option) => option.value)
    expect(values).toContain('weekly')
    expect(values).not.toContain('monthly')
  })
})

describe('friendly activity numbering', () => {
  it('keeps the UUID internal and renders a plan-prefixed sequence', () => {
    const activity = { id: 'uuid', sequenceNumber: 12 } as Activity
    expect(getActivityDisplayId(activity, { name: 'Project NorthStar' }, [activity])).toBe('PN-012')
  })
})
