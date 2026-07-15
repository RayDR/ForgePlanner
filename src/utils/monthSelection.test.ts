import { describe, expect, it } from 'vitest'
import { buildYearMonths } from './dateUtils'
import { parseNonNegativeNumber, resolveInitialMonthForYear, resolveMonthForYear } from './monthSelection'

describe('monthly selection', () => {
  it('keeps the same month number when the year changes', () => {
    expect(resolveMonthForYear('2026-09', 2027, '2026-08-01', '2028-07-31')).toBe('2027-09')
  })

  it('selects the first valid month when the same month is outside the project range', () => {
    expect(resolveMonthForYear('2027-02', 2026, '2026-08-01', '2028-07-31')).toBe('2026-08')
    expect(resolveMonthForYear('2027-11', 2028, '2026-08-01', '2028-07-31')).toBe('2028-01')
  })

  it('returns all twelve sidebar months, including inactive months', () => {
    const months = buildYearMonths(2026, '2026-08-01', '2028-07-31', 'es')
    expect(months).toHaveLength(12)
    expect(months[0]).toMatchObject({ id: '2026-01', active: false })
    expect(months[7]).toMatchObject({ id: '2026-08', active: true })
  })

  it('opens the first month containing data when selecting a different year', () => {
    expect(resolveInitialMonthForYear(
      2027,
      '2026-08-01',
      '2028-07-31',
      ['2027-08', '2027-03', '2026-08'],
    )).toBe('2027-03')
  })

  it('falls back to the first valid project month when the year has no data', () => {
    expect(resolveInitialMonthForYear(
      2026,
      '2026-08-01',
      '2028-07-31',
      [],
    )).toBe('2026-08')
  })
})

describe('inline savings validation', () => {
  it('accepts zero and non-negative numeric values', () => {
    expect(parseNonNegativeNumber('0')).toBe(0)
    expect(parseNonNegativeNumber('300.5')).toBe(300.5)
  })

  it('rejects empty, negative, NaN and infinite values', () => {
    expect(parseNonNegativeNumber('')).toBeNull()
    expect(parseNonNegativeNumber('-1')).toBeNull()
    expect(parseNonNegativeNumber('abc')).toBeNull()
    expect(parseNonNegativeNumber('Infinity')).toBeNull()
  })
})
