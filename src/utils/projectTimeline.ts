import type { Activity, Project } from '../types/roadmap'

function monthEnd(monthId: string) {
  const [year, month] = monthId.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

export function contractProjectTimelineAfterRemoval(project: Project, activities: Activity[]) {
  const activityMonthIds = activities.flatMap((activity) => [
    ...Object.keys(activity.monthlyEntries),
    activity.startDate?.slice(0, 7),
    (activity.recurrence?.endDate ?? activity.endDate ?? activity.startDate)?.slice(0, 7),
  ].filter((monthId): monthId is string => Boolean(monthId)))
  const savingsMonthIds = project.savingsPlan.enabled === true
    ? project.savingsPlan.monthlyEntries
      .filter((entry) => entry.actual > 0 || entry.target > 0 || Boolean(entry.notes?.trim()))
      .map((entry) => entry.monthId)
    : []
  const remainingMonthIds = [...new Set([...activityMonthIds, ...savingsMonthIds])].sort()

  if (!remainingMonthIds.length) return project

  const firstRemainingDate = `${remainingMonthIds[0]}-01`
  const lastRemainingDate = monthEnd(remainingMonthIds.at(-1)!)
  const plannedStartDate = project.plannedStartDate
  const plannedEndDate = project.plannedEndDate ?? project.endDate
  const startDate = plannedStartDate && plannedStartDate < firstRemainingDate
    ? plannedStartDate
    : firstRemainingDate
  const endDate = plannedEndDate > lastRemainingDate ? plannedEndDate : lastRemainingDate

  return {
    ...project,
    startDate,
    endDate,
    actualEndDate: endDate,
  }
}

export function inferPlannedStartDate(project: Project, activities: Activity[]) {
  const earliestActivityMonth = activities
    .flatMap((activity) => [...Object.keys(activity.monthlyEntries), activity.startDate?.slice(0, 7)].filter((monthId): monthId is string => Boolean(monthId)))
    .sort()[0]
  return earliestActivityMonth ? `${earliestActivityMonth}-01` : project.startDate
}
