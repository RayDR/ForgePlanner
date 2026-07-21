import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCanonicalPlanFixture } from '../../../shared/plan-contract/index.js'
import { PlanService } from './plan.service.js'
import { PlanVersionService } from './plan-version.service.js'
import { PlanVersionBackfillService, PlanVersionVerificationService } from './plan-version-backfill.service.js'
import { prepareVersionSnapshot } from './plan-version-integrity.js'

const testUrl = process.env.TEST_DATABASE_URL
const integration = testUrl ? describe : describe.skip
const identity = (userId: string) => ({ actorUserId: userId, effectiveUserId: userId })
const createInput = (name = 'Versioned plan') => {
  const snapshot = createCanonicalPlanFixture()
  return { clientMutationId: randomUUID(), status: 'active' as const, snapshot: { ...snapshot, project: { ...snapshot.project, name } } }
}
const updateInput = (name: string, expectedRevision: number) => {
  const snapshot = createCanonicalPlanFixture()
  return { expectedRevision, snapshot: { ...snapshot, project: { ...snapshot.project, name } } }
}

async function dropCurrentVersionConstraint(db: PrismaClient) {
  await db.$executeRawUnsafe('ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_current_version_fkey"')
}

async function addCurrentVersionConstraint(db: PrismaClient) {
  await db.$executeRawUnsafe(`ALTER TABLE "Plan" ADD CONSTRAINT "Plan_current_version_fkey"
    FOREIGN KEY ("id", "revision") REFERENCES "PlanVersion"("plan_id", "revision")
    DEFERRABLE INITIALLY DEFERRED NOT VALID`)
}

integration('immutable PostgreSQL plan version history', () => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl ?? 'postgresql://test:test@127.0.0.1:1/stage5_test' } } })
  let owner: { id: string }
  let editor: { id: string }
  let viewer: { id: string }

  beforeAll(async () => { await db.$connect() })
  afterAll(async () => { await db.$disconnect() })
  beforeEach(async () => {
    await db.auditLog.deleteMany(); await db.planAccess.deleteMany(); await db.planShareLink.deleteMany(); await db.plan.deleteMany(); await db.profile.deleteMany(); await db.user.deleteMany()
    owner = await db.user.create({ data: { email: `owner-${randomUUID()}@test.invalid`, passwordHash: 'test', profile: { create: { displayName: 'Plan Owner', handle: `owner-${randomUUID().slice(0, 8)}`, discriminator: '0001' } } }, select: { id: true } })
    editor = await db.user.create({ data: { email: `editor-${randomUUID()}@test.invalid`, passwordHash: 'test', profile: { create: { displayName: 'Plan Editor', handle: `editor-${randomUUID().slice(0, 8)}`, discriminator: '0001' } } }, select: { id: true } })
    viewer = await db.user.create({ data: { email: `viewer-${randomUUID()}@test.invalid`, passwordHash: 'test', profile: { create: { displayName: 'Plan Viewer', handle: `viewer-${randomUUID().slice(0, 8)}`, discriminator: '0001' } } }, select: { id: true } })
  })

  it('creates immutable UUID versions with linear parent lineage and exact size metadata', async () => {
    const plans = new PlanService(db)
    const created = await plans.create(owner.id, createInput(), identity(owner.id))
    await plans.update(owner.id, created.plan.id, updateInput('Revision two', 1), identity(owner.id))
    const versions = await db.planVersion.findMany({ where: { planId: created.plan.id }, orderBy: { revision: 'asc' } })
    expect(versions).toHaveLength(2)
    expect(versions[0]).toMatchObject({ revision: 1, source: 'USER', parentVersionId: null, restoredFromVersionId: null })
    expect(versions[1]).toMatchObject({ revision: 2, source: 'USER', parentVersionId: versions[0].id, restoredFromVersionId: null })
    expect(versions[0].id).not.toBe(versions[1].id)
    expect(versions[0].snapshotSizeBytes).toBe(prepareVersionSnapshot(versions[0].snapshot).snapshotSizeBytes)
    expect(await db.planVersion.count({ where: { planId: created.plan.id, revision: 2 } })).toBe(1)
  })

  it('restores into a new linear revision without rewriting history', async () => {
    const plans = new PlanService(db); const history = new PlanVersionService(db)
    const created = await plans.create(owner.id, createInput('Original'), identity(owner.id))
    await plans.update(owner.id, created.plan.id, updateInput('Second', 1), identity(owner.id))
    await plans.update(owner.id, created.plan.id, updateInput('Third', 2), identity(owner.id))
    const before = await db.planVersion.findMany({ where: { planId: created.plan.id }, orderBy: { revision: 'asc' } })
    const restored = await history.restore(owner.id, created.plan.id, 1, 3, identity(owner.id))
    const after = await db.planVersion.findMany({ where: { planId: created.plan.id }, orderBy: { revision: 'asc' } })
    expect(restored).toMatchObject({ restoredFromRevision: 1, createdRevision: 4, plan: { name: 'Original', revision: 4 } })
    expect(after.slice(0, 3).map(({ id, checksum }) => ({ id, checksum }))).toEqual(before.map(({ id, checksum }) => ({ id, checksum })))
    expect(after[3]).toMatchObject({ source: 'VERSION_RESTORE', parentVersionId: before[2].id, restoredFromVersionId: before[0].id })
  })

  it('keeps history metadata bounded and enforces viewer/editor access immediately', async () => {
    const plans = new PlanService(db); const history = new PlanVersionService(db)
    const created = await plans.create(owner.id, createInput(), identity(owner.id))
    await db.planAccess.createMany({ data: [
      { planId: created.plan.id, userId: editor.id, grantedByUserId: owner.id, accessLevel: 'editor', status: 'accepted' },
      { planId: created.plan.id, userId: viewer.id, grantedByUserId: owner.id, accessLevel: 'viewer', status: 'accepted' },
    ] })
    const ownerList = await history.list(owner.id, created.plan.id, { page: 1, limit: 25 })
    const viewerList = await history.list(viewer.id, created.plan.id, { page: 1, limit: 25 })
    expect(ownerList.versions[0]).toMatchObject({ actorDisplayName: 'Plan Owner' })
    expect(ownerList.versions[0]).not.toHaveProperty('snapshot')
    expect(viewerList.versions[0]).not.toHaveProperty('actorDisplayName')
    await expect(history.get(viewer.id, created.plan.id, 1)).rejects.toMatchObject({ status: 404 })
    await expect(history.get(editor.id, created.plan.id, 1)).resolves.toMatchObject({ revision: 1 })
    await db.planAccess.update({ where: { planId_userId: { planId: created.plan.id, userId: editor.id } }, data: { status: 'revoked', revokedAt: new Date() } })
    await expect(history.get(editor.id, created.plan.id, 1)).rejects.toMatchObject({ status: 404 })
    await expect(history.restore(editor.id, created.plan.id, 1, 1, identity(editor.id))).rejects.toMatchObject({ status: 404 })
  })

  it('does not create versions for an unchanged import and protects changed imports with concurrency', async () => {
    const plans = new PlanService(db); const importKey = `import-${randomUUID()}`
    const first = await plans.import(owner.id, [{ ...createInput('Imported'), importKey }], identity(owner.id))
    await plans.import(owner.id, [{ ...createInput('Imported'), importKey }], identity(owner.id))
    expect(await db.planVersion.count({ where: { planId: first[0].id } })).toBe(1)
    const changed = { ...createInput('Changed import'), importKey }
    const race = await Promise.allSettled([plans.import(owner.id, [changed], identity(owner.id)), plans.import(owner.id, [changed], identity(owner.id))])
    expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await db.planVersion.count({ where: { planId: first[0].id } })).toBe(2)
    expect((await db.planVersion.findMany({ where: { planId: first[0].id }, orderBy: { revision: 'asc' } })).map((item) => item.source)).toEqual(['IMPORT', 'IMPORT'])
  })

  it('versions trash delete/restore and cascades all private snapshots on permanent deletion', async () => {
    const plans = new PlanService(db); const created = await plans.create(owner.id, createInput(), identity(owner.id))
    await plans.remove(owner.id, created.plan.id, { expectedRevision: 1 }, identity(owner.id))
    await plans.restore(owner.id, created.plan.id, { expectedRevision: 2 }, identity(owner.id))
    expect((await db.planVersion.findMany({ where: { planId: created.plan.id }, orderBy: { revision: 'asc' } })).map((item) => item.source)).toEqual(['USER', 'TRASH_DELETE', 'TRASH_RESTORE'])
    await plans.remove(owner.id, created.plan.id, { expectedRevision: 3 }, identity(owner.id))
    await plans.permanentlyRemove(owner.id, created.plan.id, { expectedRevision: 4 }, identity(owner.id))
    expect(await db.planVersion.count({ where: { planId: created.plan.id } })).toBe(0)
  })

  it('detects history corruption but still permits permanent privacy deletion', async () => {
    const plans = new PlanService(db); const history = new PlanVersionService(db)
    const created = await plans.create(owner.id, createInput(), identity(owner.id))
    await db.planVersion.update({ where: { planId_revision: { planId: created.plan.id, revision: 1 } }, data: { checksum: '0'.repeat(64) } })
    await expect(history.get(owner.id, created.plan.id, 1)).rejects.toMatchObject({ code: 'PLAN_VERSION_INTEGRITY_ERROR' })
    await plans.remove(owner.id, created.plan.id, { expectedRevision: 1 }, identity(owner.id))
    await expect(plans.permanentlyRemove(owner.id, created.plan.id, { expectedRevision: 2 }, identity(owner.id))).resolves.toEqual({ deleted: true })
  })

  it('backfills a missing v7 current version once, verifies it, and validates the deferred invariant', async () => {
    const plans = new PlanService(db); const created = await plans.create(owner.id, createInput(), identity(owner.id))
    const canonical = createCanonicalPlanFixture()
    const v7 = { schemaVersion: 7, project: { ...canonical.project, selectedYear: 2026, statusDefinitions: canonical.project.statusDefinitions.map((status) => ({ id: status.id, label: status.label, colorKey: status.colorKey, order: status.order, isDefault: status.id === 'planned' })) }, activities: canonical.activities, trash: canonical.trash, relationships: canonical.relationships, selectedYear: 2026, selectedMonthId: '2026-01', locale: 'en', theme: 'dark' }
    await dropCurrentVersionConstraint(db)
    try {
      await db.planVersion.deleteMany({ where: { planId: created.plan.id } })
      await db.plan.update({ where: { id: created.plan.id }, data: { snapshot: v7 } })
      await addCurrentVersionConstraint(db)
      const backfill = new PlanVersionBackfillService(db)
      expect(await backfill.run({ limit: 1, planId: created.plan.id, dryRun: true })).toMatchObject({ SCANNED: 1, CREATED: 0, SKIPPED: 1, dryRun: true })
      expect(await backfill.run({ limit: 1, planId: created.plan.id, dryRun: false })).toMatchObject({ SCANNED: 1, CREATED: 1, invariantValidated: true })
      expect(await backfill.run({ limit: 1, planId: created.plan.id, dryRun: false })).toMatchObject({ SCANNED: 1, UNCHANGED: 1 })
      expect(((await db.plan.findUniqueOrThrow({ where: { id: created.plan.id } })).snapshot as { schemaVersion: number }).schemaVersion).toBe(8)
      expect(await new PlanVersionVerificationService(db).run({ limit: 1, planId: created.plan.id })).toMatchObject({ scanned: 1, valid: 1, corrupted: 0 })
    } catch (error) {
      await dropCurrentVersionConstraint(db); await addCurrentVersionConstraint(db)
      throw error
    }
  })

  it('prevents a transaction from committing a Plan revision without its matching version', async () => {
    const plans = new PlanService(db); const created = await plans.create(owner.id, createInput(), identity(owner.id))
    await expect(db.$transaction(async (tx) => { await tx.plan.update({ where: { id: created.plan.id }, data: { revision: 2 } }) })).rejects.toBeTruthy()
    expect((await db.plan.findUniqueOrThrow({ where: { id: created.plan.id } })).revision).toBe(1)
  })
})
