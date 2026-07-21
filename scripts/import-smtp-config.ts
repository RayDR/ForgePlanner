import { randomBytes } from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function parseEnv(text: string) {
  const values: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

async function main() {
  const sourcePath = resolve(process.argv[2] ?? '')
  const targetEnvPath = resolve(process.argv[3] ?? 'api.env.local')
  if (!process.argv[2]) throw new Error('Usage: npm run smtp:import -- /path/to/source.env [api.env.local]')
  const [sourceText, targetText] = await Promise.all([readFile(sourcePath, 'utf8'), readFile(targetEnvPath, 'utf8')])
  const source = parseEnv(sourceText); const target = parseEnv(targetText)
  const password = source.SMTP_PASSWORD || source.SMTP_PASS || source.EMAIL_PASSWORD
  const host = source.SMTP_HOST; const username = source.SMTP_USER || source.CONTACT_EMAIL
  const senderEmail = source.SMTP_FROM || source.FROM_EMAIL || source.CONTACT_EMAIL || username
  if (!host || !password || !senderEmail) throw new Error('The source file does not contain a complete SMTP configuration')
  if (!target.EMAIL_ENCRYPTION_KEY) {
    const separator = targetText.endsWith('\n') ? '' : '\n'
    await writeFile(targetEnvPath, `${targetText}${separator}EMAIL_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`, { mode: 0o600 })
    await chmod(targetEnvPath, 0o600)
    target.EMAIL_ENCRYPTION_KEY = parseEnv(await readFile(targetEnvPath, 'utf8')).EMAIL_ENCRYPTION_KEY
  }
  Object.assign(process.env, target)
  const [{ PrismaClient }, { loadEnv }, { EmailConfigurationService }] = await Promise.all([import('@prisma/client'), import('../server/config/env.js'), import('../server/modules/email/email-configuration.service.js')])
  const db = new PrismaClient(); const env = loadEnv(process.env)
  try {
    await new EmailConfigurationService(db, env).update({ host, port: Number(source.SMTP_PORT || 587), secure: source.SMTP_SECURE === 'true', username, password, senderEmail, senderName: 'NorthStar Planner', replyTo: senderEmail, enabled: true, timeoutMs: 10_000, frontendUrl: 'https://planner.domoforge.com', resetExpiresMinutes: 30 })
    console.log('SMTP configuration imported and password encrypted successfully.')
  } finally { await db.$disconnect() }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'SMTP import failed'); process.exit(1) })
