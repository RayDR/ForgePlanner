import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  northstarActivities,
  northstarProject,
  northstarRelationships,
  getCategoryMeta,
} from '../data/northstarMockData'
import type {
  Activity,
  ActivityColorKey,
  ActivityDraft,
  ActivityRelationship,
  ActivityStatusDefinition,
  ActivityTrashItem,
  CategoryKey,
  Comment,
  MonthlyActivityEntry,
  MonthlyActivityStatus,
  Project,
} from '../types/roadmap'
import { getClosestActiveMonth, normalizeDateRange } from '../utils/dateUtils'
import { resolveMonthForYear } from '../utils/monthSelection'
import { createIdentityScopedStorage } from '../persistence/scopedStorage'
import { contractProjectTimelineAfterRemoval, inferPlannedStartDate } from '../utils/projectTimeline'
import {
  type MigrationIssue,
  type PendingMonthlyChange,
  type PersistedRoadmapState,
  ACTIVITY_COLOR_KEYS,
  DEFAULT_PROJECT_STATUSES,
  applyAddMonthlyEntry,
  applyCancelMonth,
  applyCompleteMonth,
  applyContinueToMonth,
  applyCopyMonthlyStructure,
  applyPauseMonth,
  applyPendingMonthlyChange,
  applyResumeInMonth,
  applySkipMonth,
  createPendingMonthlyChange,
  deriveRelationshipsFromActivities,
  appendActivityHistory,
  isValidLegacyPersistedState,
  isValidNewPersistedState,
  migrateLegacyPersistedState,
  updateMonthlyEntry as applyMonthlyEntryUpdate,
  updateProjectSavingsEntry,
} from '../utils/roadmapState'

interface RoadmapState {
  schemaVersion: number
  project: Project
  activities: Activity[]
  trash: ActivityTrashItem[]
  relationships: ActivityRelationship[]
  selectedYear: number
  selectedMonthId: string
  activeActivityId: string | null
  pendingMove: PendingMonthlyChange | null
  migrationIssue: MigrationIssue | null
  locale: 'en' | 'es'
  theme: 'light' | 'dark'
  setSelectedYear: (year: number) => void
  setSelectedMonthId: (monthId: string) => void
  setSelectedPeriod: (monthId: string) => void
  setLocale: (locale: 'en' | 'es') => void
  setTheme: (theme: 'light' | 'dark') => void
  dismissMigrationIssue: () => void
  openActivity: (activityId: string) => void
  closeActivity: () => void
  updateActivity: (activityId: string, updates: Partial<Activity>) => void
  updateProjectDetails: (updates: { name?: string; objective?: string; startDate?: string; endDate?: string }) => void
  setActivityStatus: (activityId: string, statusId: string) => void
  createProjectStatus: (status: { label: string; colorKey: ActivityColorKey }) => void
  updateProjectStatus: (statusId: string, updates: Partial<Pick<ActivityStatusDefinition, 'label' | 'colorKey' | 'order'>>) => void
  reorderProjectStatuses: (orderedStatusIds: string[]) => void
  createActivity: (draft: ActivityDraft) => void
  updateMonthlyEntry: (
    activityId: string,
    monthId: string,
    updates: Partial<MonthlyActivityEntry> & { status?: MonthlyActivityStatus },
  ) => void
  addMonthlyEntry: (activityId: string, monthId: string, status?: MonthlyActivityStatus) => void
  removeMonthlyEntry: (activityId: string, monthId: string) => void
  continueActivityNextMonth: (activityId: string, sourceMonthId: string) => void
  continueActivityInMonth: (activityId: string, sourceMonthId: string, targetMonthId: string) => void
  skipActivityMonth: (activityId: string, monthId: string, nextMonthId?: string) => void
  pauseActivityMonth: (activityId: string, monthId: string) => void
  resumeActivityInMonth: (activityId: string, sourceMonthId: string, targetMonthId: string) => void
  completeActivityMonth: (activityId: string, monthId: string) => void
  cancelActivityMonth: (activityId: string, monthId: string) => void
  copyMonthlyStructure: (activityId: string, sourceMonthId: string, targetMonthId: string) => void
  moveMonthlyEntry: (activityId: string, sourceMonthId: string, targetMonthId: string) => void
  confirmPendingMove: (includeSuggested: boolean) => void
  cancelPendingMove: () => void
  addSubtask: (activityId: string, title: string) => void
  editSubtask: (activityId: string, subtaskId: string, title: string) => void
  toggleSubtask: (activityId: string, subtaskId: string, completed: boolean) => void
  updateSubtaskWeight: (activityId: string, subtaskId: string, weight: number) => void
  deleteSubtask: (activityId: string, subtaskId: string) => void
  reorderSubtasks: (activityId: string, orderedSubtaskIds: string[]) => void
  addComment: (activityId: string, comment: Omit<Comment, 'id' | 'createdAt'>) => void
  deleteComment: (activityId: string, commentId: string) => void
  softDeleteActivity: (activityId: string) => void
  restoreActivity: (activityId: string) => void
  purgeExpiredTrash: () => void
  updateSavingsEntry: (monthId: string, target: number, actual: number, notes?: string) => void
  exportStateAsJson: () => string
  exportSnapshot: () => PersistedRoadmapState
  loadSnapshot: (snapshot: PersistedRoadmapState) => void
  importStateFromJson: (jsonText: string) => { ok: true } | { ok: false; error: string }
  exportActivitiesAsExcelCsv: () => string
  importActivitiesFromExcelCsv: (csvText: string) => { ok: true } | { ok: false; error: string }
}

const STORE_VERSION = 7

function createDefaultPersistedState(): PersistedRoadmapState {
  return {
    schemaVersion: STORE_VERSION,
    project: northstarProject,
    activities: northstarActivities,
    trash: [],
    relationships: northstarRelationships,
    selectedYear: northstarProject.selectedYear,
    selectedMonthId: getClosestActiveMonth(
      northstarProject.selectedYear,
      northstarProject.startDate,
      northstarProject.endDate,
    ),
    locale: 'es',
    theme: 'light',
  }
}

function nextTrashExpiryIso() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
}

function normalizeStatusDefinitions(statusDefinitions: ActivityStatusDefinition[]) {
  return [...statusDefinitions]
    .sort((left, right) => left.order - right.order)
    .map((status, index) => ({ ...status, order: index }))
}

function defaultColorByCategory(category: string): ActivityColorKey {
  if (category === 'savings' || category === 'health' || category === 'family-lifestyle' || category === 'portfolio') {
    return 'green'
  }

  if (category === 'english' || category === 'certifications') {
    return 'amber'
  }

  if (category === 'risk-catchup') {
    return 'rose'
  }

  if (category === 'immigration' || category === 'ai-llms' || category === 'aws-cloud') {
    return 'blue'
  }

  return 'slate'
}

function monthIdToStartDate(monthId: string) {
  return `${monthId}-01`
}

function monthIdToEndDate(monthId: string) {
  const [year, month] = monthId.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function extendProjectTimelineIfNeeded(project: Project, activities: Activity[]) {
  const monthIds = activities.flatMap((activity) => [
    ...Object.keys(activity.monthlyEntries),
    activity.startDate.slice(0, 7),
    (activity.recurrence?.endDate ?? activity.endDate ?? activity.startDate).slice(0, 7),
  ]).sort((left, right) => left.localeCompare(right))
  const earliestMonthId = monthIds[0]
  const latestMonthId = monthIds.at(-1)

  if (!earliestMonthId || !latestMonthId) {
    return project
  }

  const earliestStartDate = monthIdToStartDate(earliestMonthId)
  const latestEndDate = monthIdToEndDate(latestMonthId)
  const plannedEndDate = project.plannedEndDate ?? project.endDate
  const currentActualEndDate = project.actualEndDate ?? project.endDate
  const nextActualEndDate = currentActualEndDate > latestEndDate ? currentActualEndDate : latestEndDate

  return {
    ...project,
    startDate: earliestStartDate < project.startDate ? earliestStartDate : project.startDate,
    plannedEndDate,
    actualEndDate: nextActualEndDate,
    endDate: nextActualEndDate,
  }
}

function updateProjectAfterActivityChange(project: Project, activities: Activity[]) {
  return extendProjectTimelineIfNeeded(project, activities)
}

function upgradePersistedState(candidate: PersistedRoadmapState): PersistedRoadmapState {
  const statusDefinitions = normalizeStatusDefinitions(candidate.project.statusDefinitions ?? DEFAULT_PROJECT_STATUSES)

  const upgradedActivities = candidate.activities.map((activity, index) => ({
    ...activity,
    colorKey: activity.colorKey ?? defaultColorByCategory(activity.category),
    statusId: activity.statusId ?? 'planned',
    sequenceNumber: activity.sequenceNumber ?? candidate.activities.length - index,
    history: activity.history ?? [],
    progressMode: activity.progressMode ?? 'completion',
    subtasks: (activity.subtasks ?? []).map((subtask) => ({ ...subtask, weight: subtask.weight ?? (subtask as typeof subtask & { storyPoints?: number }).storyPoints ?? 1 })),
  }))
  const projectWithPlannedStart = {
    ...candidate.project,
    plannedStartDate: candidate.project.plannedStartDate ?? inferPlannedStartDate(candidate.project, upgradedActivities),
    statusDefinitions,
    categoryDefinitions: (candidate.project.categoryDefinitions ?? [...new Map(
      upgradedActivities.map((activity) => {
        const metadata = getCategoryMeta(activity.category)
        return [activity.category, { ...metadata, key: activity.category }]
      }),
    ).values()]).map((category, index, categories) => ({ ...category, isDefault: category.isDefault ?? (!categories.some((item) => item.isDefault) && index === 0) })),
  }
  const upgradedProject = candidate.project.plannedStartDate
    ? projectWithPlannedStart
    : contractProjectTimelineAfterRemoval(projectWithPlannedStart, upgradedActivities)

  return {
    ...candidate,
    schemaVersion: STORE_VERSION,
    trash: candidate.trash ?? [],
    project: upgradedProject,
    activities: upgradedActivities,
  }
}

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}

function getNextMonthId(monthId: string) {
  const [year, month] = monthId.split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

function resolveImportedState(parsed: unknown): PersistedRoadmapState | null {
  if (isValidNewPersistedState(parsed)) {
    return upgradePersistedState(parsed)
  }

  if (isValidLegacyPersistedState(parsed)) {
    return migrateLegacyPersistedState(parsed, STORE_VERSION)
  }

  return null
}

function createMigrationIssue(persistedState: unknown): MigrationIssue {
  const backupJson = (() => {
    try { return JSON.stringify(persistedState, null, 2) }
    catch { return '{"error":"Could not serialize legacy localStorage state."}' }
  })()

  return {
    message: 'A previous planner schema could not be migrated safely. Export the backup before resetting.',
    backupJson,
  }
}

function withActivityUpdate(activities: Activity[], activityId: string, updater: (activity: Activity) => Activity) {
  return activities.map((activity) => (activity.id === activityId ? updater(activity) : activity))
}

function applyDirectMonthlyAction(
  activity: Activity,
  action: PendingMonthlyChange['action'],
  sourceMonthId: string,
  targetMonthId: string,
) {
  switch (action) {
    case 'continue':
      return applyContinueToMonth(activity, sourceMonthId, targetMonthId)
    case 'resume':
      return applyResumeInMonth(activity, sourceMonthId, targetMonthId)
    case 'copy':
      return applyCopyMonthlyStructure(activity, sourceMonthId, targetMonthId)
    case 'add':
      return applyAddMonthlyEntry(activity, targetMonthId)
  }
}

function historyTypeForAction(action: PendingMonthlyChange['action']) {
  switch (action) {
    case 'continue':
      return 'month-changed' as const
    case 'resume':
      return 'resumed' as const
    case 'copy':
      return 'month-changed' as const
    case 'add':
      return 'month-changed' as const
  }
}

function setPendingOrApply(
  state: Pick<RoadmapState, 'activities'>,
  source: Activity,
  sourceMonthId: string,
  targetMonthId: string,
  action: PendingMonthlyChange['action'],
) {
  const pendingMove = createPendingMonthlyChange(state.activities, source, sourceMonthId, targetMonthId, action)

  if (!pendingMove) {
    return {
      pendingMove: null,
      activities: withActivityUpdate(state.activities, source.id, (activity) =>
        appendActivityHistory(applyDirectMonthlyAction(activity, action, sourceMonthId, targetMonthId), {
          type: historyTypeForAction(action),
          message: `${action} monthly entry from ${sourceMonthId} to ${targetMonthId}`,
          monthId: targetMonthId,
        }),
      ),
      selectedMonthId: targetMonthId,
      selectedYear: Number(targetMonthId.slice(0, 4)),
    }
  }

  return { pendingMove }
}

export const useRoadmapStore = create<RoadmapState>()(
  persist(
    (set, get) => ({
      ...createDefaultPersistedState(),
      activeActivityId: null,
      pendingMove: null,
      migrationIssue: null,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      dismissMigrationIssue: () => set({ migrationIssue: null }),
      setSelectedYear: (year) => {
        const project = get().project
        const nextMonthId = resolveMonthForYear(get().selectedMonthId, year, project.startDate, project.endDate)
        set({
          selectedYear: year,
          selectedMonthId: nextMonthId,
        })
      },
      setSelectedMonthId: (monthId) => set({ selectedMonthId: monthId }),
      setSelectedPeriod: (monthId) => set({
        selectedYear: Number(monthId.slice(0, 4)),
        selectedMonthId: monthId,
      }),
      openActivity: (activityId) => set({ activeActivityId: activityId }),
      closeActivity: () => set({ activeActivityId: null }),
      updateActivity: (activityId, updates) => {
        set((state) => ({
          activities: state.activities.map((activity) => {
            if (activity.id !== activityId) {
              return activity
            }

            const nextActivity = appendActivityHistory(
              {
                ...activity,
                ...updates,
              },
              {
                type: 'edited',
                message: 'Activity edited',
              },
            )
            if (updates.startDate || updates.endDate) {
              const normalized = normalizeDateRange(nextActivity.startDate, nextActivity.endDate ?? nextActivity.startDate)
              return { ...nextActivity, ...normalized }
            }

            return nextActivity
          }),
          project: updates.startDate || updates.endDate ? updateProjectAfterActivityChange(state.project, state.activities.map((activity) => (activity.id === activityId ? { ...activity, ...updates } : activity))) : state.project,
        }))
      },
      updateProjectDetails: (updates) => {
        set((state) => {
          const startDate = updates.startDate ?? state.project.startDate
          const endDate = updates.endDate ?? state.project.endDate
          const normalized = normalizeDateRange(startDate, endDate)

          return {
            project: {
              ...state.project,
              ...updates,
              ...normalized,
              plannedStartDate: updates.startDate ? normalized.startDate : state.project.plannedStartDate,
              plannedEndDate: updates.endDate ? normalized.endDate : state.project.plannedEndDate ?? state.project.endDate,
              actualEndDate: state.project.actualEndDate ?? normalized.endDate,
            },
          }
        })
      },
      setActivityStatus: (activityId, statusId) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              {
                ...activity,
                statusId,
              },
              {
                type: 'status-changed',
                message: `Activity status changed to ${statusId}`,
              },
            ),
          ),
        }))
      },
      createProjectStatus: (status) => {
        set((state) => {
          const nextStatus: ActivityStatusDefinition = {
            id: `custom-${crypto.randomUUID()}`,
            label: status.label.trim(),
            colorKey: ACTIVITY_COLOR_KEYS.includes(status.colorKey) ? status.colorKey : 'slate',
            order: state.project.statusDefinitions.length,
          }

          return {
            project: {
              ...state.project,
              statusDefinitions: normalizeStatusDefinitions([...state.project.statusDefinitions, nextStatus]),
            },
          }
        })
      },
      updateProjectStatus: (statusId, updates) => {
        set((state) => ({
          project: {
            ...state.project,
            statusDefinitions: normalizeStatusDefinitions(
              state.project.statusDefinitions.map((status) =>
                status.id === statusId
                  ? {
                      ...status,
                      ...updates,
                      colorKey:
                        updates.colorKey && ACTIVITY_COLOR_KEYS.includes(updates.colorKey)
                          ? updates.colorKey
                          : status.colorKey,
                    }
                  : status,
              ),
            ),
          },
        }))
      },
      reorderProjectStatuses: (orderedStatusIds) => {
        set((state) => {
          const byId = new Map(state.project.statusDefinitions.map((status) => [status.id, status]))
          const reordered = orderedStatusIds
            .map((statusId) => byId.get(statusId))
            .filter((status): status is ActivityStatusDefinition => Boolean(status))

          return {
            project: {
              ...state.project,
              statusDefinitions: normalizeStatusDefinitions(reordered),
            },
          }
        })
      },
      createActivity: (draft) => {
        const normalized = normalizeDateRange(draft.startDate, draft.endDate)
        const newActivity: Activity = {
          id: crypto.randomUUID(),
          sequenceNumber: Math.max(0, ...get().activities.map((activity) => activity.sequenceNumber ?? 0)) + 1,
          recurrence: draft.recurrence,
          title: draft.title,
          category: draft.category,
          description: draft.description,
          comments: [],
          subtasks: draft.subtasks.map((title) => ({ id: crypto.randomUUID(), title, completed: false })),
          priority: draft.priority,
          relationshipMode: draft.relationshipMode,
          notes: draft.notes,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
          estimatedHours: draft.estimatedHours,
          linkedActivityIds: draft.linkedActivityIds,
          dependencyIds: draft.dependencyIds,
          parentGoalId: draft.parentGoalId,
          sequenceGroupId: draft.sequenceGroupId,
          milestone: draft.milestone,
          colorKey: get().project.categoryDefinitions?.find((category) => category.key === draft.category)?.tone ?? defaultColorByCategory(draft.category),
          statusId: draft.initialStatus === 'completed' ? 'done' : draft.initialStatus === 'cancelled' ? 'blocked' : draft.initialStatus === 'paused' ? 'paused' : draft.initialStatus === 'in-progress' ? 'in-progress' : 'planned',
          budgetImpact: draft.budgetImpact,
          savingsImpact: draft.savingsImpact,
          history: [
            {
              id: crypto.randomUUID(),
              activityId: '',
              type: 'created',
              message: 'Activity created',
              occurredAt: new Date().toISOString(),
            },
          ],
          monthlyEntries: {
            [draft.firstMonthId]: {
              monthId: draft.firstMonthId,
              status: draft.initialStatus,
              progress: draft.initialStatus === 'completed' ? 100 : draft.initialStatus === 'in-progress' ? 55 : 0,
              estimatedHours: draft.estimatedHours,
              savingsImpact: draft.savingsImpact,
              budgetImpact: draft.budgetImpact,
              isSkipped: draft.initialStatus === 'skipped',
              isPaused: draft.initialStatus === 'paused',
            },
          },
        }

        newActivity.history[0].activityId = newActivity.id

        set((state) => ({
          activities: [newActivity, ...state.activities],
          relationships: deriveRelationshipsFromActivities([newActivity, ...state.activities]),
          project: updateProjectAfterActivityChange(state.project, [newActivity, ...state.activities]),
          selectedMonthId: draft.firstMonthId,
          selectedYear: Number(draft.firstMonthId.slice(0, 4)),
        }))
      },
      updateMonthlyEntry: (activityId, monthId, updates) => {
        set((state) => ({
          activities: (() => {
            const nextActivities = withActivityUpdate(state.activities, activityId, (activity) =>
              appendActivityHistory(
                applyMonthlyEntryUpdate(activity, monthId, updates),
                {
                  type: 'month-changed',
                  message: `Monthly entry updated for ${monthId}`,
                  monthId,
                },
              ),
            )
            return nextActivities
          })(),
          project: updateProjectAfterActivityChange(state.project, withActivityUpdate(state.activities, activityId, (activity) => applyMonthlyEntryUpdate(activity, monthId, updates))),
        }))
      },
      addMonthlyEntry: (activityId, monthId, status = 'planned') => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(applyAddMonthlyEntry(activity, monthId, status), {
              type: 'month-changed',
              message: `Monthly entry added for ${monthId}`,
              monthId,
            }),
          ),
          project: updateProjectAfterActivityChange(state.project, withActivityUpdate(state.activities, activityId, (activity) => applyAddMonthlyEntry(activity, monthId, status))),
          selectedMonthId: monthId,
          selectedYear: Number(monthId.slice(0, 4)),
        }))
      },
      removeMonthlyEntry: (activityId, monthId) => {
        set((state) => {
          const activities = withActivityUpdate(state.activities, activityId, (activity) => {
            const monthlyEntries = { ...activity.monthlyEntries }
            delete monthlyEntries[monthId]
            return appendActivityHistory(
              { ...activity, monthlyEntries },
              { type: 'monthly-entry-updated', monthId, message: `Monthly entry removed from ${monthId}` },
            )
          })
          return {
            activities,
            project: contractProjectTimelineAfterRemoval(state.project, activities),
          }
        })
      },
      continueActivityNextMonth: (activityId, sourceMonthId) => {
        get().continueActivityInMonth(activityId, sourceMonthId, getNextMonthId(sourceMonthId))
      },
      continueActivityInMonth: (activityId, sourceMonthId, targetMonthId) => {
        const state = get()
        const source = state.activities.find((activity) => activity.id === activityId)

        if (!source) {
          return
        }

        set(setPendingOrApply(state, source, sourceMonthId, targetMonthId, 'continue'))
      },
      skipActivityMonth: (activityId, monthId, nextMonthId) => {
        const updatedMonthId = nextMonthId ?? monthId
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(applySkipMonth(activity, monthId, nextMonthId), {
              type: 'skipped',
              message: `Month ${monthId} skipped`,
              monthId,
            }),
          ),
          project: updateProjectAfterActivityChange(state.project, withActivityUpdate(state.activities, activityId, (activity) => applySkipMonth(activity, monthId, nextMonthId))),
          selectedMonthId: updatedMonthId,
          selectedYear: Number(updatedMonthId.slice(0, 4)),
        }))
      },
      pauseActivityMonth: (activityId, monthId) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(applyPauseMonth(activity, monthId), {
              type: 'paused',
              message: `Month ${monthId} paused`,
              monthId,
            }),
          ),
          project: updateProjectAfterActivityChange(state.project, withActivityUpdate(state.activities, activityId, (activity) => applyPauseMonth(activity, monthId))),
        }))
      },
      resumeActivityInMonth: (activityId, sourceMonthId, targetMonthId) => {
        const state = get()
        const source = state.activities.find((activity) => activity.id === activityId)

        if (!source) {
          return
        }

        set(setPendingOrApply(state, source, sourceMonthId, targetMonthId, 'resume'))
      },
      completeActivityMonth: (activityId, monthId) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(applyCompleteMonth(activity, monthId), {
              type: 'month-changed',
              message: `Month ${monthId} completed`,
              monthId,
            }),
          ),
          project: updateProjectAfterActivityChange(state.project, withActivityUpdate(state.activities, activityId, (activity) => applyCompleteMonth(activity, monthId))),
        }))
      },
      cancelActivityMonth: (activityId, monthId) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(applyCancelMonth(activity, monthId), {
              type: 'skipped',
              message: `Month ${monthId} cancelled`,
              monthId,
            }),
          ),
          project: updateProjectAfterActivityChange(state.project, withActivityUpdate(state.activities, activityId, (activity) => applyCancelMonth(activity, monthId))),
        }))
      },
      copyMonthlyStructure: (activityId, sourceMonthId, targetMonthId) => {
        const state = get()
        const source = state.activities.find((activity) => activity.id === activityId)

        if (!source) {
          return
        }

        set(setPendingOrApply(state, source, sourceMonthId, targetMonthId, 'copy'))
      },
      moveMonthlyEntry: (activityId, sourceMonthId, targetMonthId) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) => {
            const dependencyTitle = state.activities
              .filter((candidate) => activity.dependencyIds.includes(candidate.id))
              .find((dependency) => {
                const monthIds = Object.keys(dependency.monthlyEntries).sort()
                const latestMonthId = monthIds.at(-1)
                return Boolean(latestMonthId && latestMonthId > targetMonthId)
              })?.title

            if (dependencyTitle) {
              return appendActivityHistory(activity, {
                type: 'dependency-blocked-move',
                message: `Move blocked by dependency: ${dependencyTitle}`,
                monthId: sourceMonthId,
              })
            }

            const source = activity.monthlyEntries[sourceMonthId]
            if (!source || sourceMonthId === targetMonthId) {
              return activity
            }

            const monthlyEntries = { ...activity.monthlyEntries }
            monthlyEntries[targetMonthId] = {
              ...source,
              monthId: targetMonthId,
            }
            delete monthlyEntries[sourceMonthId]

            return appendActivityHistory(
              {
                ...activity,
                monthlyEntries,
              },
              {
                type: 'month-changed',
                message: `Monthly entry moved from ${sourceMonthId} to ${targetMonthId}`,
                monthId: targetMonthId,
              },
            )
          }),
          project: updateProjectAfterActivityChange(state.project, withActivityUpdate(state.activities, activityId, (activity) => {
            const source = activity.monthlyEntries[sourceMonthId]
            if (!source || sourceMonthId === targetMonthId) {
              return activity
            }

            const monthlyEntries = { ...activity.monthlyEntries }
            monthlyEntries[targetMonthId] = {
              ...source,
              monthId: targetMonthId,
            }
            delete monthlyEntries[sourceMonthId]
            return { ...activity, monthlyEntries }
          })),
          selectedMonthId: targetMonthId,
          selectedYear: Number(targetMonthId.slice(0, 4)),
        }))
      },
      confirmPendingMove: (includeSuggested) => {
        const state = get()

        if (!state.pendingMove) {
          return
        }

        set({
          activities: applyPendingMonthlyChange(state.activities, state.pendingMove, includeSuggested),
          selectedMonthId: state.pendingMove.targetMonthId,
          selectedYear: Number(state.pendingMove.targetMonthId.slice(0, 4)),
          pendingMove: null,
          project: updateProjectAfterActivityChange(state.project, applyPendingMonthlyChange(state.activities, state.pendingMove, includeSuggested)),
        })
      },
      cancelPendingMove: () => set({ pendingMove: null }),
      addSubtask: (activityId, title) => {
        const nextTitle = title.trim()
        if (!nextTitle) {
          return
        }

        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              {
                ...activity,
                subtasks: [...activity.subtasks, { id: crypto.randomUUID(), title: nextTitle, completed: false, weight: 1 }],
              },
              {
                type: 'subtask-created',
                message: `Subtask created: ${nextTitle}`,
              },
            ),
          ),
        }))
      },
      editSubtask: (activityId, subtaskId, title) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              {
                ...activity,
                subtasks: activity.subtasks.map((subtask) =>
                  subtask.id === subtaskId ? { ...subtask, title: title.trim() || subtask.title } : subtask,
                ),
              },
              {
                type: 'subtask-updated',
                message: 'Subtask edited',
              },
            ),
          ),
        }))
      },
      updateSubtaskWeight: (activityId, subtaskId, weight) => {
        const nextPoints = Math.max(1, Math.round(weight || 1))
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              { ...activity, subtasks: activity.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, weight: nextPoints } : subtask) },
              { type: 'subtask-updated', message: 'Subtask weight changed to ' + nextPoints },
            ),
          ),
        }))
      },
      toggleSubtask: (activityId, subtaskId, completed) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              {
                ...activity,
                subtasks: activity.subtasks.map((subtask) =>
                  subtask.id === subtaskId ? { ...subtask, completed } : subtask,
                ),
              },
              {
                type: 'subtask-completed',
                message: completed ? 'Subtask completed' : 'Subtask reopened',
              },
            ),
          ),
        }))
      },
      deleteSubtask: (activityId, subtaskId) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              {
                ...activity,
                subtasks: activity.subtasks.filter((subtask) => subtask.id !== subtaskId),
              },
              {
                type: 'subtask-deleted',
                message: 'Subtask deleted',
              },
            ),
          ),
        }))
      },
      reorderSubtasks: (activityId, orderedSubtaskIds) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) => {
            const byId = new Map(activity.subtasks.map((subtask) => [subtask.id, subtask]))
            const reordered = orderedSubtaskIds
              .map((subtaskId) => byId.get(subtaskId))
              .filter((subtask): subtask is Activity['subtasks'][number] => Boolean(subtask))

            return appendActivityHistory(
              {
                ...activity,
                subtasks: reordered,
              },
              {
                type: 'subtask-reordered',
                message: 'Subtasks reordered',
              },
            )
          }),
        }))
      },
      addComment: (activityId, comment) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              {
                ...activity,
                comments: [
                  ...activity.comments,
                  {
                    id: crypto.randomUUID(),
                    author: comment.author,
                    message: comment.message,
                    createdAt: new Date().toISOString(),
                  },
                ],
              },
              {
                type: 'comment-added',
                message: 'Comment added',
              },
            ),
          ),
        }))
      },
      deleteComment: (activityId, commentId) => {
        set((state) => ({
          activities: withActivityUpdate(state.activities, activityId, (activity) =>
            appendActivityHistory(
              {
                ...activity,
                comments: activity.comments.filter((comment) => comment.id !== commentId),
              },
              {
                type: 'comment-deleted',
                message: 'Comment deleted',
              },
            ),
          ),
        }))
      },
      softDeleteActivity: (activityId) => {
        set((state) => {
          const activity = state.activities.find((item) => item.id === activityId)
          if (!activity) {
            return state
          }

          const deletedAt = new Date().toISOString()
          const trashItem: ActivityTrashItem = {
            activity: appendActivityHistory(activity, {
              type: 'deleted',
              message: 'Activity moved to trash',
            }),
            deletedAt,
            expiresAt: nextTrashExpiryIso(),
          }

          return {
            activities: state.activities.filter((item) => item.id !== activityId),
            project: contractProjectTimelineAfterRemoval(
              state.project,
              state.activities.filter((item) => item.id !== activityId),
            ),
            trash: [...state.trash.filter((item) => item.activity.id !== activityId), trashItem],
            activeActivityId: state.activeActivityId === activityId ? null : state.activeActivityId,
          }
        })
      },
      restoreActivity: (activityId) => {
        set((state) => {
          const trashItem = state.trash.find((item) => item.activity.id === activityId)
          if (!trashItem) {
            return state
          }

          const activities = [
              appendActivityHistory(trashItem.activity, {
                type: 'restored',
                message: 'Activity restored from trash',
              }),
              ...state.activities,
            ]
          return {
            activities,
            project: updateProjectAfterActivityChange(state.project, activities),
            trash: state.trash.filter((item) => item.activity.id !== activityId),
          }
        })
      },
      purgeExpiredTrash: () => {
        set((state) => ({
          trash: state.trash.filter((item) => new Date(item.expiresAt).getTime() > Date.now()),
        }))
      },
      updateSavingsEntry: (monthId, target, actual, notes) => {
        set((state) => {
          const monthStart = monthIdToStartDate(monthId)
          const monthEnd = monthIdToEndDate(monthId)
          const projectWithEntry = updateProjectSavingsEntry(state.project, {
            monthId,
            target,
            actual,
            notes,
            updatedAt: new Date().toISOString(),
          })
          const activatesMonth = target > 0 || actual > 0 || Boolean(notes?.trim())
          if (!activatesMonth) return { project: projectWithEntry }
          return {
            project: {
              ...projectWithEntry,
              startDate: monthStart < projectWithEntry.startDate ? monthStart : projectWithEntry.startDate,
              endDate: monthEnd > projectWithEntry.endDate ? monthEnd : projectWithEntry.endDate,
              actualEndDate: monthEnd > (projectWithEntry.actualEndDate ?? projectWithEntry.endDate)
                ? monthEnd
                : projectWithEntry.actualEndDate,
            },
          }
        })
      },
      exportStateAsJson: () => {
        const state = get()
        const payload: PersistedRoadmapState = {
          schemaVersion: STORE_VERSION,
          project: state.project,
          activities: state.activities,
          trash: state.trash,
          relationships: state.relationships,
          selectedYear: state.selectedYear,
          selectedMonthId: state.selectedMonthId,
          locale: state.locale,
          theme: state.theme,
        }

        return JSON.stringify(payload, null, 2)
      },
      exportSnapshot: () => {
        const state = get()
        return {
          schemaVersion: STORE_VERSION,
          project: state.project,
          activities: state.activities,
          trash: state.trash,
          relationships: state.relationships,
          selectedYear: state.selectedYear,
          selectedMonthId: state.selectedMonthId,
          locale: state.locale,
          theme: state.theme,
        }
      },
      loadSnapshot: (snapshot) => {
        const candidate = resolveImportedState(snapshot)
        if (!candidate) {
          return
        }

        set({
          ...candidate,
          pendingMove: null,
          activeActivityId: null,
          migrationIssue: null,
        })
      },
      importStateFromJson: (jsonText) => {
        try {
          const parsed = JSON.parse(jsonText) as unknown
          const candidate = resolveImportedState(parsed)

          if (!candidate) {
            return { ok: false as const, error: 'Invalid JSON schema for NorthStar planner import.' }
          }

          set({
            ...candidate,
            pendingMove: null,
            activeActivityId: null,
            migrationIssue: null,
          })

          return { ok: true as const }
        } catch {
          return { ok: false as const, error: 'Could not parse JSON file.' }
        }
      },
      exportActivitiesAsExcelCsv: () => {
        const headers = [
          'id',
          'title',
          'description',
          'category',
          'priority',
          'relationshipMode',
          'colorKey',
          'statusId',
          'startDate',
          'endDate',
          'estimatedHours',
          'parentGoalId',
          'linkedActivityIds',
          'dependencyIds',
          'sequenceGroupId',
          'milestone',
          'budgetImpact',
          'savingsImpact',
          'notes',
          'subtasks',
          'comments',
          'history',
          'monthlyEntries',
        ]

        const rows = get().activities.map((activity) => [
          activity.id,
          activity.title,
          activity.description,
          activity.category,
          activity.priority,
          activity.relationshipMode,
          activity.colorKey,
          activity.statusId,
          activity.startDate,
          activity.endDate ?? '',
          activity.estimatedHours?.toString() ?? '',
          activity.parentGoalId ?? '',
          activity.linkedActivityIds.join('|'),
          activity.dependencyIds.join('|'),
          activity.sequenceGroupId ?? '',
          String(activity.milestone),
          activity.budgetImpact?.toString() ?? '',
          activity.savingsImpact?.toString() ?? '',
          activity.notes,
          activity.subtasks.map((item) => item.title).join('|'),
          JSON.stringify(activity.comments),
          JSON.stringify(activity.history),
          JSON.stringify(activity.monthlyEntries),
        ])

        return [headers.join(','), ...rows.map((row) => row.map((value) => csvEscape(value)).join(','))].join('\n')
      },
      importActivitiesFromExcelCsv: (csvText) => {
        try {
          const lines = csvText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)

          if (lines.length < 2) {
            return { ok: false as const, error: 'CSV must include header and at least one activity row.' }
          }

          const headers = parseCsvLine(lines[0])
          const required = ['id', 'title', 'category', 'priority', 'relationshipMode', 'startDate']

          if (!required.every((field) => headers.includes(field))) {
            return { ok: false as const, error: 'CSV missing required columns for activity import.' }
          }

          const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>
          const activities: Activity[] = lines.slice(1).map((line) => {
            const cells = parseCsvLine(line)
            const read = (header: string) => cells[indexByHeader[header]] ?? ''
            const toList = (value: string) => value.split('|').map((item) => item.trim()).filter(Boolean)

            const monthlyEntriesText = read('monthlyEntries')
            const targetMonth = read('targetMonth')
            const legacyStatus = read('status')
            const monthlyEntries = monthlyEntriesText
              ? (JSON.parse(monthlyEntriesText) as Activity['monthlyEntries'])
              : targetMonth
              ? {
                  [targetMonth]: {
                    monthId: targetMonth,
                    status: (legacyStatus === 'completed' ? 'completed' : 'planned') as MonthlyActivityStatus,
                    progress: legacyStatus === 'completed' ? 100 : 0,
                  },
                }
              : {}

            return {
              id: read('id'),
              title: read('title'),
              description: read('description'),
              category: read('category') as CategoryKey,
              priority: read('priority') as Activity['priority'],
              relationshipMode: read('relationshipMode') as Activity['relationshipMode'],
              colorKey: (read('colorKey') as ActivityColorKey) || defaultColorByCategory(read('category') as CategoryKey),
              statusId: read('statusId') || 'planned',
              startDate: read('startDate'),
              endDate: read('endDate') || undefined,
              estimatedHours: read('estimatedHours') ? Number(read('estimatedHours')) : undefined,
              parentGoalId: read('parentGoalId') || undefined,
              linkedActivityIds: toList(read('linkedActivityIds')),
              dependencyIds: toList(read('dependencyIds')),
              sequenceGroupId: read('sequenceGroupId') || undefined,
              milestone: read('milestone') === 'true',
              budgetImpact: read('budgetImpact') ? Number(read('budgetImpact')) : undefined,
              savingsImpact: read('savingsImpact') ? Number(read('savingsImpact')) : undefined,
              notes: read('notes'),
              subtasks: toList(read('subtasks')).map((title, index) => ({
                id: `sub-import-${index + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
                title,
                completed: false,
              })),
              comments: read('comments') ? (JSON.parse(read('comments')) as Activity['comments']) : [],
              history: read('history') ? (JSON.parse(read('history')) as Activity['history']) : [],
              monthlyEntries,
            }
          })

          const relationships = deriveRelationshipsFromActivities(activities)
          const firstMonthId =
            Object.keys(activities[0]?.monthlyEntries ?? {}).sort((left, right) => left.localeCompare(right))[0] ??
            get().selectedMonthId

          set({
            activities,
            trash: [],
            relationships,
            selectedMonthId: firstMonthId,
            selectedYear: Number(firstMonthId.slice(0, 4)),
            pendingMove: null,
            activeActivityId: null,
          })

          return { ok: true as const }
        } catch {
          return { ok: false as const, error: 'Could not parse Excel CSV. Use the exported template format.' }
        }
      },
    }),
    {
      name: 'northstar-planner-state',
      version: STORE_VERSION,
      migrate: (persistedState) => {
        if (isValidNewPersistedState(persistedState)) {
          return {
            ...createDefaultPersistedState(),
            ...upgradePersistedState(persistedState),
            migrationIssue: null,
          }
        }

        if (isValidLegacyPersistedState(persistedState)) {
          return {
            ...createDefaultPersistedState(),
            ...migrateLegacyPersistedState(persistedState, STORE_VERSION),
            migrationIssue: null,
          }
        }

        return {
          ...createDefaultPersistedState(),
          migrationIssue: createMigrationIssue(persistedState),
        }
      },
      storage: createJSONStorage(() => createIdentityScopedStorage()),
      skipHydration: true,
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        project: state.project,
        activities: state.activities,
        trash: state.trash,
        relationships: state.relationships,
        selectedYear: state.selectedYear,
        selectedMonthId: state.selectedMonthId,
        locale: state.locale,
        theme: state.theme,
      }),
    },
  ),
)

export function resetRoadmapMemory() {
  useRoadmapStore.setState({
    ...createDefaultPersistedState(),
    activeActivityId: null,
    pendingMove: null,
    migrationIssue: null,
  })
}
