export function parsePlanTrashPurgeOptions(args: string[], databaseUrl: string | undefined) {
  const execute = args.includes('--execute')
  const limitArgument = args.find((argument) => argument.startsWith('--limit='))
  const limit = limitArgument ? Number(limitArgument.slice('--limit='.length)) : 500
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error('--limit must be an integer between 1 and 1000.')
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  return { execute, limit }
}
