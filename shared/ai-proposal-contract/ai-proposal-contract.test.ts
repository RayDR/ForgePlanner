import { describe, expect, it } from 'vitest'
import { aiPlanningProposalSchema, aiProposalJsonSchema, parseAiPlanningProposal, planningTurnJsonSchema } from './index.js'

const fixture = (language: 'en' | 'es' = 'en') => ({
  proposalSchemaVersion: 1 as const,
  title: language === 'es' ? 'Plan de crecimiento profesional' : 'Professional growth plan',
  summary: language === 'es' ? 'Una propuesta gradual y sostenible.' : 'A gradual and sustainable proposal.',
  primaryObjective: language === 'es' ? 'Mejorar habilidades de forma medible.' : 'Improve skills measurably.',
  recommendedDuration: language === 'es' ? 'Seis meses' : 'Six months', recommendedStartDate: null, recommendedTargetDate: null,
  planningApproach: language === 'es' ? 'Avanzar por fases y revisar cada mes.' : 'Advance in phases and review monthly.',
  phases: [{ title: language === 'es' ? 'Preparación' : 'Preparation', purpose: language === 'es' ? 'Definir el punto de partida.' : 'Define the starting point.', suggestedTimeframe: language === 'es' ? 'Mes 1' : 'Month 1', outcomes: ['Baseline'], recommendedActions: ['Review current skills'], dependencies: [], risks: [] }],
  assumptions: ['Time remains available'], risks: ['Competing priorities'], warnings: ['This is planning guidance, not professional advice.'], successIndicators: ['Monthly review completed'], weeklyCommitment: 'Five hours per week', budgetGuidance: null, clarifyingQuestions: [],
})

export const createAiProposalFixture = fixture

describe('human-readable AI proposal contract', () => {
  it.each(['en', 'es'] as const)('accepts a valid %s proposal', (language) => expect(aiPlanningProposalSchema.parse(fixture(language))).toEqual(fixture(language)))
  it('rejects unknown, ownership and canonical plan fields', () => {
    expect(() => aiPlanningProposalSchema.parse({ ...fixture(), ownerUserId: 'x' })).toThrow()
    expect(() => aiPlanningProposalSchema.parse({ ...fixture(), project: {}, activities: [] })).toThrow()
  })
  it('bounds phases and content', () => {
    expect(() => aiPlanningProposalSchema.parse({ ...fixture(), phases: Array(13).fill(fixture().phases[0]) })).toThrow()
    expect(() => aiPlanningProposalSchema.parse({ ...fixture(), title: 'x'.repeat(161) })).toThrow()
  })
  it('serializes deterministically and exports JSON Schema', () => {
    expect(parseAiPlanningProposal(Object.fromEntries(Object.entries(fixture()).reverse())).serialized).toBe(parseAiPlanningProposal(fixture()).serialized)
    expect(aiProposalJsonSchema()).toMatchObject({ type: 'object' })
    const turnSchema = planningTurnJsonSchema()
    expect(JSON.stringify(turnSchema)).not.toContain('oneOf')
    expect(turnSchema).toMatchObject({ properties: { turn: { required: ['action', 'question', 'suggestedAnswers', 'missingInformation', 'proposal', 'language'] } } })
  })
})
