import type { PrismaClient } from '@prisma/client'

export interface PlanTrashPurgeResult {
  scanned: number
  deleted: number
  skipped: number
  failed: number
  dryRun: boolean
}

export class PlanTrashPurgeService {
  constructor(private db: PrismaClient, private now: () => Date = () => new Date()) {}

  async run(input: { limit: number; dryRun: boolean }): Promise<PlanTrashPurgeResult> {
    const now = this.now()
    const candidates = await this.db.plan.findMany({
      where: { deletedAt: { not: null }, purgeAfter: { lte: now } },
      orderBy: [{ purgeAfter: 'asc' }, { id: 'asc' }],
      take: input.limit,
      select: { id: true },
    })
    if (input.dryRun || candidates.length === 0) return { scanned: candidates.length, deleted: 0, skipped: candidates.length, failed: 0, dryRun: input.dryRun }

    const result: PlanTrashPurgeResult = { scanned: candidates.length, deleted: 0, skipped: 0, failed: 0, dryRun: false }
    for (const candidate of candidates) {
      try {
        const deletion = await this.db.plan.deleteMany({
          where: { id: candidate.id, deletedAt: { not: null }, purgeAfter: { lte: now } },
        })
        if (deletion.count === 1) result.deleted += 1
        else result.skipped += 1
      } catch {
        result.failed += 1
      }
    }
    await this.db.auditLog.create({ data: { action: 'plan.trash_purge_completed', targetType: 'maintenance', metadata: { scanned: result.scanned, deleted: result.deleted, skipped: result.skipped, failed: result.failed, dryRun: result.dryRun } } })
    return result
  }
}
