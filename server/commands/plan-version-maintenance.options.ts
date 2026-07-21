import { z } from 'zod'
import { MAX_BACKFILL_BATCH_SIZE } from '../modules/plans/plan-version-integrity.js'

const uuid = z.string().uuid()

function databaseName(url: string) {
  try { return new URL(url).pathname.slice(1) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.') }
}

export function parseBackfillOptions(argv: string[], databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  const execute = argv.includes('--execute')
  const value = (prefix: string) => argv.find((argument) => argument.startsWith(`${prefix}=`))?.slice(prefix.length + 1)
  const limit = z.coerce.number().int().min(1).max(MAX_BACKFILL_BATCH_SIZE).parse(value('--limit') ?? 100)
  const cursor = value('--cursor'); const planId = value('--plan-id')
  if (cursor) uuid.parse(cursor); if (planId) uuid.parse(planId)
  const selectedDatabase = databaseName(databaseUrl)
  const confirmation = value('--confirm-database')
  if (execute && confirmation !== selectedDatabase) throw new Error(`Execution requires --confirm-database=${selectedDatabase}.`)
  return { execute, limit, cursor, planId, databaseUrl, databaseName: selectedDatabase }
}

export function parseVerifyOptions(argv: string[], databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  if (argv.includes('--execute-repair')) throw new Error('Repair mode is disabled pending a separately approved policy.')
  const value = (prefix: string) => argv.find((argument) => argument.startsWith(`${prefix}=`))?.slice(prefix.length + 1)
  const limit = z.coerce.number().int().min(1).max(MAX_BACKFILL_BATCH_SIZE).parse(value('--limit') ?? 100)
  const cursor = value('--cursor'); const planId = value('--plan-id')
  if (cursor) uuid.parse(cursor); if (planId) uuid.parse(planId)
  return { limit, cursor, planId, databaseUrl, databaseName: databaseName(databaseUrl) }
}
