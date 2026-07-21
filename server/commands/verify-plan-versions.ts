import { PrismaClient } from '@prisma/client'
import { logger } from '../config/logger.js'
import { PlanVersionVerificationService } from '../modules/plans/plan-version-backfill.service.js'
import { parseVerifyOptions } from './plan-version-maintenance.options.js'

async function main() {
  const options = parseVerifyOptions(process.argv.slice(2))
  const db = new PrismaClient({ datasourceUrl: options.databaseUrl })
  try {
    const result = await new PlanVersionVerificationService(db).run(options)
    logger.info({ event: 'plan_version_verification', database: options.databaseName, ...result }, 'Plan version verification completed')
    if (result.corrupted || result.failed) process.exitCode = 1
  } finally { await db.$disconnect() }
}
main().catch((error) => { logger.error({ event: 'plan_version_verification', err: error }, 'Plan version verification failed'); process.exitCode = 1 })
