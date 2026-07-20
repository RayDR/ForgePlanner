export const CURRENT_PLAN_SCHEMA_VERSION = 8 as const
export const SUPPORTED_PLAN_SCHEMA_VERSIONS = [7, 8] as const
export const PLANNER_CONTRACT_VERSION = 'northstar-plan/8' as const

export const PLAN_LIMITS = {
  name: 160,
  objective: 20_000,
  summary: 4_000,
  visibleText: 20_000,
  shortText: 240,
  entityId: 120,
  activities: 5_000,
  goals: 1_000,
  milestones: 2_000,
  subtasks: 500,
  comments: 2_000,
  history: 10_000,
  relationships: 20_000,
  monthlyEntries: 1_200,
  savingsEntries: 1_200,
  assumptions: 100,
  constraints: 100,
  warnings: 100,
  tags: 50,
  planYears: 100,
} as const

