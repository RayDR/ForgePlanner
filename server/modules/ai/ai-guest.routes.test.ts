import express from 'express'
import cookieParser from 'cookie-parser'
import type { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../../config/env.js'
import { errorHandler } from '../../http/errors.js'
import { aiProposalRoutes } from './ai.routes.js'

const env = {
  NODE_ENV: 'test', PORT: 4100, DATABASE_URL: 'postgresql://unused', APP_ORIGIN: 'http://localhost:5173', SESSION_TTL_HOURS: 24,
  COOKIE_SECURE: false, TRUST_PROXY: false, REGISTRATION_ENABLED: true, EMAIL_VERIFICATION_REQUIRED: false, RECAPTCHA_MIN_SCORE: 0.5,
  PASSWORD_RESET_TTL_MINUTES: 30, EMAIL_VERIFICATION_TTL_HOURS: 24, SMTP_PORT: 587, SMTP_SECURE: false,
  SMTP_FROM_NAME: 'NorthStar Planner', AI_GUEST_SESSION_SIGNING_KEY: 'guest-test-key-that-is-at-least-32-characters',
  AI_PROVIDER: 'mock', OPENAI_PROPOSAL_MODEL: 'gpt-5.6-sol', OPENAI_CONVERSION_MODEL: 'gpt-5.6-sol', OPENAI_TIMEOUT_MS: 20_000,
} satisfies AppEnv

function guestApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/ai', aiProposalRoutes(new Proxy({}, { get() { throw new Error('Guest AI must not access PostgreSQL.') } }) as PrismaClient, env))
  app.use(errorHandler)
  return app
}

describe('guest AI proposal HTTP lifecycle', () => {
  it('runs the complete business clarification flow inline before proposing', async () => {
    const agent = request.agent(guestApp())
    const initialized = await agent.post('/api/ai/guest/session').expect(200)
    const csrf = initialized.body.csrfToken as string
    const base = { preferredLanguage: 'en', locale: 'en', constraints: [], nonNegotiables: [], planIntensity: 'balanced' }
    const first = await agent.post('/api/ai/guest/plan-proposals').set('x-ai-guest-csrf', csrf).send({ ...base, clientRequestId: crypto.randomUUID(), goal: 'I want to open a business', conversation: [], clarificationCount: 0 }).expect(201)
    expect(first.body.turn).toMatchObject({ action: 'ASK', question: 'What type of business do you want to open?' })
    expect(first.body.operation).toBeUndefined()
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: 'I want to open a business' }, { role: 'assistant', content: first.body.turn.question }, { role: 'user', content: 'A coffee shop' }]
    const second = await agent.post('/api/ai/guest/plan-proposals').set('x-ai-guest-csrf', csrf).send({ ...base, clientRequestId: crypto.randomUUID(), goal: 'I want to open a business', conversation: messages, clarificationCount: 1 }).expect(201)
    expect(second.body.turn).toMatchObject({ action: 'ASK', question: 'What budget and timeline are you considering?' })
    messages.push({ role: 'assistant', content: second.body.turn.question }, { role: 'user', content: '$15,000 and 12 months' })
    const third = await agent.post('/api/ai/guest/plan-proposals').set('x-ai-guest-csrf', csrf).send({ ...base, clientRequestId: crypto.randomUUID(), goal: 'I want to open a business', conversation: messages, clarificationCount: 2 }).expect(201)
    expect(third.body.turn.action).toBe('PROPOSE')
    expect(third.body.proposal.title).toContain('coffee shop')
    expect(third.body.operation.currentProposalRevision).toBe(1)
  })

  it('initializes, generates and refines with signed cookies and without PostgreSQL', async () => {
    const agent = request.agent(guestApp())
    const initialized = await agent.post('/api/ai/guest/session').expect(200)
    const csrf = initialized.body.csrfToken as string
    expect(csrf).toBeTruthy()

    const generated = await agent.post('/api/ai/guest/plan-proposals').set('x-ai-guest-csrf', csrf).send({
      clientRequestId: crypto.randomUUID(), goal: 'Prepare a six month career plan', preferredLanguage: 'en', locale: 'en', constraints: [], nonNegotiables: [], planIntensity: 'balanced',
    }).expect(201)
    expect(generated.body.operation.currentProposalRevision).toBe(1)
    expect(generated.body.signedProposalToken).toBeTruthy()

    const refined = await agent.post(`/api/ai/guest/plan-proposals/${generated.body.operation.id}/refine`).set('x-ai-guest-csrf', csrf).send({
      clientRequestId: crypto.randomUUID(), expectedRevision: 1, instruction: 'Make the weekly workload lighter', currentProposal: generated.body.proposal, signedProposalToken: generated.body.signedProposalToken,
    }).expect(200)
    expect(refined.body.operation.currentProposalRevision).toBe(2)
    expect(refined.body.proposal).toBeTruthy()
  })

  it('keeps server-side sensitive-input rejection active for guests', async () => {
    const agent = request.agent(guestApp())
    const initialized = await agent.post('/api/ai/guest/session').expect(200)
    await agent.post('/api/ai/guest/plan-proposals').set('x-ai-guest-csrf', initialized.body.csrfToken).send({
      clientRequestId: crypto.randomUUID(), goal: 'password=super-secret-value', preferredLanguage: 'en', locale: 'en', constraints: [], nonNegotiables: [], planIntensity: 'balanced',
    }).expect(400).expect(({ body }) => expect(body.error.code).toBe('AI_PROPOSAL_SENSITIVE_INPUT'))
  })

  it('converts an accepted guest proposal without PostgreSQL and returns a bounded signed result', async () => {
    const agent = request.agent(guestApp()); const initialized = await agent.post('/api/ai/guest/session').expect(200); const csrf = initialized.body.csrfToken as string
    const generated = await agent.post('/api/ai/guest/plan-proposals').set('x-ai-guest-csrf', csrf).send({ clientRequestId: crypto.randomUUID(), goal: 'Build a detailed six month backend engineering plan', durationMonths: 6, hoursPerWeek: 5, preferredLanguage: 'en', locale: 'en', constraints: [], nonNegotiables: [], planIntensity: 'balanced', planningScope: 'balanced', detailLevel: 'detailed', financialMode: 'none', continueWithAssumptions: true }).expect(201)
    const ready = await agent.post(`/api/ai/guest/plan-proposals/${generated.body.operation.id}/ready`).set('x-ai-guest-csrf', csrf).send({ expectedRevision: 1, currentProposal: generated.body.proposal, signedProposalToken: generated.body.signedProposalToken }).expect(200)
    const converted = await agent.post(`/api/ai/guest/plan-proposals/${generated.body.operation.id}/convert`).set('x-ai-guest-csrf', csrf).send({ clientRequestId: crypto.randomUUID(), currentProposal: ready.body.proposal, signedProposalToken: ready.body.signedProposalToken }).expect(200)
    expect(converted.body).toMatchObject({ status: 'PLAN_PREVIEW_READY', plan: { schemaVersion: 8, metadata: { origin: 'ai', contentLanguage: 'en' } }, preview: { activitiesCount: expect.any(Number) } })
    expect(converted.body.signedConversionToken).toBeTruthy()
    const payload = JSON.parse(Buffer.from(String(converted.body.signedConversionToken).split('.')[0], 'base64url').toString('utf8'))
    expect(payload).not.toHaveProperty('plan'); expect(payload).not.toHaveProperty('snapshot'); expect(payload.planChecksum).toBe(converted.body.preview.checksum)
  })
})
