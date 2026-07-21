import { PrismaClient } from '@prisma/client'
import { logger } from '../config/logger.js'
import { PlanVersionBackfillService } from '../modules/plans/plan-version-backfill.service.js'
import { parseBackfillOptions } from './plan-version-maintenance.options.js'

async function main() {
  const options = parseBackfillOptions(process.argv.slice(2))
  const db = new PrismaClient({ datasourceUrl: options.databaseUrl })
  try {
    const result = await new PlanVersionBackfillService(db).run({ limit: options.limit, cursor: options.cursor, planId: options.planId, dryRun: !options.execute })
    logger.info({ event: 'plan_version_backfill', database: options.databaseName, ...result }, options.execute ? 'Plan version backfill completed' : 'Plan version backfill dry run completed')
    if (result.CORRUPTED || result.CONFLICT || result.FAILED) process.exitCode = 1
  } finally { await db.$disconnect() }
}
main().catch((error) => { logger.error({ event: 'plan_version_backfill', err: error }, 'Plan version backfill failed'); process.exitCode = 1 })
