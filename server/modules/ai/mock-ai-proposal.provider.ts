import { createHash } from 'node:crypto'
import type { AiPlanningProposal, PlanningTurn } from '../../../shared/ai-proposal-contract/index.js'
import type { PlanningInput } from './ai.schemas.js'
import type { AiProposalProvider, PlanConversionContext, ProviderContext, ProviderResult } from './ai-provider.js'
import { buildCanonicalPlanFromProposal } from './ai-plan-builder.js'

const BUSINESS_WORDS = /\b(business|company|shop|store|startup|negocio|empresa|tienda|cafeter[ií]a|cafe|coffee)\b/i
const BUSINESS_TYPE_WORDS = /\b(coffee shop|coffee|cafe|cafeter[ií]a|bakery|restaurant|restaurante|consulting|consultor[ií]a|agency|agencia|store|tienda|salon|taller)\b/i
const MONEY = /(?:[$€£]\s?\d|\b\d[\d,.]*\s?(?:usd|mxn|cad|eur|gbp|d[oó]lares|pesos))/i
const TIMELINE = /\b(?:\d+\s*(?:days?|weeks?|months?|years?|d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?)|within|en un plazo|para \w+ de 20\d{2})\b/i

async function controlledDelay(text: string, signal: AbortSignal) {
  if (text.includes('[mock:failure]')) throw new Error('MOCK_PROVIDER_FAILURE')
  if (text.includes('[mock:timeout]')) throw new DOMException('Mock timeout', 'AbortError')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
}

function result(turn: unknown, seed: string): ProviderResult {
  return { turn, providerRequestId: `mock_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`, inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null }
}

function ask(language: 'en' | 'es', question: string, missingInformation: string[], suggestedAnswers?: string[]): PlanningTurn {
  return { action: 'ASK', question, missingInformation, suggestedAnswers, language }
}

function proposalFor(language: 'en' | 'es', input: PlanningInput, collected: string): AiPlanningProposal {
  const es = language === 'es'
  const coffee = /coffee|cafe|cafeter[ií]a/i.test(collected)
  const business = BUSINESS_WORDS.test(collected)
  const duration = input.durationMonths
    ? (es ? `${input.durationMonths} meses` : `${input.durationMonths} months`)
    : (TIMELINE.exec(collected)?.[0] ?? (es ? '12 meses' : '12 months'))
  const title = coffee
    ? (es ? 'Abrir una cafetería con una validación por etapas' : 'Open a coffee shop through staged validation')
    : business
      ? (es ? 'Lanzar y validar el negocio por etapas' : 'Launch and validate the business in stages')
      : (es ? 'Ruta práctica para tu objetivo' : 'A practical path toward your goal')
  const objective = coffee
    ? (es ? `Validar, preparar y abrir una cafetería en ${duration}, protegiendo el presupuesto y ajustando el plan con evidencia real.` : `Validate, prepare, and open a coffee shop within ${duration}, protecting the budget and adjusting the plan with real evidence.`)
    : (es ? `Convertir “${input.goal}” en un resultado medible mediante fases revisables.` : `Turn “${input.goal}” into a measurable outcome through reviewable phases.`)
  const assumptions = [
    input.hoursPerWeek != null
      ? (es ? `Puedes dedicar aproximadamente ${input.hoursPerWeek} horas por semana.` : `You can dedicate about ${input.hoursPerWeek} hours per week.`)
      : (es ? 'La disponibilidad semanal se confirmará al iniciar.' : 'Weekly availability will be confirmed at kickoff.'),
    input.monthlyBudget != null
      ? (es ? `El presupuesto mensual indicado es ${input.monthlyBudget} ${input.currency ?? ''}.`.trim() : `The stated monthly budget is ${input.monthlyBudget} ${input.currency ?? ''}.`.trim())
      : (es ? 'El presupuesto definitivo se validará antes de asumir compromisos.' : 'The final budget will be validated before commitments are made.'),
  ]
  return {
    proposalSchemaVersion: 1,
    title,
    summary: es ? 'Una propuesta específica que prioriza validación, decisiones reversibles y revisiones frecuentes.' : 'A specific proposal that prioritizes validation, reversible decisions, and frequent reviews.',
    primaryObjective: objective,
    recommendedDuration: duration,
    recommendedStartDate: input.startDate ?? null,
    recommendedTargetDate: input.targetDate ?? null,
    planningApproach: es ? 'Trabaja de la evidencia al compromiso: valida primero, define operaciones después y abre únicamente cuando los supuestos críticos estén comprobados.' : 'Work from evidence to commitment: validate first, define operations next, and open only after critical assumptions have been tested.',
    phases: [
      {
        title: es ? 'Validación' : 'Validation',
        purpose: es ? 'Comprobar cliente, oferta, ubicación y viabilidad antes de gastos irreversibles.' : 'Test customer, offer, location, and viability before irreversible spending.',
        suggestedTimeframe: es ? 'Primer 20% del plazo' : 'First 20% of the timeline',
        outcomes: [es ? 'Demanda y propuesta de valor documentadas' : 'Documented demand and value proposition'],
        recommendedActions: [es ? 'Entrevistar clientes potenciales' : 'Interview prospective customers', es ? 'Probar precios y oferta mínima' : 'Test pricing and a minimum offer'],
        dependencies: [],
        risks: [es ? 'Confundir interés con intención de compra' : 'Mistaking interest for purchase intent'],
      },
      {
        title: es ? 'Preparación operativa' : 'Operational preparation',
        purpose: es ? 'Definir costos, permisos, proveedores, ubicación y rutina de operación.' : 'Define costs, permits, suppliers, location, and operating routines.',
        suggestedTimeframe: es ? 'Siguiente 50% del plazo' : 'Next 50% of the timeline',
        outcomes: [es ? 'Presupuesto y plan operativo verificables' : 'Verifiable budget and operating plan'],
        recommendedActions: [es ? 'Comparar escenarios de costos' : 'Compare cost scenarios', es ? 'Confirmar requisitos legales con profesionales locales' : 'Confirm legal requirements with local professionals'],
        dependencies: [es ? 'Validación suficiente' : 'Sufficient validation'],
        risks: [es ? 'Costos o permisos mayores a lo previsto' : 'Higher-than-expected costs or permitting needs'],
      },
      {
        title: es ? 'Lanzamiento controlado' : 'Controlled launch',
        purpose: es ? 'Abrir gradualmente, medir resultados y corregir antes de escalar.' : 'Open gradually, measure results, and correct course before scaling.',
        suggestedTimeframe: es ? 'Último 30% del plazo' : 'Final 30% of the timeline',
        outcomes: [es ? 'Operación inicial y métricas de decisión' : 'Initial operation and decision metrics'],
        recommendedActions: [es ? 'Realizar una apertura limitada' : 'Run a limited opening', es ? 'Revisar ventas, margen y comentarios semanalmente' : 'Review sales, margin, and feedback weekly'],
        dependencies: [es ? 'Preparación operativa terminada' : 'Operational preparation completed'],
        risks: [es ? 'Escalar antes de alcanzar estabilidad' : 'Scaling before reaching stability'],
      },
    ],
    assumptions,
    risks: [es ? 'La demanda, los costos o la disponibilidad personal pueden cambiar.' : 'Demand, costs, or personal availability may change.'],
    warnings: [es ? 'La propuesta no garantiza resultados financieros ni sustituye asesoría legal o financiera.' : 'This proposal does not guarantee financial outcomes or replace legal or financial advice.'],
    successIndicators: [es ? 'Demanda validada con evidencia' : 'Demand validated with evidence', es ? 'Presupuesto y punto de equilibrio revisados' : 'Reviewed budget and break-even point', es ? 'Primer ciclo operativo medido' : 'First operating cycle measured'],
    weeklyCommitment: input.hoursPerWeek != null ? (es ? `${input.hoursPerWeek} horas por semana.` : `${input.hoursPerWeek} hours per week.`) : (es ? 'Confirmar según la fase y la disponibilidad real.' : 'Confirm by phase and actual availability.'),
    budgetGuidance: input.monthlyBudget != null ? (es ? `Trabaja dentro de ${input.monthlyBudget} ${input.currency ?? ''} al mes y valida cada compromiso importante.`.trim() : `Work within ${input.monthlyBudget} ${input.currency ?? ''} per month and validate each major commitment.`.trim()) : null,
    clarifyingQuestions: [],
  }
}

function decide(input: PlanningInput, language: 'en' | 'es'): PlanningTurn {
  const userAnswers = input.conversation.filter((message) => message.role === 'user').map((message) => message.content)
  const collected = [input.goal, input.additionalContext ?? '', ...userAnswers].join(' ')
  if (input.continueWithAssumptions || input.clarificationCount >= 3) return { action: 'PROPOSE', proposal: proposalFor(language, input, collected), language }

  const isBusiness = BUSINESS_WORDS.test(collected)
  const hasBusinessType = BUSINESS_TYPE_WORDS.test(collected)
  const hasBudget = input.monthlyBudget != null || MONEY.test(collected)
  const hasTimeline = input.durationMonths != null || Boolean(input.startDate && input.targetDate) || TIMELINE.test(collected)

  if (isBusiness && !hasBusinessType) {
    return language === 'es'
      ? ask(language, '¿Qué tipo de negocio quieres abrir?', ['businessType'], ['Una cafetería', 'Una tienda en línea', 'Una consultoría'])
      : ask(language, 'What type of business do you want to open?', ['businessType'], ['A coffee shop', 'An online store', 'A consulting business'])
  }
  if (isBusiness && (!hasBudget || !hasTimeline)) {
    if (!hasBudget && !hasTimeline) return language === 'es'
      ? ask(language, '¿Qué presupuesto y plazo estás considerando?', ['budget', 'timeline'], ['$15,000 y 12 meses', 'Aún no lo sé'])
      : ask(language, 'What budget and timeline are you considering?', ['budget', 'timeline'], ['$15,000 and 12 months', "I don't know yet"])
    if (!hasBudget) return language === 'es'
      ? ask(language, '¿Qué presupuesto estás considerando?', ['budget'], ['$15,000', 'Quiero validarlo primero'])
      : ask(language, 'What budget are you considering?', ['budget'], ['$15,000', 'I want to validate it first'])
    return language === 'es'
      ? ask(language, '¿En qué plazo quieres lograrlo?', ['timeline'], ['6 meses', '12 meses', '18 meses'])
      : ask(language, 'What timeline are you targeting?', ['timeline'], ['6 months', '12 months', '18 months'])
  }
  return { action: 'PROPOSE', proposal: proposalFor(language, input, collected), language }
}

export class MockAiProposalProvider implements AiProposalProvider {
  readonly name = 'mock'
  readonly model = 'deterministic-conversation-v1'
  readonly conversionModel = 'deterministic-conversion-v1'

  async planningTurn(input: PlanningInput, context: ProviderContext) {
    await controlledDelay(`${input.goal} ${input.additionalContext ?? ''}`, context.signal)
    if (input.goal.includes('[mock:invalid]')) return result({ invalid: true }, context.correlationId)
    return result(decide(input, context.language.toLowerCase() as 'en' | 'es'), context.correlationId)
  }

  async refineProposal(current: AiPlanningProposal, instruction: string, context: ProviderContext) {
    await controlledDelay(instruction, context.signal)
    if (instruction.includes('[mock:invalid]')) return result({ invalid: true }, context.correlationId)
    const lower = instruction.toLowerCase()
    const es = context.language === 'ES'
    let proposal = structuredClone(current)
    if (/menos pesado|less demanding/.test(lower)) proposal = { ...proposal, planningApproach: `${proposal.planningApproach} ${es ? 'La primera fase tendrá una carga más ligera.' : 'The first phase will use a lighter workload.'}` }
    else if (/presupuesto|budget/.test(lower)) proposal = { ...proposal, budgetGuidance: es ? 'Prioriza acciones gratuitas y revisa cualquier gasto antes de comprometerlo.' : 'Prioritize free actions and review every expense before committing.' }
    else if (/hito|milestone|later|despu[eé]s/.test(lower)) proposal = { ...proposal, recommendedDuration: es ? 'Ocho meses con el resultado principal más adelante' : 'Eight months with the main outcome scheduled later' }
    else proposal = { ...proposal, summary: `${proposal.summary} ${es ? 'Ajuste solicitado incorporado.' : 'Requested adjustment incorporated.'}` }
    const language = context.language.toLowerCase() as 'en' | 'es'
    return result({ action: 'PROPOSE', proposal, language }, context.correlationId)
  }

  async convertAcceptedProposalToPlan(proposal: AiPlanningProposal, context: PlanConversionContext) {
    await controlledDelay(proposal.title, context.signal)
    if (proposal.title.includes('[mock:invalid-plan]')) return { plan: { schemaVersion: 8 }, providerRequestId: 'mock_invalid_plan', inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null }
    return { plan: buildCanonicalPlanFromProposal(proposal, context.language, context.approvedContext, context.now), providerRequestId: `mock_conversion_${context.correlationId}`, inputTokenCount: null, outputTokenCount: null, estimatedCostMicros: null }
  }
}
