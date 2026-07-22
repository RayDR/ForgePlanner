import type { Activity, MonthBucket } from '../types/roadmap'

const longFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function toDate(dateString: string) {
  return new Date(`${dateString}T00:00:00Z`)
}

export function formatMonthId(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function getMonthId(dateString: string) {
  const date = toDate(dateString)
  return formatMonthId(date.getUTCFullYear(), date.getUTCMonth())
}

export function formatDateLabel(dateString: string) {
  return longFormatter.format(toDate(dateString))
}

export function formatDateRange(startDate: string, endDate: string) {
  return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`
}

export function buildYearMonths(
  year: number,
  projectStartDate: string,
  projectEndDate: string,
  locale: 'en' | 'es' = 'en',
): MonthBucket[] {
  const projectStart = toDate(projectStartDate)
  const projectEnd = toDate(projectEndDate)

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const monthStart = new Date(Date.UTC(year, monthIndex, 1))
    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0))
    const id = formatMonthId(year, monthIndex)

    return {
      id,
      year,
      monthIndex,
      shortLabel: new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', { month: 'short', timeZone: 'UTC' }).format(monthStart),
      longLabel: new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthStart),
      startDate: monthStart.toISOString().slice(0, 10),
      endDate: monthEnd.toISOString().slice(0, 10),
      active: monthEnd >= projectStart && monthStart <= projectEnd,
    }
  })
}

export function getProjectYears(startDate: string, endDate: string) {
  const startYear = toDate(startDate).getUTCFullYear()
  const endYear = toDate(endDate).getUTCFullYear()
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
}

export function getMonthIdsBetween(startDate: string, endDate: string) {
  const start = toDate(startDate)
  const end = toDate(endDate)
  const months: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))

  while (cursor <= end) {
    months.push(formatMonthId(cursor.getUTCFullYear(), cursor.getUTCMonth()))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return months
}

export function getProjectDurationMonths(startDate: string, endDate: string) {
  return getMonthIdsBetween(startDate, endDate).length
}

export function activityTouchesMonth(activity: Activity, monthId: string) {
  if (activity.monthlyEntries[monthId]) return true
  const firstMonthId = getMonthId(activity.startDate)
  const lastMonthId = getMonthId(activity.recurrence?.endDate ?? activity.endDate ?? activity.startDate)
  return monthId >= firstMonthId && monthId <= lastMonthId
}

export function activitiesForMonth(activities: Activity[], monthId: string) {
  return activities.filter((activity) => activityTouchesMonth(activity, monthId))
}

export function shiftActivityToMonth(activity: Activity, targetMonthId: string) {
  const durationInMonths = getMonthIdsBetween(activity.startDate, activity.endDate ?? activity.startDate).length - 1
  const [targetYear, targetMonth] = targetMonthId.split('-').map(Number)
  const newStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1))
  const newEnd = new Date(Date.UTC(targetYear, targetMonth - 1 + durationInMonths + 1, 0))

  return {
    startDate: newStart.toISOString().slice(0, 10),
    endDate: newEnd.toISOString().slice(0, 10),
  }
}

export function shiftActivityToDate(activity: Activity, targetDate: string) {
  const start = toDate(activity.startDate)
  const end = toDate(activity.endDate ?? activity.startDate)
  const durationDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
  const nextStart = toDate(targetDate)
  const nextEnd = new Date(nextStart)
  nextEnd.setUTCDate(nextEnd.getUTCDate() + durationDays)
  const recurrence = activity.recurrence ? (() => {
    const recurrenceEnd = toDate(activity.recurrence!.endDate)
    const shiftDays = Math.round((nextStart.getTime() - start.getTime()) / 86400000)
    recurrenceEnd.setUTCDate(recurrenceEnd.getUTCDate() + shiftDays)
    return { ...activity.recurrence!, endDate: recurrenceEnd.toISOString().slice(0, 10) }
  })() : undefined
  return { startDate: targetDate, endDate: nextEnd.toISOString().slice(0, 10), recurrence }
}

export function normalizeDateRange(startDate: string, endDate: string) {
  return toDate(startDate) <= toDate(endDate)
    ? { startDate, endDate }
    : { startDate: endDate, endDate: startDate }
}

export function getClosestActiveMonth(year: number, startDate: string, endDate: string) {
  const months = buildYearMonths(year, startDate, endDate)
  return months.find((month) => month.active)?.id ?? getMonthId(startDate)
}

export function getCurrentProjectMonthId(startDate: string, endDate: string) {
  const today = new Date()
  const todayId = formatMonthId(today.getUTCFullYear(), today.getUTCMonth())
  const projectMonths = getMonthIdsBetween(startDate, endDate)

  if (projectMonths.includes(todayId)) {
    return todayId
  }

  return projectMonths[0]
}
