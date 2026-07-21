import { createHash } from 'node:crypto'
import type { AiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'
import type { ProposalInput } from './ai.schemas.js'
import type { AiProposalProvider, ProviderContext, ProviderResult } from './ai-provider.js'

function fixture(language: 'EN' | 'ES', goal: string): AiPlanningProposal {
  const es = language === 'ES'
  return { proposalSchemaVersion: 1, title: es ? 'Propuesta para tu objetivo' : 'Proposal for your goal', summary: es ? `Una ruta gradual para: ${goal}` : `A gradual path for: ${goal}`, primaryObjective: goal, recommendedDuration: es ? 'Seis meses' : 'Six months', recommendedStartDate: null, recommendedTargetDate: null, planningApproach: es ? 'Avanza por fases, revisa resultados y ajusta la carga sin asumir resultados garantizados.' : 'Advance in phases, review outcomes, and adjust workload without assuming guaranteed results.', phases: [{ title: es ? 'Preparación' : 'Preparation', purpose: es ? 'Definir alcance, recursos y punto de partida.' : 'Define scope, resources, and baseline.', suggestedTimeframe: es ? 'Primer mes' : 'First month', outcomes: [es ? 'Punto de partida documentado' : 'Documented baseline'], recommendedActions: [es ? 'Reservar tiempo semanal' : 'Reserve weekly time'], dependencies: [], risks: [es ? 'Prioridades en competencia' : 'Competing priorities'] }, { title: es ? 'Ejecución' : 'Execution', purpose: es ? 'Realizar las acciones principales y medir avances.' : 'Complete core actions and measure progress.', suggestedTimeframe: es ? 'Meses 2 a 5' : 'Months 2–5', outcomes: [es ? 'Avance medible' : 'Measurable progress'], recommendedActions: [es ? 'Revisar avances cada semana' : 'Review progress weekly'], dependencies: [es ? 'Preparación terminada' : 'Preparation completed'], risks: [] }], assumptions: [es ? 'La disponibilidad semanal se mantiene.' : 'Weekly availability remains stable.'], risks: [es ? 'Cambios de tiempo o presupuesto.' : 'Time or budget changes.'], warnings: [es ? 'Esta propuesta es orientación de planificación, no asesoría profesional.' : 'This proposal is planning guidance, not professional advice.'], successIndicators: [es ? 'Revisión mensual completada.' : 'Monthly review completed.'], weeklyCommitment: es ? 'Entre cuatro y seis horas por semana.' : 'Four to six hours per week.', budgetGuidance: null, clarifyingQuestions: [] }
}

async function controlledDelay(text: string, signal: AbortSignal) {
  if (text.includes('[mock:failure]')) throw new Error('MOCK_PROVIDER_FAILURE')
  if (text.includes('[mock:timeout]')) throw new DOMException('Mock timeout', 'AbortError')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
}

function result(proposal: unknown, seed: string): ProviderResult { return { proposal, providerRequestId: `mock_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`, inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null } }

export class MockAiProposalProvider implements AiProposalProvider {
  readonly name = 'mock'; readonly model = 'deterministic-v1'
  async generateProposal(input: ProposalInput, context: ProviderContext) { await controlledDelay(`${input.goal} ${input.additionalContext ?? ''}`, context.signal); if (input.goal.includes('[mock:invalid]')) return result({ invalid: true }, context.correlationId); return result(fixture(context.language, input.goal), context.correlationId) }
  async refineProposal(current: AiPlanningProposal, instruction: string, context: ProviderContext) {
    await controlledDelay(instruction, context.signal); if (instruction.includes('[mock:invalid]')) return result({ invalid: true }, context.correlationId)
    const lower = instruction.toLowerCase(); const es = context.language === 'ES'; let proposal = structuredClone(current)
    if (/menos pesado|less demanding/.test(lower)) proposal = { ...proposal, planningApproach: `${proposal.planningApproach} ${es ? 'La primera fase tendrá una carga más ligera.' : 'The first phase will use a lighter workload.'}` }
    else if (/presupuesto|budget/.test(lower)) proposal = { ...proposal, budgetGuidance: es ? 'Prioriza acciones gratuitas y revisa cualquier gasto antes de comprometerlo.' : 'Prioritize free actions and review every expense before committing.' }
    else if (/hito|milestone|later|despu[eé]s/.test(lower)) proposal = { ...proposal, recommendedDuration: es ? 'Ocho meses con el resultado principal más adelante' : 'Eight months with the main outcome scheduled later' }
    else proposal = { ...proposal, summary: `${proposal.summary} ${es ? 'Ajuste solicitado incorporado.' : 'Requested adjustment incorporated.'}` }
    return result(proposal, context.correlationId)
  }
}
