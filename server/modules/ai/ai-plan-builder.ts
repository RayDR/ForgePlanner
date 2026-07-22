import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import { CURRENT_PLAN_SCHEMA_VERSION, PLANNER_CONTRACT_VERSION, type CanonicalPlan } from '../../../shared/plan-contract/index.js'

type ApprovedContext = {
  startDate?: string | null
  targetDate?: string | null
  durationMonths?: number | null
  hoursPerWeek?: number | null
  financialMode?: 'none' | 'budget' | 'savings'
  savingsGoal?: number | null
  currency?: string | null
  intensity?: 'light' | 'balanced' | 'ambitious'
}

function iso(date: Date) { return date.toISOString().slice(0, 10) }
function parseDate(value: unknown, fallback: Date) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : fallback }
function addMonths(date: Date, months: number) { const next = new Date(date); next.setUTCMonth(next.getUTCMonth() + months); return next }
function monthId(date: Date) { return iso(date).slice(0, 7) }
function monthsBetween(start: Date, end: Date) { const values: string[] = []; const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); const last = monthId(end); while (monthId(cursor) <= last && values.length < 120) { values.push(monthId(cursor)); cursor.setUTCMonth(cursor.getUTCMonth() + 1) } return values }

export function buildCanonicalPlanFromProposal(proposal: AiPlanningProposal, language: 'EN' | 'ES', rawContext: Record<string, unknown>, now: string): CanonicalPlan {
  const context = rawContext as ApprovedContext
  const today = parseDate(now.slice(0, 10), new Date())
  const start = parseDate(proposal.recommendedStartDate ?? context.startDate, today)
  const duration = Math.max(1, Math.min(120, Number(context.durationMonths) || 12))
  const computedEnd = new Date(addMonths(start, duration).getTime() - 86_400_000)
  const end = parseDate(proposal.recommendedTargetDate ?? context.targetDate, computedEnd)
  const safeEnd = end < start ? computedEnd : end
  const es = language === 'ES'
  const statusDefinitions: CanonicalPlan['project']['statusDefinitions'] = [
    { id: 'planned', label: es ? 'Planeado' : 'Planned', colorKey: 'slate', order: 0, isSystem: true, isDefault: true },
    { id: 'in-progress', label: es ? 'En progreso' : 'In progress', colorKey: 'blue', order: 1, isSystem: true },
    { id: 'paused', label: es ? 'En pausa' : 'Paused', colorKey: 'amber', order: 2, isSystem: true },
    { id: 'blocked', label: es ? 'Bloqueado' : 'Blocked', colorKey: 'rose', order: 3, isSystem: true },
    { id: 'completed', label: es ? 'Completado' : 'Completed', colorKey: 'green', order: 4, isSystem: true },
  ]
  const totalDays = Math.max(1, Math.floor((safeEnd.getTime() - start.getTime()) / 86_400_000) + 1)
  const activities: CanonicalPlan['activities'] = []
  const goals: CanonicalPlan['project']['goals'] = []
  const milestones: CanonicalPlan['project']['milestones'] = []
  const relationships: CanonicalPlan['relationships'] = []
  let previousActivityId: string | undefined
  proposal.phases.forEach((phase, phaseIndex) => {
    const phaseStart = new Date(start.getTime() + Math.floor(totalDays * phaseIndex / proposal.phases.length) * 86_400_000)
    const phaseEnd = phaseIndex === proposal.phases.length - 1 ? safeEnd : new Date(start.getTime() + (Math.floor(totalDays * (phaseIndex + 1) / proposal.phases.length) - 1) * 86_400_000)
    const goalId = `goal-${phaseIndex + 1}`
    goals.push({ id: goalId, title: phase.title, description: phase.purpose, targetDate: iso(phaseEnd), category: 'general' })
    const actions = phase.recommendedActions.length ? phase.recommendedActions : phase.outcomes
    const phaseActivityIds: string[] = []
    actions.forEach((action, actionIndex) => {
      const id = `activity-${phaseIndex + 1}-${actionIndex + 1}`
      const activityStart = new Date(phaseStart.getTime() + Math.floor(Math.max(0, phaseEnd.getTime() - phaseStart.getTime()) * actionIndex / Math.max(1, actions.length)) )
      const activityEnd = actionIndex === actions.length - 1 ? phaseEnd : new Date(phaseStart.getTime() + Math.floor(Math.max(0, phaseEnd.getTime() - phaseStart.getTime()) * (actionIndex + 1) / Math.max(1, actions.length)))
      const month = monthId(activityStart)
      const dependencyIds = actionIndex === 0 && previousActivityId ? [previousActivityId] : actionIndex > 0 ? [phaseActivityIds[actionIndex - 1]] : []
      activities.push({ id, title: action, description: phase.purpose, category: 'general', sequenceNumber: activities.length + 1, priority: phaseIndex === 0 ? 'high' : 'medium', relationshipMode: dependencyIds.length ? 'soft-linked' : 'independent', startDate: iso(activityStart), endDate: iso(activityEnd < activityStart ? activityStart : activityEnd), estimatedHours: context.hoursPerWeek ?? undefined, parentGoalId: goalId, linkedActivityIds: [], dependencyIds, milestone: false, colorKey: ['blue','green','amber','rose','slate'][phaseIndex % 5] as 'blue' | 'green' | 'amber' | 'rose' | 'slate', statusId: 'planned', progressMode: 'completion', notes: '', subtasks: [], comments: [], history: [], monthlyEntries: { [month]: { monthId: month, status: 'planned', progress: 0 } } })
      if (dependencyIds[0]) relationships.push({ id: `dependency-${dependencyIds[0]}-${id}`, sourceActivityId: dependencyIds[0], targetActivityId: id, type: 'dependency', relationshipMode: 'soft-linked' })
      phaseActivityIds.push(id)
    })
    const lastActivity = phaseActivityIds.at(-1)
    milestones.push({ id: `milestone-${phaseIndex + 1}`, title: phase.outcomes[0] ?? phase.title, monthId: monthId(phaseEnd), category: 'general', ...(lastActivity ? { activityId: lastActivity } : {}) })
    previousActivityId = lastActivity ?? previousActivityId
  })
  const savingsEnabled = context.financialMode === 'savings' && Number(context.savingsGoal) > 0
  const planMonths = monthsBetween(start, safeEnd)
  const savingsTotal = savingsEnabled ? Number(context.savingsGoal) : 0
  const baseTarget = planMonths.length ? Math.floor(savingsTotal / planMonths.length * 100) / 100 : 0
  const monthlyEntries = savingsEnabled ? planMonths.map((month, index) => ({ monthId: month, target: index === planMonths.length - 1 ? Number((savingsTotal - baseTarget * (planMonths.length - 1)).toFixed(2)) : baseTarget, actual: 0 })) : []
  return {
    schemaVersion: CURRENT_PLAN_SCHEMA_VERSION,
    metadata: { origin: 'ai', planningMode: duration <= 6 ? 'monthly' : 'annual', contentLanguage: es ? 'es' : 'en', plannerContractVersion: PLANNER_CONTRACT_VERSION },
    project: { id: 'ai-generated-plan', name: proposal.title, objective: proposal.primaryObjective, startDate: iso(start), plannedStartDate: iso(start), endDate: iso(safeEnd), plannedEndDate: iso(safeEnd), goals, milestones, statusDefinitions, categoryDefinitions: [{ key: 'general', label: es ? 'General' : 'General', tone: 'blue', isDefault: true }], savingsPlan: { currency: context.currency === 'CAD' ? 'CAD' : 'USD', enabled: savingsEnabled, mode: savingsEnabled ? 'monthly-target' : 'free', defaultMonthlyTarget: savingsEnabled ? baseTarget : 0, targetTotal: savingsTotal, monthlyEntries } },
    activities, trash: [], relationships, summary: proposal.summary,
    estimatedHoursPerWeek: context.hoursPerWeek ?? undefined,
    difficulty: context.intensity === 'light' ? 'light' : context.intensity === 'ambitious' ? 'demanding' : 'moderate',
  }
}
