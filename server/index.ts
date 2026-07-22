import { loadEnv } from './config/env.js'
import { logger } from './config/logger.js'
import { prisma } from './db/prisma.js'
import { createApp } from './app.js'

const env = loadEnv()
const app = createApp(prisma, env)
const server = app.listen(env.PORT, () => logger.info({
  port: env.PORT,
  aiProvider: env.AI_PROVIDER,
  aiProposalModel: env.OPENAI_PROPOSAL_MODEL,
  aiConversionModel: env.OPENAI_CONVERSION_MODEL,
}, 'ForgePlanner API started'))

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down')
  server.close(async () => { await prisma.$disconnect(); process.exit(0) })
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
