import { describe, expect, it } from 'vitest'
import { safeValidateCanonicalPlan, validatePlanSemantics } from '../../../shared/plan-contract/index.js'
import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import { buildCanonicalPlanFromProposal } from './ai-plan-builder.js'

const proposal = (language: 'en' | 'es'): AiPlanningProposal => ({ proposalSchemaVersion: 1, title: language === 'es' ? 'Abrir una cafetería' : 'Become a senior backend engineer', summary: language === 'es' ? 'Un plan práctico.' : 'A practical plan.', primaryObjective: language === 'es' ? 'Abrir y validar una cafetería sostenible.' : 'Reach senior backend engineering capability.', recommendedDuration: '12 months', recommendedStartDate: '2026-08-01', recommendedTargetDate: '2027-07-31', planningApproach: language === 'es' ? 'Validar antes de invertir.' : 'Learn through deliberate practice.', phases: [{ title: language === 'es' ? 'Validación' : 'Foundations', purpose: language === 'es' ? 'Validar demanda y costos.' : 'Build reliable foundations.', suggestedTimeframe: '4 months', outcomes: [language === 'es' ? 'Demanda validada' : 'Core skills demonstrated'], recommendedActions: [language === 'es' ? 'Entrevistar clientes' : 'Build a production service', language === 'es' ? 'Probar el menú' : 'Review system design'], dependencies: [], risks: [] }, { title: language === 'es' ? 'Lanzamiento' : 'Leadership', purpose: language === 'es' ? 'Preparar y abrir.' : 'Lead delivery.', suggestedTimeframe: '8 months', outcomes: [language === 'es' ? 'Apertura controlada' : 'Promotion evidence'], recommendedActions: [language === 'es' ? 'Preparar operaciones' : 'Mentor a teammate'], dependencies: ['Foundations'], risks: [] }], assumptions: [], risks: [], warnings: [], successIndicators: ['Done'], weeklyCommitment: '5 hours', budgetGuidance: null, clarifyingQuestions: [] })

describe('canonical AI plan builder', () => {
  it.each([['ES','es'], ['EN','en']] as const)('creates a valid v8 plan with visible %s content', (language, contentLanguage) => {
    const plan = buildCanonicalPlanFromProposal(proposal(contentLanguage), language, { durationMonths: 12, hoursPerWeek: 5, financialMode: 'none', intensity: 'balanced' }, '2026-07-21T00:00:00.000Z')
    const parsed = safeValidateCanonicalPlan(plan)
    expect(parsed.success).toBe(true)
    expect(plan).toMatchObject({ schemaVersion: 8, metadata: { origin: 'ai', contentLanguage }, project: { statusDefinitions: expect.any(Array) } })
    expect(plan.project.statusDefinitions.filter((status) => status.isDefault)).toHaveLength(1)
    expect(plan.activities.every((activity) => ['low','medium','high','critical'].includes(activity.priority))).toBe(true)
  })

  it('creates coherent savings, references, dates and non-circular dependencies', () => {
    const plan = buildCanonicalPlanFromProposal(proposal('es'), 'ES', { durationMonths: 12, financialMode: 'savings', savingsGoal: 15_000, currency: 'USD' }, '2026-07-21T00:00:00.000Z')
    expect(plan.project.savingsPlan).toMatchObject({ enabled: true, targetTotal: 15_000 })
    expect(plan.project.savingsPlan.monthlyEntries.reduce((sum, entry) => sum + entry.target, 0)).toBe(15_000)
    expect(validatePlanSemantics(plan)).toEqual([])
  })

  it('semantic validation rejects invalid dates and dependency cycles', () => {
    const plan = buildCanonicalPlanFromProposal(proposal('en'), 'EN', { durationMonths: 12 }, '2026-07-21T00:00:00.000Z')
    plan.activities[0].dependencyIds = [plan.activities[1].id]
    plan.activities[1].dependencyIds = [plan.activities[0].id]
    plan.activities[0].endDate = '2020-01-01'
    const issues = validatePlanSemantics(plan)
    expect(issues.map((item) => item.code)).toEqual(expect.arrayContaining(['DATE_ORDER','DEPENDENCY_CYCLE']))
  })
})
