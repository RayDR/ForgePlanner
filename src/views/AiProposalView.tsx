import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AiContextControls } from '../ai/AiContextControls'
import { AiRequestError, aiApi } from '../ai/aiApi'
import { aiProposalCopy } from '../ai/aiProposalCopy'
import { AssistantTypingMessage } from '../ai/AssistantTypingMessage'
import { textConversation } from '../ai/aiConversationBoundary'
import { clearAiConversation, emptyAiConversationState, readAiConversation, saveAiConversation } from '../ai/aiConversationStorage'
import { deleteGuestConversation } from '../ai/deleteGuestConversation'
import { readGuestProposals, saveGuestProposal } from '../ai/guestProposalStorage'
import type { AiConversationMessage, AiConversionResult, AiOperationDto, AiProposalResult, GuestProposalRecord } from '../ai/aiTypes'
import { dismissSensitiveWarning, isSensitiveWarningDismissed } from '../ai/aiWorkspaceSession'
import { hasMeaningfulAiWorkspaceState } from '../ai/aiWorkspaceState'
import { buildProposalInput, defaultAiComposerContext, type AiComposerContext } from '../ai/proposalInput'
import { useSession } from '../auth/SessionProvider'
import { getIdentityScope, getScopeGeneration, isCurrentScope } from '../persistence/identityScope'
import { Modal } from '../ui/Modal'
import { forgePlanFromAiSnapshot } from '../ai/guestGeneratedPlanStorage'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { fromRemote } from '../plans/planApi'
import { TrashIcon } from '../ui/icons'

type GuestSessionState = 'idle' | 'loading' | 'ready' | 'error'
type ConversationMode = 'refine' | 'continue' | null

function hasGuestCsrfCookie() {
  return typeof document !== 'undefined' && document.cookie.split('; ').some((item) => item.startsWith('northstar_ai_csrf='))
}

function proposalMessage(result: AiProposalResult): AiConversationMessage | null {
  if (!result.proposal || !result.operation.currentProposalRevision) return null
  return { id: crypto.randomUUID(), role: 'assistant', kind: 'proposal', proposal: result.proposal, revision: result.operation.currentProposalRevision, operationId: result.operation.id }
}

export function AiProposalView({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  const { session, locale } = useSession()
  const navigate = useNavigate()
  const addSessionPlan = useForgePlannerStore((state) => state.addSessionPlan)
  const acceptServerPlan = useForgePlannerStore((state) => state.acceptServerPlan)
  const guest = !session
  const t = aiProposalCopy[locale]
  const [goal, setGoal] = useState('')
  const [composerContext, setComposerContext] = useState<AiComposerContext>(defaultAiComposerContext)
  const [contextControlsKey, setContextControlsKey] = useState(0)
  const [messages, setMessages] = useState<AiConversationMessage[]>([])
  const [clarificationCount, setClarificationCount] = useState(0)
  const [conversationLanguage, setConversationLanguage] = useState<'en' | 'es' | null>(null)
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null)
  const [current, setCurrent] = useState<AiProposalResult | null>(null)
  const [conversion, setConversion] = useState<AiConversionResult | null>(null)
  const [operations, setOperations] = useState<AiOperationDto[]>([])
  const [instruction, setInstruction] = useState('')
  const [mode, setMode] = useState<ConversationMode>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [guestSessionState, setGuestSessionState] = useState<GuestSessionState>('idle')
  const [confirmStartOver, setConfirmStartOver] = useState(false)
  const [showSensitiveWarning, setShowSensitiveWarning] = useState(() => !isSensitiveWarningDismissed())
  const [deleteTarget, setDeleteTarget] = useState<AiOperationDto | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [conversionFailed, setConversionFailed] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const hydratedRef = useRef(false)

  const initializeGuestSession = useCallback(async (force = false, signal?: AbortSignal) => {
    if (!guest) return true
    if (!force && hasGuestCsrfCookie()) { setGuestSessionState('ready'); return true }
    setGuestSessionState('loading'); setError('')
    try { await aiApi.guestSession(signal); setGuestSessionState('ready'); return true }
    catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return false
      setGuestSessionState('error'); setError(t.sessionStartError); return false
    }
  }, [guest, t.sessionStartError])

  useEffect(() => {
    const scope = getIdentityScope(); const generation = getScopeGeneration(); const controller = new AbortController()
    requestRef.current?.abort(); requestRef.current = controller; hydratedRef.current = false
    if (!scope) return () => controller.abort()
    const saved = readAiConversation()
    queueMicrotask(() => {
      if (!isCurrentScope(scope, generation)) return
      setGoal(saved.goal); setComposerContext(saved.context); setMessages(saved.messages); setClarificationCount(saved.clarificationCount); setConversationLanguage(saved.conversationLanguage); setActiveOperationId(saved.activeOperationId)
      setCurrent(null); setConversion(null); setConversionFailed(false); setOperations([]); setInstruction(''); setMode(null); setError(''); setBusy(false); hydratedRef.current = true
    })
    if (guest) {
      const records = readGuestProposals()
      queueMicrotask(() => { if (isCurrentScope(scope, generation)) { setOperations(records.map((item) => item.operation)); setCurrent(records.find((item) => item.operation.id === saved.activeOperationId) ?? null) } })
      queueMicrotask(() => { if (isCurrentScope(scope, generation)) void initializeGuestSession(false, controller.signal) })
      return () => controller.abort()
    }
    queueMicrotask(() => { if (isCurrentScope(scope, generation)) setGuestSessionState('idle') })
    void aiApi.list().then(async (result) => {
      if (!isCurrentScope(scope, generation)) return
      setOperations(result.operations)
      const resume = result.operations.find((operation) => operation.id === saved.activeOperationId)
      if (resume) {
        const resumed = await aiApi.get(resume.id, controller.signal)
        if (isCurrentScope(scope, generation)) { setCurrent(resumed); setConversionFailed(resumed.operation.status === 'CONVERSION_FAILED'); if (['PLAN_PREVIEW_READY','COMPLETED'].includes(resumed.operation.status)) void aiApi.conversion(resume.id, controller.signal).then((value) => { if (isCurrentScope(scope, generation)) setConversion(value) }) }
      }
    }).catch(() => { if (!controller.signal.aborted && isCurrentScope(scope, generation)) setError(t.requestError) })
    return () => controller.abort()
  }, [guest, initializeGuestSession, session?.user.id, t.requestError])

  useEffect(() => {
    if (!hydratedRef.current || !getIdentityScope()) return
    saveAiConversation({ goal, context: composerContext, messages, clarificationCount, conversationLanguage, activeOperationId })
  }, [activeOperationId, clarificationCount, composerContext, conversationLanguage, goal, messages])

  useEffect(() => {
    if (!hydratedRef.current || !current?.proposal || !current.operation.currentProposalRevision) return
    queueMicrotask(() => setMessages((items) => items.some((item) => item.kind === 'proposal' && item.operationId === current.operation.id && item.revision === current.operation.currentProposalRevision)
      ? items
      : [...items, proposalMessage(current)!]))
  }, [current])

  useEffect(() => { window.setTimeout(() => composerRef.current?.focus(), 0) }, [messages.length, mode])

  function retain(result: AiProposalResult) {
    setCurrent(result)
    setActiveOperationId(result.operation.id)
    if (guest && result.proposal && result.signedProposalToken) setOperations(saveGuestProposal(result as GuestProposalRecord).map((item) => item.operation))
    else setOperations((items) => [result.operation, ...items.filter((item) => item.id !== result.operation.id)])
  }

  async function ensureGuest(signal?: AbortSignal) { return guest ? initializeGuestSession(false, signal) : true }

  function handleRequestError(reason: unknown) {
    if (guest && reason instanceof AiRequestError && ['AI_GUEST_NOT_CONFIGURED', 'AI_GUEST_SESSION_INVALID', 'AI_GUEST_SESSION_EXPIRED', 'INVALID_CSRF_TOKEN'].includes(reason.code)) { setGuestSessionState('error'); setError(t.sessionStartError); return }
    if (reason instanceof AiRequestError && ['AI_RATE_LIMITED', 'AI_PROVIDER_RATE_LIMITED', 'AI_PROPOSAL_LIMIT_REACHED', 'AI_PROPOSAL_REFINEMENT_LIMIT'].includes(reason.code)) { setError(t.rateLimitError); return }
    if (reason instanceof AiRequestError && ['AI_PROVIDER_TIMEOUT', 'AI_CONVERSION_TIMEOUT'].includes(reason.code)) { setError(t.conversionTimeoutError); return }
    if (reason instanceof AiRequestError && ['AI_PROVIDER_UNAVAILABLE', 'AI_CONVERSION_UNAVAILABLE'].includes(reason.code)) { setError(t.providerUnavailableError); return }
    if (reason instanceof AiRequestError && reason.code === 'AI_CONVERSION_INVALID_OUTPUT') { setError(t.conversionStructureError); return }
    if (reason instanceof AiRequestError && reason.code === 'AI_PROPOSAL_SENSITIVE_INPUT') { setError(t.sensitiveInputError); return }
    setError(t.requestError)
  }

  async function requestTurn(answer: string, continueWithAssumptions = false) {
    const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller
    const firstUserMessage = !messages.some((message) => message.role === 'user')
    const rootGoal = firstUserMessage ? answer.trim() : goal
    const userMessage: AiConversationMessage | null = answer.trim() ? { id: crypto.randomUUID(), role: 'user', kind: 'text', content: answer.trim() } : null
    const pendingMessages = userMessage ? [...messages, userMessage] : messages
    if (firstUserMessage) setGoal(rootGoal)
    setMessages(pendingMessages); setInstruction(''); setBusy(true); setError('')
    try {
      if (!await ensureGuest(controller.signal)) return
      const result = await aiApi.generate(buildProposalInput(rootGoal, composerContext, locale, {
        conversation: textConversation(pendingMessages), clarificationCount, continueWithAssumptions, preferredLanguage: conversationLanguage ?? locale,
      }), guest, controller.signal)
      if (!isCurrentScope(scope, generation)) return
      setConversationLanguage(result.turn.language)
      if (result.turn.action === 'ASK') {
        const question = result.turn.question
        setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', kind: 'text', content: question }])
        setClarificationCount((count) => Math.min(3, count + 1))
      } else {
        if (!result.operation || !result.proposal) throw new Error('Proposal response is incomplete.')
        const persisted = result as AiProposalResult
        retain(persisted)
        setMessages((items) => [...items, proposalMessage(persisted)!])
      }
    } catch (reason) {
      if (!controller.signal.aborted && isCurrentScope(scope, generation)) {
        // Keep the attempted answer in the composer, but do not persist it in
        // the transcript until the server accepts the turn. Otherwise each
        // retry duplicates the answer and eventually exceeds the eight-message
        // API boundary, masking the original provider failure with HTTP 400.
        setMessages(messages)
        handleRequestError(reason)
      }
    }
    finally { if (isCurrentScope(scope, generation)) setBusy(false) }
  }

  async function submitConversation(event: React.FormEvent) { event.preventDefault(); const value = messages.length ? instruction : goal; if (value.trim()) await requestTurn(value) }

  async function open(operation: AiOperationDto) {
    if (guest) { setCurrent(readGuestProposals().find((item) => item.operation.id === operation.id) ?? null); setConversion(null); setConversionFailed(false); setActiveOperationId(operation.id); return }
    const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    setBusy(true)
    try { const result = await aiApi.get(operation.id); if (isCurrentScope(scope, generation)) { setCurrent(result); setConversionFailed(result.operation.status === 'CONVERSION_FAILED'); setConversion(['PLAN_PREVIEW_READY','COMPLETED'].includes(result.operation.status) ? await aiApi.conversion(operation.id) : null); setActiveOperationId(operation.id) } }
    catch (reason) { if (isCurrentScope(scope, generation)) handleRequestError(reason) }
    finally { if (isCurrentScope(scope, generation)) setBusy(false) }
  }

  async function refine(event: React.FormEvent) {
    event.preventDefault(); if (!current?.proposal || !current.operation.currentProposalRevision || !instruction.trim()) return
    const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller
    const userMessage: AiConversationMessage = { id: crypto.randomUUID(), role: 'user', kind: 'text', content: instruction.trim() }
    setMessages((items) => [...items, userMessage]); setBusy(true); setError('')
    try {
      if (!await ensureGuest(controller.signal)) return
      const result = await aiApi.refine(current.operation.id, { clientRequestId: crypto.randomUUID(), expectedRevision: current.operation.currentProposalRevision, instruction: instruction.trim(), ...(guest ? { currentProposal: current.proposal, signedProposalToken: current.signedProposalToken } : {}) }, guest, controller.signal)
      if (isCurrentScope(scope, generation)) { retain(result); setMessages((items) => [...items, proposalMessage(result)!]); setInstruction(''); setMode(null) }
    } catch (reason) { if (!controller.signal.aborted && isCurrentScope(scope, generation)) handleRequestError(reason) }
    finally { if (isCurrentScope(scope, generation)) setBusy(false) }
  }

  async function transition(target: 'ready' | 'reject') {
    if (!current?.proposal || !current.operation.currentProposalRevision) return
    const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    setBusy(true); setError('')
    try {
      if (!await ensureGuest()) return
      const result = await aiApi.transition(current.operation.id, { expectedRevision: current.operation.currentProposalRevision, ...(guest ? { currentProposal: current.proposal, signedProposalToken: current.signedProposalToken } : {}) }, target, guest)
      if (isCurrentScope(scope, generation)) { retain(result); if (target === 'ready') await convert(result) }
    } catch (reason) { if (isCurrentScope(scope, generation)) handleRequestError(reason) }
    finally { if (isCurrentScope(scope, generation)) setBusy(false) }
  }

  async function convert(source = current) {
    if (!source?.proposal || !source.signedProposalToken && guest) return
    const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller
    setBusy(true); setError('')
    try {
      const result = await aiApi.convert(source.operation.id, { clientRequestId: crypto.randomUUID(), ...(guest ? { currentProposal: source.proposal, signedProposalToken: source.signedProposalToken } : {}) }, guest, controller.signal)
      if (!isCurrentScope(scope, generation)) return
      setConversion(result)
      setConversionFailed(false)
      setCurrent((value) => value ? { ...value, operation: { ...value.operation, status: result.status } } : value)
    } catch (reason) { if (!controller.signal.aborted && isCurrentScope(scope, generation)) { setConversionFailed(true); handleRequestError(reason) } }
    finally { if (isCurrentScope(scope, generation)) setBusy(false) }
  }

  async function createConvertedPlan() {
    if (!current || !conversion?.preview) return
    setBusy(true); setError('')
    try {
      if (guest) {
        if (!conversion.plan || !conversion.signedConversionToken) throw new Error('Guest conversion result is incomplete.')
        const plan = forgePlanFromAiSnapshot(conversion.plan, current.operation.id)
        addSessionPlan(plan)
        navigate(`/plans/${plan.id}/roadmap`)
        return
      }
      const result = await aiApi.createPlan(current.operation.id, { clientMutationId: crypto.randomUUID(), checksum: conversion.preview.checksum })
      const plan = fromRemote(result.plan)
      acceptServerPlan(plan)
      navigate(`/plans/${plan.id}/roadmap`)
    } catch (reason) { handleRequestError(reason) }
    finally { setBusy(false) }
  }

  async function resetWorkspace() {
    try {
      const empty = emptyAiConversationState(); clearAiConversation(); setCurrent(null); setConversion(null); setConversionFailed(false); setActiveOperationId(null); setGoal(empty.goal); setInstruction(''); setComposerContext(empty.context); setMessages(empty.messages); setClarificationCount(0); setConversationLanguage(null); setMode(null); setContextControlsKey((key) => key + 1); setError(''); setConfirmStartOver(false)
    } catch (reason) { handleRequestError(reason); setConfirmStartOver(false) }
  }

  function requestStartOver() {
    if (hasMeaningfulAiWorkspaceState({ goal, instruction, context: composerContext, hasProposal: Boolean(current) }) || messages.length) setConfirmStartOver(true)
    else void resetWorkspace()
  }

  async function confirmDeleteConversation() {
    if (!deleteTarget) return
    const scope = getIdentityScope(); const generation = getScopeGeneration(); if (!scope) return
    const operationId = deleteTarget.id
    setDeletingId(operationId); setError('')
    try {
      if (guest) deleteGuestConversation(operationId)
      else await aiApi.remove(operationId)
      if (!isCurrentScope(scope, generation)) return
      setOperations((items) => items.filter((item) => item.id !== operationId))
      if (current?.operation.id === operationId || activeOperationId === operationId) await resetWorkspace()
      else setMessages((items) => items.filter((message) => message.kind !== 'proposal' || message.operationId !== operationId))
      setDeleteTarget(null)
      window.setTimeout(() => composerRef.current?.focus(), 0)
    } catch (reason) { if (isCurrentScope(scope, generation)) handleRequestError(reason) }
    finally { if (isCurrentScope(scope, generation)) setDeletingId(null) }
  }

  const statusLabels = { PENDING: t.statusPending, PROPOSED: t.statusProposed, REFINING: t.statusRefining, READY_FOR_CONVERSION: t.statusReady, CONVERTING: t.statusConverting, PLAN_PREVIEW_READY: t.statusPreview, CONVERSION_FAILED: t.statusConversionFailed, COMPLETED: t.statusCompleted, REJECTED: t.statusRejected, FAILED: t.statusFailed, EXPIRED: t.statusExpired } as const
  const backControl = embedded ? <button className="btn btn-ghost ai-back-action" type="button" onClick={onBack}>← {t.back}</button> : <Link className="btn btn-ghost ai-back-action" to="/plans">← {t.back}</Link>
  const latestQuestion = [...messages].reverse().find((message) => message.role === 'assistant' && message.kind === 'text')
  const started = messages.some((message) => message.role === 'user')
  const canRetryConversion = Boolean(
    current?.proposal
    && !conversion?.preview
    && (conversionFailed || ['READY_FOR_CONVERSION', 'CONVERSION_FAILED'].includes(current.operation.status)),
  )

  return <main className={embedded ? 'ai-proposal-page ai-proposal-page--embedded' : 'ai-proposal-page'}>
    <header className="ai-proposal-header"><div className="ai-header-left">{backControl}</div><div className="ai-header-title"><span className="eyebrow">{t.assistant}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><div className="ai-header-spacer" aria-hidden="true" /></header>
    <div className="ai-proposal-layout">
      <aside className="ai-proposal-sidebar card"><h2>{t.resume}</h2>{operations.length ? operations.map((operation) => <div className="ai-operation-row" key={operation.id}><button type="button" onClick={() => void open(operation)}><strong>{operation.title ?? statusLabels[operation.status]}</strong><small>{statusLabels[operation.status]}</small></button><button type="button" className="ai-operation-delete" title={t.deleteConversation} aria-label={t.deleteConversation} disabled={deletingId === operation.id} onClick={() => setDeleteTarget(operation)}><TrashIcon width={15} height={15} /></button></div>) : <p>{t.empty}</p>}</aside>
      <section className="ai-proposal-main">
        {showSensitiveWarning ? <div className="ai-sensitive-warning" role="note"><span className="ai-sensitive-warning__icon" aria-hidden="true">⚠</span><p>{t.warning}</p><button type="button" className="ai-sensitive-warning__close" aria-label={t.dismissWarning} onClick={() => { dismissSensitiveWarning(); setShowSensitiveWarning(false) }}>×</button></div> : null}
        {guest && guestSessionState === 'error' ? <div className="ai-session-error" role="alert"><span>{t.sessionStartError}</span><button className="btn btn-ghost" type="button" onClick={() => void initializeGuestSession(true)}>{t.retrySession}</button></div> : null}
        <div className="ai-conversation-toolbar"><button className="btn btn-ghost" type="button" onClick={requestStartOver}>{t.startOver}</button></div>
        <div className="plans-ai-conversation" data-testid="inline-ai-conversation">
          <AssistantTypingMessage messageKey="workspace-greeting" text={t.greeting} author={t.assistant} typingLabel={t.typing} revealLabel={t.revealMessage} />
          {messages.map((message) => message.kind === 'text'
            ? message.role === 'assistant'
              ? <AssistantTypingMessage key={message.id} messageKey={message.id} text={message.content} author={t.assistant} typingLabel={t.typing} revealLabel={t.revealMessage} />
              : <div className="plans-ai-message plans-ai-message--user" key={message.id}><strong>{t.you}</strong><p>{message.content}</p></div>
            : <article className="plans-ai-message plans-ai-message--assistant ai-proposal-message" key={message.id} data-revision={message.revision}>
              <header><div><strong>{t.assistant}</strong><span className="status-badge">{t.statusProposed}</span></div><small>#{message.revision}</small></header>
              <h2>{message.proposal.title}</h2><p>{message.proposal.summary}</p>
              <dl className="ai-proposal-facts"><div><dt>{t.objective}</dt><dd>{message.proposal.primaryObjective}</dd></div><div><dt>{t.proposalDuration}</dt><dd>{message.proposal.recommendedDuration}</dd></div></dl>
              <section><h3>{t.phases}</h3><div className="ai-phase-grid">{message.proposal.phases.map((phase) => <section className="ai-phase" key={phase.title}><h4>{phase.title}</h4><p>{phase.purpose}</p><small>{phase.suggestedTimeframe}</small></section>)}</div></section>
              {[{ label: t.assumptions, items: message.proposal.assumptions }, { label: t.risks, items: message.proposal.risks }, { label: t.indicators, items: message.proposal.successIndicators }].map((section) => <section key={section.label}><h3>{section.label}</h3><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}
              {current?.operation.id === message.operationId && current.operation.currentProposalRevision === message.revision && current.operation.status === 'PROPOSED' ? <footer className="ai-proposal-actions"><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void transition('ready')}>{t.acceptProposal}</button><button className="btn" type="button" onClick={() => setMode('refine')}>{t.refineProposal}</button><button className="btn btn-danger" type="button" disabled={busy} onClick={() => void transition('reject')}>{t.reject}</button><button className="btn btn-ghost" type="button" onClick={() => setMode('continue')}>{t.continueTalking}</button></footer> : null}
            </article>)}
        </div>
        {conversion?.preview ? <article className="card ai-plan-preview" data-testid="ai-plan-preview">
          <header><div><span className="eyebrow">{t.planPreview}</span><h2>{conversion.preview.title}</h2></div><span className="status-badge">{t.statusPreview}</span></header>
          <p>{conversion.preview.objective}</p>
          <dl className="ai-plan-preview__metrics"><div><dt>{t.planDuration}</dt><dd>{conversion.preview.startDate} – {conversion.preview.endDate}</dd></div><div><dt>{t.goalsCount}</dt><dd>{conversion.preview.goalsCount}</dd></div><div><dt>{t.milestonesCount}</dt><dd>{conversion.preview.milestonesCount}</dd></div><div><dt>{t.activitiesCount}</dt><dd>{conversion.preview.activitiesCount}</dd></div><div><dt>{t.planningMode}</dt><dd>{conversion.preview.planningMode}</dd></div><div><dt>{t.savingsEnabled}</dt><dd>{conversion.preview.savingsEnabled ? t.enabled : t.disabled}</dd></div></dl>
          {conversion.preview.assumptions.length ? <section><h3>{t.assumptions}</h3><ul>{conversion.preview.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          {conversion.preview.warnings.length ? <section><h3>{t.warnings}</h3><ul>{conversion.preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          <footer><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void createConvertedPlan()}>{busy ? t.creatingPlan : t.createThisPlan}</button><button className="btn" type="button" disabled={busy || (conversion.regenerationCount ?? 0) >= 2} onClick={() => void convert()}>{t.regenerateStructure}</button><button className="btn btn-ghost" type="button" onClick={() => setConversion(null)}>{t.backToProposal}</button></footer>
        </article> : current?.operation.status === 'PLAN_PREVIEW_READY' ? <button className="btn" type="button" onClick={() => void aiApi.conversion(current.operation.id).then(setConversion)}>{t.openPreview}</button> : null}
        {!current?.proposal ? <form className="card ai-goal-form" onSubmit={submitConversation}>
          <label className="field-wrap"><span>{started ? t.answer : t.goal}</span><textarea ref={composerRef} className="field-input plans-ai-composer" required maxLength={2000} value={started ? instruction : goal} onChange={(event) => started ? setInstruction(event.target.value) : setGoal(event.target.value)} /></label>
          {!started ? <details><summary>{t.options}</summary><AiContextControls key={contextControlsKey} value={composerContext} onChange={setComposerContext} copy={t} /></details> : null}
          {error && guestSessionState !== 'error' ? <p className="auth-error" role="alert">{error}</p> : null}
          <div className="ai-composer-actions"><button className="btn btn-primary" disabled={busy || guestSessionState === 'loading' || guestSessionState === 'error'}>{busy || guestSessionState === 'loading' ? t.generating : started ? t.sendAnswer : t.send}</button>{clarificationCount >= 1 && latestQuestion ? <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void requestTurn('', true)}>{t.continueAssumptions}</button> : null}</div>
        </form> : mode ? <form className="card ai-refine-form ai-inline-followup" onSubmit={refine}><label className="field-wrap"><span>{mode === 'refine' ? t.instruction : t.editRequest}</span><textarea ref={composerRef} className="field-input" required maxLength={1500} value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label><div><button className="btn btn-primary" disabled={busy}>{busy ? t.generating : t.sendAnswer}</button><button className="btn btn-ghost" type="button" onClick={() => { setMode(null); setInstruction('') }}>{t.cancel}</button></div></form> : null}
        {error && current?.proposal ? <p className="auth-error" role="alert">{error}</p> : null}
        {canRetryConversion ? <div className="ai-conversion-action"><button className="btn btn-primary ai-conversion-retry" type="button" disabled={busy} onClick={() => void convert()}>{busy ? t.generatingStructure : t.retryConversion}</button></div> : null}
        {!conversion?.preview && current?.operation.status !== 'COMPLETED' ? <p className="ai-final-notice">{t.notCreated}</p> : null}
      </section>
    </div>
    <Modal open={confirmStartOver} title={t.startOverTitle} closeLabel="×" closeAriaLabel={t.cancel} onClose={() => setConfirmStartOver(false)} actions={<><button type="button" className="btn" onClick={() => setConfirmStartOver(false)}>{t.cancel}</button><button type="button" className="btn btn-danger" onClick={() => void resetWorkspace()}>{t.startOver}</button></>}><p>{t.startOverBody}</p><p>{t.startOverQuestion}</p></Modal>
    <Modal open={Boolean(deleteTarget)} title={t.deleteConversation} closeLabel="×" closeAriaLabel={t.cancel} onClose={() => { if (!deletingId) setDeleteTarget(null) }} actions={<><button type="button" className="btn" disabled={Boolean(deletingId)} onClick={() => setDeleteTarget(null)}>{t.cancel}</button><button type="button" className="btn btn-danger" disabled={Boolean(deletingId)} onClick={() => void confirmDeleteConversation()}>{t.delete}</button></>}><p>{t.deleteConversationBody}</p></Modal>
  </main>
}
