import { getClosestActiveMonth } from './dateUtils'

export function resolveMonthForYear(currentMonthId: string, year: number, startDate: string, endDate: string) {
  const monthNumber = /^\d{4}-\d{2}$/.test(currentMonthId) ? currentMonthId.slice(5, 7) : '01'
  const candidate = `${year}-${monthNumber}`
  const startMonth = startDate.slice(0, 7)
  const endMonth = endDate.slice(0, 7)
  return candidate >= startMonth && candidate <= endMonth
    ? candidate
    : getClosestActiveMonth(year, startDate, endDate)
}

export function resolveInitialMonthForYear(
  year: number,
  startDate: string,
  endDate: string,
  monthIdsWithData: Iterable<string>,
) {
  const yearPrefix = `${year}-`
  const firstWithData = [...monthIdsWithData]
    .filter((monthId) => monthId.startsWith(yearPrefix))
    .sort((left, right) => left.localeCompare(right))[0]

  return firstWithData ?? getClosestActiveMonth(year, startDate, endDate)
}

export function parseNonNegativeNumber(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
