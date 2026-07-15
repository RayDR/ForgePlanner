import type {
  Activity,
  MonthlyActivityEntry,
  MonthlyActivityStatus,
  MonthlySavingsEntry,
  Project,
} from '../types/roadmap'
import { getMonthId, getMonthIdsBetween, toDate } from './dateUtils'

export const monthlyStatusOrder: MonthlyActivityStatus[] = [
  'planned',
  'in-progress',
  'continued',
  'paused',
  'skipped',
  'resumed',
  'completed',
  'cancelled',
]

export const monthlyStatusMeta: Record<MonthlyActivityStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In progress',
  continued: 'Continued',
  paused: 'Paused',
  skipped: 'Skipped',
  resumed: 'Resumed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function isSavingsTrackingEnabled(project: Pick<Project, 'savingsPlan'>) {
  return project.savingsPlan.enabled === true
}

export function shouldShowMonthlySavings({
  savingsEnabled,
  insidePlanWindow,
  activityCount,
  target,
  actual,
  notes,
}: {
  savingsEnabled: boolean
  insidePlanWindow: boolean
  activityCount: number
  target: number
  actual: number
  notes?: string
}) {
  if (!savingsEnabled || !insidePlanWindow) return false
  const hasRegisteredSavings = target > 0 || actual > 0 || Boolean(notes?.trim())
  return activityCount > 0 || hasRegisteredSavings
}

export function getEffectiveMonthlySavingsTarget(project: Pick<Project, 'savingsPlan'>, monthId: string) {
  if (project.savingsPlan.mode !== 'monthly-target') return 0
  const entry = project.savingsPlan.monthlyEntries.find((candidate) => candidate.monthId === monthId)
  if (entry && (entry.target > 0 || Boolean(entry.updatedAt))) return entry.target
  return project.savingsPlan.defaultMonthlyTarget ?? 0
}

export function getActivityDisplayId(activity: Activity, project: Pick<Project, 'name'>, activities: Activity[]) {
  const words = project.name.match(/[A-Za-z0-9]+/g) ?? []
  const prefix = (words.length > 1 ? words.map((word) => word[0]).join('') : words[0]?.slice(0, 3) ?? 'TASK').slice(0, 4).toUpperCase()
  const fallbackPosition = [...activities].reverse().findIndex((candidate) => candidate.id === activity.id) + 1
  const sequence = activity.sequenceNumber ?? Math.max(1, fallbackPosition)
  return `${prefix}-${String(sequence).padStart(3, '0')}`
}

export function activityOccursOnDate(activity: Activity, date: string) {
  const occurrenceEnd = activity.recurrence?.endDate ?? activity.endDate ?? activity.startDate
  if (date < activity.startDate || date > occurrenceEnd) return false
  if (!activity.recurrence) return date <= (activity.endDate ?? activity.startDate)
  const start = new Date(`${activity.startDate}T00:00:00Z`)
  const current = new Date(`${date}T00:00:00Z`)
  const days = Math.floor((current.getTime() - start.getTime()) / 86400000)
  const activityEnd = new Date(`${activity.endDate ?? activity.startDate}T00:00:00Z`)
  const durationDays = Math.max(1, Math.floor((activityEnd.getTime() - start.getTime()) / 86400000) + 1)
  const months = (current.getUTCFullYear() - start.getUTCFullYear()) * 12 + current.getUTCMonth() - start.getUTCMonth()
  const followsAnchor = (anchor: Date) => {
    const offset = Math.floor((current.getTime() - anchor.getTime()) / 86400000)
    return offset >= 0 && offset < durationDays
  }
  const intervalAnchor = (intervalMonths: number) => {
    let occurrenceMonth = months - (months % intervalMonths)
    const buildAnchor = (offset: number) => {
      const year = start.getUTCFullYear()
      const month = start.getUTCMonth() + offset
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)))
    }
    let anchor = buildAnchor(occurrenceMonth)
    if (anchor > current) {
      occurrenceMonth -= intervalMonths
      anchor = buildAnchor(occurrenceMonth)
    }
    return followsAnchor(anchor)
  }
  switch (activity.recurrence.frequency) {
    case 'daily': return true
    case 'weekly': return days % 7 < durationDays
    case 'biweekly': return days % 14 < durationDays
    case 'fortnightly': {
      const anchors = [1, 15].map((day) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), day))).filter((anchor) => anchor <= current)
      if (!anchors.length) anchors.push(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 15)))
      return followsAnchor(anchors.at(-1)!)
    }
    case 'month-start': return followsAnchor(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)))
    case 'month-end': {
      let anchor = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0))
      if (anchor > current) anchor = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0))
      return followsAnchor(anchor)
    }
    case 'monthly': return intervalAnchor(1)
    case 'bimonthly': return intervalAnchor(2)
    case 'quarterly': return intervalAnchor(3)
    case 'semiannual': return intervalAnchor(6)
    case 'annual': return intervalAnchor(12)
  }
}

export function sortMonthIds(monthIds: string[]) {
  return [...monthIds].sort((left, right) => left.localeCompare(right))
}

export function getActivityMonthIds(activity: Pick<Activity, 'monthlyEntries'>) {
  return sortMonthIds(Object.keys(activity.monthlyEntries))
}

export function getMonthlyEntry(activity: Pick<Activity, 'monthlyEntries'>, monthId: string) {
  return activity.monthlyEntries[monthId]
}

export function hasMonthlyEntry(activity: Pick<Activity, 'monthlyEntries'>, monthId: string) {
  return Boolean(activity.monthlyEntries[monthId])
}

export function getLatestMonthlyEntry(activity: Pick<Activity, 'monthlyEntries'>) {
  const monthIds = getActivityMonthIds(activity)
  const latestMonthId = monthIds.at(-1)
  return latestMonthId ? activity.monthlyEntries[latestMonthId] : undefined
}

export function getActivityGlobalStatus(activity: Activity): MonthlyActivityStatus {  return getLatestMonthlyEntry(activity)?.status ?? 'planned'; }

export function getCalculatedActivityProgress(activity: Activity) {  if (activity.progressMode === 'weighted' && activity.subtasks.length) {    const totalPoints = activity.subtasks.reduce((sum, subtask) => sum + Math.max(1, subtask.weight ?? 1), 0);
    const completedPoints = activity.subtasks.reduce((sum, subtask) => sum + (subtask.completed ? Math.max(1, subtask.weight ?? 1) : 0), 0);
    return totalPoints ? Math.round((completedPoints / totalPoints) * 100) : 0;
  }
  return activity.statusId === 'done' || activity.statusId === 'completed' || getActivityGlobalStatus(activity) === 'completed' ? 100 : 0;
}

export function getActivityGlobalProgress(activity: Activity) {
  return getCalculatedActivityProgress(activity)
}

export function getActivityStatusForMonth(activity: Activity, monthId: string) {
  return activity.monthlyEntries[monthId]?.status
}

export function getActivityProgressForMonth(activity: Activity, monthId: string) {
  return activity.monthlyEntries[monthId] ? getCalculatedActivityProgress(activity) : 0
}

export function getRoadmapCellLabel(status?: MonthlyActivityStatus) {
  switch (status) {
    case 'planned':
    case 'in-progress':
    case 'continued':
      return '●'
    case 'skipped':
      return 'S'
    case 'paused':
      return 'P'
    case 'resumed':
      return 'R'
    case 'completed':
      return '✓'
    case 'cancelled':
      return 'X'
    default:
      return ''
  }
}

export function createMonthlyEntry(
  monthId: string,
  status: MonthlyActivityStatus,
  seed?: Partial<MonthlyActivityEntry>,
): MonthlyActivityEntry {
  return {
    monthId,
    status,
    progress: seed?.progress ?? (status === 'completed' ? 100 : status === 'in-progress' ? 55 : 0),
    estimatedHours: seed?.estimatedHours,
    actualHours: seed?.actualHours,
    notes: seed?.notes,
    isSkipped: seed?.isSkipped ?? status === 'skipped',
    isPaused: seed?.isPaused ?? status === 'paused',
    resumedFromMonthId: seed?.resumedFromMonthId,
    continuedFromMonthId: seed?.continuedFromMonthId,
    savingsImpact: seed?.savingsImpact,
    budgetImpact: seed?.budgetImpact,
  }
}

export function upsertMonthlyEntry(
  activity: Activity,
  monthId: string,
  status: MonthlyActivityStatus,
  seed?: Partial<MonthlyActivityEntry>,
) {
  return {
    ...activity,
    monthlyEntries: {
      ...activity.monthlyEntries,
      [monthId]: createMonthlyEntry(monthId, status, {
        ...activity.monthlyEntries[monthId],
        ...seed,
      }),
    },
  }
}

export function deleteMonthlyEntry(activity: Activity, monthId: string) {
  const monthlyEntries = { ...activity.monthlyEntries }
  delete monthlyEntries[monthId]
  return { ...activity, monthlyEntries }
}

export function copyMonthlyStructure(activity: Activity, sourceMonthId: string, targetMonthId: string) {
  const source = activity.monthlyEntries[sourceMonthId]
  if (!source) {
    return activity
  }

  return upsertMonthlyEntry(activity, targetMonthId, source.status, {
    ...source,
    monthId: targetMonthId,
  })
}

export function ensureActivityDateBounds(activity: Activity): Activity {
  const monthIds = getActivityMonthIds(activity)

  if (!monthIds.length) {
    return activity
  }

  const firstMonthId = monthIds[0]
  const lastMonthId = monthIds[monthIds.length - 1]
  const [startYear, startMonthIndex] = firstMonthId.split('-').map(Number)
  const [endYear, endMonthIndex] = lastMonthId.split('-').map(Number)
  const startDate = new Date(Date.UTC(startYear, startMonthIndex - 1, 1)).toISOString().slice(0, 10)
  const endDate = new Date(Date.UTC(endYear, endMonthIndex, 0)).toISOString().slice(0, 10)

  return {
    ...activity,
    startDate,
    endDate,
  }
}

export function getMonthlyEntriesWithinRange(activity: Activity) {
  const endDate = activity.endDate ?? activity.startDate
  return getMonthIdsBetween(activity.startDate, endDate)
    .map((monthId) => activity.monthlyEntries[monthId])
    .filter((entry): entry is MonthlyActivityEntry => Boolean(entry))
}

export function getActivityMonthsForYear(activity: Activity, year: number) {
  return getActivityMonthIds(activity).filter((monthId) => Number(monthId.slice(0, 4)) === year)
}

export function getActivityEntryCountByStatus(activity: Activity, status: MonthlyActivityStatus) {
  return Object.values(activity.monthlyEntries).filter((entry) => entry.status === status).length
}

export function computeSavingsPlanTargetTotal(entries: MonthlySavingsEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.target, 0)
}

export function getSavingsEntry(project: Project, monthId: string) {
  return project.savingsPlan.monthlyEntries.find((entry) => entry.monthId === monthId)
}

export function upsertSavingsEntry(project: Project, entry: MonthlySavingsEntry): Project {
  const existing = project.savingsPlan.monthlyEntries.filter((item) => item.monthId !== entry.monthId)
  const byMonthId = new Map(existing.map((item) => [item.monthId, item]))
  byMonthId.set(entry.monthId, entry)
  const monthlyEntries = sortMonthIds(Array.from(byMonthId.keys())).map((monthId) => byMonthId.get(monthId)!)

  return {
    ...project,
    savingsPlan: {
      ...project.savingsPlan,
      monthlyEntries,
      targetTotal: computeSavingsPlanTargetTotal(monthlyEntries),
    },
  }
}

export function getYearlySavingsTotals(project: Project, year: number) {
  const entries = project.savingsPlan.monthlyEntries.filter((entry) => Number(entry.monthId.slice(0, 4)) === year)
  const target = entries.reduce((sum, entry) => sum + entry.target, 0)
  const actual = entries.reduce((sum, entry) => sum + entry.actual, 0)

  return {
    target,
    actual,
    difference: actual - target,
  }
}

export function getProjectSavingsTotals(project: Project) {
  const target = project.savingsPlan.monthlyEntries.reduce((sum, entry) => sum + entry.target, 0)
  const actual = project.savingsPlan.monthlyEntries.reduce((sum, entry) => sum + entry.actual, 0)

  return {
    target,
    actual,
    remaining: Math.max(0, target - actual),
    difference: actual - target,
    progress: target ? Math.round((actual / target) * 100) : 0,
  }
}

export function isMonthWithinActivityWindow(activity: Activity, monthId: string) {
  const [year, month] = monthId.split('-').map(Number)
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const activityStart = toDate(activity.startDate)
  const activityEnd = toDate(activity.endDate ?? activity.startDate)
  const monthEnd = new Date(Date.UTC(year, month, 0))
  return monthEnd >= activityStart && monthStart <= activityEnd
}

export function getCurrentMonthEntry(activity: Activity) {
  return activity.monthlyEntries[getMonthId(new Date().toISOString().slice(0, 10))]
}
