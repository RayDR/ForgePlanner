import { describe, expect, it } from 'vitest'
import type { Activity, Project } from '../types/roadmap'
import {
  DEFAULT_PROJECT_STATUSES,
  applyCompleteMonth,
  applyContinueToMonth,
  applyPendingMonthlyChange,
  applyResumeInMonth,
  applySkipMonth,
  applyPauseMonth,
  createPendingMonthlyChange,
  isValidNewPersistedState,
  migrateLegacyPersistedState,
  updateProjectSavingsEntry,
  type PersistedRoadmapState,
} from './roadmapState'
import {
  getCalculatedActivityProgress,
  getProjectSavingsTotals,
  getYearlySavingsTotals,
} from './roadmapModel'

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    title: 'Study AWS SAA',
    description: 'Prepare for exam',
    category: 'aws-cloud',
    priority: 'high',
    relationshipMode: 'independent',
    startDate: '2026-08-01',
    endDate: '2027-03-31',
    linkedActivityIds: [],
    dependencyIds: [],
    milestone: false,
    colorKey: 'blue',
    statusId: 'active',
    notes: '',
    subtasks: [],
    comments: [],
    history: [],
    monthlyEntries: {
      '2026-08': {
        monthId: '2026-08',
        status: 'in-progress',
        progress: 40,
      },
    },
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'NorthStar',
    objective: 'Test project',
    startDate: '2026-08-01',
    endDate: '2027-12-31',
    plannedEndDate: '2027-12-31',
    actualEndDate: '2027-12-31',
    goals: [],
    milestones: [],
    statusDefinitions: DEFAULT_PROJECT_STATUSES,
    categoryDefinitions: [{ key: 'career', label: 'Career', tone: 'slate', isDefault: true }],
    savingsPlan: {
      currency: 'USD',
      targetTotal: 600,
      monthlyEntries: [
        { monthId: '2026-08', target: 300, actual: 250 },
        { monthId: '2026-09', target: 300, actual: 350 },
      ],
    },
    ...overrides,
  }
}

describe('roadmap monthly model', () => {
  it('supports activity with multiple monthly entries', () => {
    const activity = makeActivity({
      monthlyEntries: {
        '2026-08': { monthId: '2026-08', status: 'in-progress', progress: 40 },
        '2026-09': { monthId: '2026-09', status: 'skipped', progress: 0 },
        '2026-10': { monthId: '2026-10', status: 'continued', progress: 55 },
      },
    })

    expect(Object.keys(activity.monthlyEntries)).toHaveLength(3)
    expect(activity.monthlyEntries['2026-10'].status).toBe('continued')
  })

  it('skips a single month', () => {
    const activity = applySkipMonth(makeActivity(), '2026-08')
    expect(activity.monthlyEntries['2026-08'].status).toBe('skipped')
  })

  it('skips several months and continues later', () => {
    const activity = applySkipMonth(makeActivity(), '2026-08', '2026-11')
    expect(activity.monthlyEntries['2026-09'].status).toBe('skipped')
    expect(activity.monthlyEntries['2026-10'].status).toBe('skipped')
    expect(activity.monthlyEntries['2026-11'].status).toBe('continued')
  })

  it('pauses and resumes activity', () => {
    const paused = applyPauseMonth(makeActivity(), '2026-08')
    const resumed = applyResumeInMonth(paused, '2026-08', '2026-12')
    expect(resumed.monthlyEntries['2026-08'].status).toBe('paused')
    expect(resumed.monthlyEntries['2026-12'].status).toBe('resumed')
  })

  it('continues next month', () => {
    const activity = applyContinueToMonth(makeActivity(), '2026-08', '2026-09')
    expect(activity.monthlyEntries['2026-09'].status).toBe('continued')
  })

  it('continues in selected future month', () => {
    const activity = applyContinueToMonth(makeActivity(), '2026-08', '2027-01')
    expect(activity.monthlyEntries['2027-01'].status).toBe('continued')
  })

  it('completes activity in a month', () => {
    const activity = applyCompleteMonth(makeActivity(), '2027-03')
    expect(activity.monthlyEntries['2027-03'].status).toBe('completed')
    expect(activity.monthlyEntries['2027-03'].progress).toBe(100)
  })

  it('creates soft-linked suggestion', () => {
    const source = makeActivity({ relationshipMode: 'soft-linked', linkedActivityIds: ['activity-2'] })
    const pending = createPendingMonthlyChange([source], source, '2026-08', '2026-10', 'continue')
    expect(pending?.mode).toBe('soft-linked')
    expect(pending?.suggestedActivityIds).toEqual(['activity-1', 'activity-2'])
  })

  it('creates locked-sequence confirmation and applies it', () => {
    const first = makeActivity({ relationshipMode: 'locked-sequence', sequenceGroupId: 'group-1' })
    const second = makeActivity({ id: 'activity-2', title: 'Exam', relationshipMode: 'locked-sequence', sequenceGroupId: 'group-1' })
    const pending = createPendingMonthlyChange([first, second], first, '2026-08', '2026-10', 'continue')
    expect(pending?.mode).toBe('locked-sequence')
    const updated = applyPendingMonthlyChange([first, second], pending!, true)
    expect(updated[0].monthlyEntries['2026-10'].status).toBe('continued')
    expect(updated[1].monthlyEntries['2026-10'].status).toBe('continued')
  })

  it('updates savings target vs actual', () => {
    const project = updateProjectSavingsEntry(makeProject(), {
      monthId: '2026-08',
      target: 300,
      actual: 280,
      notes: 'Adjusted',
    })
    expect(project.savingsPlan.monthlyEntries[0].actual).toBe(280)
  })

  it('computes yearly savings totals', () => {
    const totals = getYearlySavingsTotals(makeProject(), 2026)
    expect(totals.target).toBe(600)
    expect(totals.actual).toBe(600)
    expect(totals.difference).toBe(0)
  })

  it('computes project savings totals', () => {
    const totals = getProjectSavingsTotals(makeProject())
    expect(totals.target).toBe(600)
    expect(totals.actual).toBe(600)
    expect(totals.remaining).toBe(0)
    expect(totals.progress).toBe(100)
  })

  it('migrates legacy state into monthly entries', () => {
    const migrated = migrateLegacyPersistedState(
      {
        project: {
          id: 'legacy-project',
          name: 'Legacy',
          objective: 'Legacy import',
          startDate: '2026-08-01',
          endDate: '2027-12-31',
          plannedEndDate: '2027-12-31',
          actualEndDate: '2027-12-31',
          selectedYear: 2026,
          goals: [],
          milestones: [],
          savingsPlan: [{ monthId: '2026-08', projected: 300, actual: 280 }],
        },
        activities: [
          {
            id: 'legacy-1',
            title: 'Legacy activity',
            description: 'Old schema',
            category: 'aws-cloud',
            status: 'deferred',
            priority: 'medium',
            relationshipMode: 'independent',
            startDate: '2026-08-01',
            endDate: '2026-08-31',
            targetMonth: '2026-08',
            linkedActivityIds: [],
            dependencyIds: [],
            milestone: false,
            notes: '',
            subtasks: [],
            comments: [],
            monthlyPlans: {
              '2026-08': {
                monthId: '2026-08',
                progress: 0,
                status: 'deferred',
                isDeferred: true,
              },
            },
            moveHistory: [],
          },
        ],
        relationships: [],
        selectedYear: 2026,
        selectedMonthId: '2026-08',
        locale: 'es',
        theme: 'light',
      },
      4,
    )

    expect(migrated.activities[0].monthlyEntries['2026-08'].status).toBe('skipped')
    expect(migrated.project.savingsPlan.monthlyEntries[0].target).toBe(300)
  })

  it('validates export/import payload in the new schema', () => {
    const snapshot: PersistedRoadmapState = {
      schemaVersion: 5,
      metadata: { origin: 'manual', contentLanguage: 'es', plannerContractVersion: 'northstar-plan/8' },
      project: makeProject(),
      activities: [makeActivity()],
      trash: [],
      relationships: [],
      selectedYear: 2026,
      selectedMonthId: '2026-08',
      locale: 'es',
      theme: 'dark',
    }

    const roundTrip = JSON.parse(JSON.stringify(snapshot))
    expect(isValidNewPersistedState(roundTrip)).toBe(true)
  })
  it("calculates weighted progress from subtask weights", () => {
    const activity = makeActivity({ progressMode: "weighted", subtasks: [
      { id: "small", title: "Small", completed: true, weight: 1 },
      { id: "large", title: "Large", completed: false, weight: 3 },
    ] })
    expect(getCalculatedActivityProgress(activity)).toBe(25)
  })

  it("treats legacy subtasks without weights as equal weight", () => {
    const activity = makeActivity({ progressMode: "weighted", subtasks: [
      { id: "one", title: "One", completed: true },
      { id: "two", title: "Two", completed: false },
    ] })
    expect(getCalculatedActivityProgress(activity)).toBe(50)
  })

  it("uses completed status when an activity has no subtasks", () => {
    expect(getCalculatedActivityProgress(makeActivity({ statusId: "done", subtasks: [] }))).toBe(100)
    expect(getCalculatedActivityProgress(makeActivity({ statusId: "active", subtasks: [] }))).toBe(0)
  })
  it("defaults to completion mode when weighting is disabled", () => {
    const activity = makeActivity({ progressMode: "completion", statusId: "active", subtasks: [{ id: "one", title: "One", completed: true, weight: 5 }] })
    expect(getCalculatedActivityProgress(activity)).toBe(0)
  })
})
