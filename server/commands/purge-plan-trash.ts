import { logger } from '../config/logger.js'
import { prisma } from '../db/prisma.js'
import { PlanTrashPurgeService } from '../modules/plans/plan-trash-purge.service.js'
import { parsePlanTrashPurgeOptions } from './plan-trash-purge.options.js'

async function main() {
  const input = parsePlanTrashPurgeOptions(process.argv.slice(2), process.env.DATABASE_URL)
  const result = await new PlanTrashPurgeService(prisma).run({ limit: input.limit, dryRun: !input.execute })
  logger.info({ event: 'plan_trash_purge', ...result }, result.dryRun ? 'Plan trash purge dry run completed' : 'Plan trash purge completed')
}

main()
  .catch((error) => { logger.error({ event: 'plan_trash_purge', failed: 1, err: error }, 'Plan trash purge failed'); process.exitCode = 1 })
  .finally(async () => prisma.$disconnect())
