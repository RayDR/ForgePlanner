import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AppEnv } from '../../config/env.js'
import { createApp } from '../../app.js'
import { hashToken } from '../../security/crypto.js'
import { PlanService } from './plan.service.js'

const testUrl = process.env.TEST_DATABASE_URL
const integration = testUrl ? describe : describe.skip
const env = {
  NODE_ENV: 'test', PORT: 4100, DATABASE_URL: testUrl ?? 'postgresql://test', APP_ORIGIN: 'http://localhost:5173',
  SESSION_TTL_HOURS: 24, COOKIE_SECURE: false, TRUST_PROXY: false, REGISTRATION_ENABLED: true, EMAIL_VERIFICATION_REQUIRED: false,
  RECAPTCHA_MIN_SCORE: 0.5, PASSWORD_RESET_TTL_MINUTES: 30, EMAIL_VERIFICATION_TTL_HOURS: 24,
  SMTP_PORT: 587, SMTP_SECURE: false, SMTP_FROM_NAME: 'NorthStar Planner',
} satisfies AppEnv

const snapshot = { schemaVersion: 7, project: { id: randomUUID() }, activities: [] }
const input = (clientMutationId = randomUUID(), name = 'Integration plan') => ({
  clientMutationId, name, objective: 'Test', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active', snapshot,
})
const identity = (userId: string) => ({ actorUserId: userId, effectiveUserId: userId })

integration('PostgreSQL plan authority', () => {
  // Vitest still evaluates a skipped suite's declaration callback. Use a
  // deliberately unreachable URL here so the normal unit suite can collect
  // this file without opening a database connection.
  const db = new PrismaClient({ datasources: { db: { url: testUrl ?? 'postgresql://test:test@127.0.0.1:1/stage2_test' } } })
  let userA: { id: string }
  let userB: { id: string }

  beforeAll(async () => { await db.$connect() })
  afterAll(async () => { await db.$disconnect() })
  beforeEach(async () => {
    await db.auditLog.deleteMany(); await db.planAccess.deleteMany(); await db.planShareLink.deleteMany(); await db.plan.deleteMany(); await db.session.deleteMany(); await db.userRole.deleteMany(); await db.rolePermission.deleteMany(); await db.permission.deleteMany(); await db.role.deleteMany(); await db.user.deleteMany()
    userA = await db.user.create({ data: { email: `a-${randomUUID()}@test.invalid`, passwordHash: 'test' }, select: { id: true } })
    userB = await db.user.create({ data: { email: `b-${randomUUID()}@test.invalid`, passwordHash: 'test' }, select: { id: true } })
  })

  it('creates once per owner and mutation ID with first-successful-request-wins semantics', async () => {
    const service = new PlanService(db); const mutation = randomUUID()
    const first = await service.create(userA.id, input(mutation, 'Original'), identity(userA.id))
    const retry = await service.create(userA.id, input(mutation, 'Different retry payload'), identity(userA.id))
    const anotherOwner = await service.create(userB.id, input(mutation, 'Other owner'), identity(userB.id))

    expect(first.created).toBe(true); expect(retry.created).toBe(false); expect(retry.plan.id).toBe(first.plan.id)
    expect(retry.plan.name).toBe('Original'); expect(retry.plan.revision).toBe(1)
    expect(anotherOwner.created).toBe(true); expect(anotherOwner.plan.id).not.toBe(first.plan.id)
    expect(await db.plan.count()).toBe(2)
    expect(await db.auditLog.count({ where: { action: 'plan.created', targetId: first.plan.id } })).toBe(1)
    expect(first.plan).not.toHaveProperty('clientMutationId'); expect(first.plan).not.toHaveProperty('ownerUserId')
  })

  it('derives owner from the authenticated session and ignores body ownership fields', async () => {
    const permission = await db.permission.create({ data: { key: 'plan.create', description: 'test' } })
    const role = await db.role.create({ data: { key: `test-${randomUUID().slice(0, 8)}`, name: 'Test role', permissions: { create: { permissionId: permission.id } } } })
    await db.userRole.create({ data: { userId: userA.id, roleId: role.id } })
    const token = `session-${randomUUID()}`; const csrf = `csrf-${randomUUID()}`
    await db.session.create({ data: { userId: userA.id, tokenHash: hashToken(token), csrfTokenHash: hashToken(csrf), expiresAt: new Date(Date.now() + 60_000) } })

    const response = await request(createApp(db, env)).post('/api/plans').set('Cookie', [`northstar_session=${token}`, `northstar_csrf=${csrf}`]).set('x-csrf-token', csrf).send({ ...input(), ownerUserId: userB.id, revision: 99, deletedAt: new Date().toISOString(), sharingEnabled: false })
    expect(response.status).toBe(201); expect(response.body.created).toBe(true)
    const stored = await db.plan.findUniqueOrThrow({ where: { id: response.body.plan.id } })
    expect(stored.ownerUserId).toBe(userA.id); expect(stored.revision).toBe(1); expect(stored.deletedAt).toBeNull(); expect(stored.sharingEnabled).toBe(true)
    expect(response.body.plan).not.toHaveProperty('ownerUserId'); expect(response.body.plan).not.toHaveProperty('clientMutationId')
  })

  it('enforces revisions atomically and prevents cross-owner updates', async () => {
    const service = new PlanService(db)
    const created = await service.create(userA.id, input(), identity(userA.id))
    const planId = created.plan.id
    const update = { name: 'Revision two', expectedRevision: 1 }
    const current = await service.update(userA.id, planId, update, identity(userA.id))
    expect(current.revision).toBe(2)
    await expect(service.update(userA.id, planId, { name: 'Stale', expectedRevision: 1 }, identity(userA.id))).rejects.toMatchObject({ status: 409, code: 'PLAN_VERSION_CONFLICT', details: { currentRevision: 2 } })
    await expect(service.update(userB.id, planId, { name: 'Unauthorized', expectedRevision: 2 }, identity(userB.id))).rejects.toMatchObject({ status: 404, code: 'PLAN_NOT_FOUND' })

    const concurrent = await Promise.allSettled([
      service.update(userA.id, planId, { name: 'Concurrent A', expectedRevision: 2 }, identity(userA.id)),
      service.update(userA.id, planId, { name: 'Concurrent B', expectedRevision: 2 }, identity(userA.id)),
    ])
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await db.plan.findUniqueOrThrow({ where: { id: planId } })).revision).toBe(3)
  })

  it('includes sharing authorization in the atomic update and rejects revoked access', async () => {
    const service = new PlanService(db)
    const created = await service.create(userA.id, input(), identity(userA.id)); const planId = created.plan.id
    await db.planAccess.create({ data: { planId, userId: userB.id, grantedByUserId: userA.id, accessLevel: 'editor', status: 'accepted', acceptedAt: new Date() } })
    const edited = await service.update(userB.id, planId, { name: 'Shared edit', expectedRevision: 1 }, identity(userB.id))
    expect(edited.revision).toBe(2)
    await db.planAccess.update({ where: { planId_userId: { planId, userId: userB.id } }, data: { status: 'revoked', revokedAt: new Date() } })
    await expect(service.update(userB.id, planId, { name: 'After revoke', expectedRevision: 2 }, identity(userB.id))).rejects.toMatchObject({ status: 404, code: 'PLAN_NOT_FOUND' })
    expect((await db.plan.findUniqueOrThrow({ where: { id: planId } })).name).toBe('Shared edit')
  })

  it('rolls back plan creation when its audit write fails', async () => {
    const service = new PlanService(db); const mutation = randomUUID(); const missingActor = randomUUID()
    await expect(service.create(userA.id, input(mutation), { actorUserId: missingActor, effectiveUserId: userA.id })).rejects.toBeTruthy()
    expect(await db.plan.findUnique({ where: { ownerUserId_clientMutationId: { ownerUserId: userA.id, clientMutationId: mutation } } })).toBeNull()
  })
})
