import type { PrismaClient } from '@prisma/client'

export class AiProposalExpirationService {
  constructor(private db: PrismaClient, private now = () => new Date()) {}
  async run(input: { limit: number; dryRun: boolean }) {
    const now = this.now(); const result = { scanned: 0, generationLeasesRecovered: 0, refinementLeasesRecovered: 0, conversionLeasesRecovered: 0, expired: 0, purged: 0, skipped: 0, failed: 0, dryRun: input.dryRun }
    const leases = await this.db.aiOperation.findMany({ where: { status: { in: ['PENDING','REFINING','CONVERTING'] }, processingLeaseExpiresAt: { lte: now } }, orderBy: [{ processingLeaseExpiresAt: 'asc' }, { id: 'asc' }], take: input.limit, select: { id: true, status: true, processingRequestId: true } })
    const remaining = Math.max(0, input.limit - leases.length)
    const expirations = await this.db.aiOperation.findMany({ where: { status: { notIn: ['EXPIRED'] }, expiresAt: { lte: now }, processingLeaseExpiresAt: null }, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }], take: remaining, select: { id: true, status: true } })
    const purges = await this.db.aiOperation.findMany({ where: { status: 'EXPIRED', purgeAfter: { lte: now } }, orderBy: [{ purgeAfter: 'asc' }, { id: 'asc' }], take: Math.max(0, remaining - expirations.length), select: { id: true } })
    result.scanned = leases.length + expirations.length + purges.length
    if (input.dryRun) return result
    for (const operation of leases) {
      try {
        await this.db.$transaction(async (tx) => {
          if (operation.status === 'PENDING') {
            const updated = await tx.aiOperation.updateMany({ where: { id: operation.id, status: 'PENDING', processingRequestId: operation.processingRequestId, processingLeaseExpiresAt: { lte: now } }, data: { status: 'FAILED', errorCode: 'AI_PROVIDER_INTERRUPTED', failedAt: now, processingRequestId: null, processingLeaseExpiresAt: null, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } })
            if (!updated.count) { result.skipped += 1; return }; result.generationLeasesRecovered += 1
          } else if (operation.status === 'REFINING') {
            const updated = await tx.aiOperation.updateMany({ where: { id: operation.id, status: 'REFINING', processingRequestId: operation.processingRequestId, processingLeaseExpiresAt: { lte: now } }, data: { status: 'PROPOSED', processingRequestId: null, processingLeaseExpiresAt: null } })
            if (!updated.count) { result.skipped += 1; return }; result.refinementLeasesRecovered += 1
          } else {
            const updated = await tx.aiOperation.updateMany({ where: { id: operation.id, status: 'CONVERTING', processingLeaseExpiresAt: { lte: now } }, data: { status: 'CONVERSION_FAILED', errorCode: 'AI_PROVIDER_INTERRUPTED', failedAt: now, processingLeaseExpiresAt: null } })
            if (!updated.count) { result.skipped += 1; return }; result.conversionLeasesRecovered += 1
          }
          if (operation.processingRequestId) await tx.aiOperationRequest.updateMany({ where: { id: operation.processingRequestId, status: 'RESERVED' }, data: { status: 'FAILED', safeErrorCode: 'AI_PROVIDER_INTERRUPTED', completedAt: now } })
        })
      } catch { result.failed += 1 }
    }
    for (const operation of expirations) { try { const updated = await this.db.aiOperation.updateMany({ where: { id: operation.id, status: operation.status, expiresAt: { lte: now }, processingLeaseExpiresAt: null }, data: { status: 'EXPIRED', purgeAfter: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } }); if (updated.count) result.expired += 1; else result.skipped += 1 } catch { result.failed += 1 } }
    for (const operation of purges) { try { const deleted = await this.db.aiOperation.deleteMany({ where: { id: operation.id, status: 'EXPIRED', purgeAfter: { lte: now } } }); if (deleted.count) result.purged += 1; else result.skipped += 1 } catch { result.failed += 1 } }
    await this.db.auditLog.create({ data: { action: 'ai.proposal_cleanup_completed', targetType: 'maintenance', metadata: result } })
    return result
  }
}
