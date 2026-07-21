import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { logger } from '../config/logger.js'
import { AiProposalExpirationService } from '../modules/ai/ai-expiration.service.js'

function mainOptions() {
  const args = process.argv.slice(2); const url = process.env.DATABASE_URL; if (!url) throw new Error('DATABASE_URL is required.')
  const value = (key: string) => args.find((item) => item.startsWith(`${key}=`))?.slice(key.length + 1)
  const limit = z.coerce.number().int().min(1).max(250).parse(value('--limit') ?? 100); const execute = args.includes('--execute'); const database = new URL(url).pathname.slice(1)
  if (execute && value('--confirm-database') !== database) throw new Error(`Execution requires --confirm-database=${database}.`)
  return { url, limit, execute, database }
}
async function main() { const options = mainOptions(); const db = new PrismaClient({ datasourceUrl: options.url }); try { const result = await new AiProposalExpirationService(db).run({ limit: options.limit, dryRun: !options.execute }); logger.info({ event: 'ai_proposal_cleanup', database: options.database, ...result }, options.execute ? 'AI proposal cleanup completed' : 'AI proposal cleanup dry run completed'); if (result.failed) process.exitCode = 1 } finally { await db.$disconnect() } }
main().catch((error) => { logger.error({ event: 'ai_proposal_cleanup', err: error }, 'AI proposal cleanup failed'); process.exitCode = 1 })
