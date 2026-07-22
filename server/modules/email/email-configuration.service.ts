import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { decryptSecret, encryptSecret } from '../../security/encryption.js'

export interface SmtpSettings { host: string; port: number; secure: boolean; username?: string; password?: string; senderEmail: string; senderName: string; replyTo?: string; timeoutMs: number; source: 'database' | 'environment' }
export interface EmailSettingsInput { host?: string; port?: number; secure?: boolean; username?: string; password?: string; senderEmail?: string; senderName?: string; replyTo?: string | null; enabled?: boolean; timeoutMs?: number; frontendUrl?: string; resetExpiresMinutes?: number }

export class EmailConfigurationService {
  constructor(private db: PrismaClient, private env: AppEnv) {}

  async publicConfiguration() {
    const record = await this.db.emailConfiguration.findUnique({ where: { environment: this.env.NODE_ENV } })
    if (!record) return { environment: this.env.NODE_ENV, enabled: Boolean(this.env.SMTP_HOST && this.env.SMTP_FROM), host: this.env.SMTP_HOST ?? '', port: this.env.SMTP_PORT, secure: this.env.SMTP_SECURE, username: this.env.SMTP_USER ?? '', senderEmail: this.env.SMTP_FROM ?? '', senderName: this.env.SMTP_FROM_NAME, replyTo: '', timeoutMs: 10_000, frontendUrl: this.env.APP_ORIGIN, resetExpiresMinutes: this.env.PASSWORD_RESET_TTL_MINUTES, passwordConfigured: Boolean(this.env.SMTP_PASSWORD), source: 'environment' as const }
    return { environment: record.environment, enabled: record.enabled, host: record.host ?? '', port: record.port ?? 587, secure: record.secure, username: record.username ?? '', senderEmail: record.senderEmail ?? '', senderName: record.senderName ?? 'ForgePlanner', replyTo: record.replyTo ?? '', timeoutMs: record.timeoutMs, frontendUrl: record.frontendUrl ?? this.env.APP_ORIGIN, resetExpiresMinutes: record.resetExpiresMinutes, passwordConfigured: Boolean(record.encryptedPassword), source: 'database' as const }
  }

  async update(input: EmailSettingsInput) {
    const current = await this.db.emailConfiguration.findUnique({ where: { environment: this.env.NODE_ENV } })
    let encryptedPassword = current?.encryptedPassword
    if (input.password !== undefined && input.password !== '') {
      if (!this.env.EMAIL_ENCRYPTION_KEY) throw new ApiError(503, 'EMAIL_ENCRYPTION_KEY_MISSING', 'Email encryption is not configured.')
      encryptedPassword = encryptSecret(input.password, this.env.EMAIL_ENCRYPTION_KEY)
    }
    await this.db.emailConfiguration.upsert({ where: { environment: this.env.NODE_ENV }, create: { environment: this.env.NODE_ENV, host: input.host, port: input.port, secure: input.secure, username: input.username, encryptedPassword, senderEmail: input.senderEmail, senderName: input.senderName, replyTo: input.replyTo || null, enabled: input.enabled, timeoutMs: input.timeoutMs, frontendUrl: input.frontendUrl, resetExpiresMinutes: input.resetExpiresMinutes }, update: { host: input.host, port: input.port, secure: input.secure, username: input.username, encryptedPassword, senderEmail: input.senderEmail, senderName: input.senderName, replyTo: input.replyTo || null, enabled: input.enabled, timeoutMs: input.timeoutMs, frontendUrl: input.frontendUrl, resetExpiresMinutes: input.resetExpiresMinutes } })
    return this.publicConfiguration()
  }

  async resolve(): Promise<SmtpSettings | null> {
    const record = await this.db.emailConfiguration.findUnique({ where: { environment: this.env.NODE_ENV } })
    if (record?.enabled && record.host && record.senderEmail) {
      let password: string | undefined
      if (record.encryptedPassword) {
        if (!this.env.EMAIL_ENCRYPTION_KEY) throw new Error('Email encryption key is unavailable')
        password = decryptSecret(record.encryptedPassword, this.env.EMAIL_ENCRYPTION_KEY)
      }
      return { host: record.host, port: record.port ?? 587, secure: record.secure, username: record.username ?? undefined, password, senderEmail: record.senderEmail, senderName: record.senderName ?? 'ForgePlanner', replyTo: record.replyTo ?? undefined, timeoutMs: record.timeoutMs, source: 'database' }
    }
    if (!this.env.SMTP_HOST || !this.env.SMTP_FROM) return null
    return { host: this.env.SMTP_HOST, port: this.env.SMTP_PORT, secure: this.env.SMTP_SECURE, username: this.env.SMTP_USER, password: this.env.SMTP_PASSWORD, senderEmail: this.env.SMTP_FROM, senderName: this.env.SMTP_FROM_NAME, timeoutMs: 10_000, source: 'environment' }
  }
}
