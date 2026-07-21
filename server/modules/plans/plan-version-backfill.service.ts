import { Prisma, type PrismaClient } from '@prisma/client'
import { derivePlanRelationalMetadata } from '../../../shared/plan-contract/index.js'
import { prepareVersionSnapshot, verifyStoredVersion } from './plan-version-integrity.js'

export interface PlanVersionBackfillResult {
  SCANNED: number
  CREATED: number
  UNCHANGED: number
  CORRUPTED: number
  CONFLICT: number
  FAILED: number
  SKIPPED: number
  dryRun: boolean
  nextCursor: string | null
  invariantValidated: boolean
}

function relational(snapshot: ReturnType<typeof prepareVersionSnapshot>['snapshot']) {
  const metadata = derivePlanRelationalMetadata(snapshot)
  return { ...metadata, startDate: new Date(`${metadata.startDate}T00:00:00Z`), endDate: new Date(`${metadata.endDate}T00:00:00Z`) }
}

export class PlanVersionBackfillService {
  constructor(private db: PrismaClient) {}

  async run(input: { limit: number; cursor?: string; planId?: string; dryRun: boolean }): Promise<PlanVersionBackfillResult> {
    const plans = await this.db.plan.findMany({ where: { ...(input.planId ? { id: input.planId } : {}), ...(input.cursor ? { id: { gt: input.cursor } } : {}) }, orderBy: { id: 'asc' }, take: input.limit, select: { id: true, revision: true, snapshot: true } })
    const result: PlanVersionBackfillResult = { SCANNED: plans.length, CREATED: 0, UNCHANGED: 0, CORRUPTED: 0, CONFLICT: 0, FAILED: 0, SKIPPED: 0, dryRun: input.dryRun, nextCursor: plans.at(-1)?.id ?? null, invariantValidated: false }
    for (const plan of plans) {
      let prepared: ReturnType<typeof prepareVersionSnapshot>
      try { prepared = prepareVersionSnapshot(plan.snapshot, { status: 500, code: 'CORRUPTED_PLAN_SNAPSHOT' }) } catch { result.CORRUPTED += 1; continue }
      const existing = await this.db.planVersion.findUnique({ where: { planId_revision: { planId: plan.id, revision: plan.revision } } })
      if (existing) {
        try { verifyStoredVersion(existing); if (existing.checksum === prepared.checksum) result.UNCHANGED += 1; else result.CONFLICT += 1 } catch { result.CONFLICT += 1 }
        continue
      }
      if (input.dryRun) { result.SKIPPED += 1; continue }
      try {
        const outcome = await this.db.$transaction(async (tx) => {
          const current = await tx.plan.findUnique({ where: { id: plan.id }, select: { revision: true, snapshot: true } })
          if (!current || current.revision !== plan.revision) return 'CONFLICT' as const
          const concurrentVersion = await tx.planVersion.findUnique({ where: { planId_revision: { planId: plan.id, revision: plan.revision } } })
          if (concurrentVersion) return concurrentVersion.checksum === prepared.checksum ? 'UNCHANGED' as const : 'CONFLICT' as const
          const normalized = prepareVersionSnapshot(current.snapshot, { status: 500, code: 'CORRUPTED_PLAN_SNAPSHOT' })
          await tx.plan.update({ where: { id: plan.id }, data: { snapshot: normalized.snapshot as Prisma.InputJsonValue, ...relational(normalized.snapshot) } })
          await tx.planVersion.create({ data: { planId: plan.id, revision: plan.revision, schemaVersion: normalized.schemaVersion, snapshot: normalized.snapshot as Prisma.InputJsonValue, source: 'MIGRATION', checksum: normalized.checksum, snapshotSizeBytes: normalized.snapshotSizeBytes } })
          return 'CREATED' as const
        })
        result[outcome] += 1
      } catch { result.FAILED += 1 }
    }
    if (!input.dryRun) {
      await this.db.auditLog.create({ data: { action: 'plan.version_backfill_completed', targetType: 'maintenance', metadata: { SCANNED: result.SCANNED, CREATED: result.CREATED, UNCHANGED: result.UNCHANGED, CORRUPTED: result.CORRUPTED, CONFLICT: result.CONFLICT, FAILED: result.FAILED, SKIPPED: result.SKIPPED } } })
      const missing = await this.db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "Plan" p LEFT JOIN "PlanVersion" v ON v."plan_id" = p."id" AND v."revision" = p."revision" WHERE v."id" IS NULL`
      if (missing[0]?.count === 0n) {
        await this.db.$executeRawUnsafe('ALTER TABLE "Plan" VALIDATE CONSTRAINT "Plan_current_version_fkey"')
        result.invariantValidated = true
      }
    }
    return result
  }
}

export class PlanVersionVerificationService {
  constructor(private db: PrismaClient) {}
  async run(input: { limit: number; cursor?: string; planId?: string }) {
    const versions = await this.db.planVersion.findMany({ where: { ...(input.planId ? { planId: input.planId } : {}), ...(input.cursor ? { id: { gt: input.cursor } } : {}) }, orderBy: { id: 'asc' }, take: input.limit, select: { id: true, snapshot: true, checksum: true, snapshotSizeBytes: true } })
    const result = { scanned: versions.length, valid: 0, corrupted: 0, failed: 0, nextCursor: versions.at(-1)?.id ?? null }
    for (const version of versions) { try { verifyStoredVersion(version); result.valid += 1 } catch { result.corrupted += 1 } }
    return result
  }
}
