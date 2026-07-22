import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'

const TEMPLATE_KEY = 'password-reset'
const DEFAULT_SUBJECT = 'Reset your ForgePlanner password'
export const PASSWORD_RESET_TAGS = ['displayName', 'resetUrl', 'expiresMinutes'] as const
const REQUIRED_TAGS = ['resetUrl'] as const

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!) }
function tagsIn(source: string) { return [...source.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => match[1]) }

export interface TemplateContent { key: string; version: number; subject: string; htmlBody: string; textBody: string; source: 'database' | 'default'; updatedAt: Date | null; allowedTags: readonly string[] }

export class TemplateService {
  constructor(private db?: PrismaClient) {}

  async get(): Promise<TemplateContent> {
    const override = this.db ? await this.db.emailTemplate.findUnique({ where: { key: TEMPLATE_KEY } }) : null
    if (override) return { ...override, source: 'database', allowedTags: PASSWORD_RESET_TAGS }
    const defaults = await this.defaults()
    return { key: TEMPLATE_KEY, version: 1, ...defaults, source: 'default', updatedAt: null, allowedTags: PASSWORD_RESET_TAGS }
  }

  async save(input: { subject: string; htmlBody: string; textBody: string }) {
    this.validate(input)
    if (!this.db) throw new Error('Template persistence is unavailable')
    await this.db.emailTemplate.upsert({ where: { key: TEMPLATE_KEY }, create: { key: TEMPLATE_KEY, version: 2, ...input }, update: { version: { increment: 1 }, ...input } })
    return this.get()
  }

  async reset() {
    if (!this.db) throw new Error('Template persistence is unavailable')
    await this.db.emailTemplate.deleteMany({ where: { key: TEMPLATE_KEY } })
    return this.get()
  }

  async preview(input?: { subject: string; htmlBody: string; textBody: string }) {
    const template = input ?? await this.get()
    if (input) this.validate(input)
    return this.render(template, { displayName: 'NorthStar User', resetUrl: 'https://planner.domoforge.com/reset-password?token=preview-token', expiresMinutes: '30' })
  }

  async passwordReset(context: { displayName: string; resetUrl: string; expiresMinutes: number }) {
    const template = await this.get()
    return this.render(template, { displayName: context.displayName, resetUrl: context.resetUrl, expiresMinutes: String(context.expiresMinutes) })
  }

  private async defaults() {
    const base = resolve(process.cwd(), 'server/templates/password-reset')
    const [htmlBody, textBody] = await Promise.all([readFile(resolve(base, 'template.html'), 'utf8'), readFile(resolve(base, 'template.txt'), 'utf8')])
    return { subject: DEFAULT_SUBJECT, htmlBody, textBody }
  }

  private validate(input: { subject: string; htmlBody: string; textBody: string }) {
    if (!input.subject.trim() || input.subject.length > 240 || input.htmlBody.length > 100_000 || input.textBody.length > 50_000) throw new ApiError(400, 'EMAIL_TEMPLATE_INVALID', 'Template content is empty or exceeds its allowed size.')
    const unknown = [...new Set([...tagsIn(input.subject), ...tagsIn(input.htmlBody), ...tagsIn(input.textBody)].filter((tag) => !PASSWORD_RESET_TAGS.includes(tag as never)))]
    if (unknown.length) throw new ApiError(400, 'EMAIL_TEMPLATE_UNKNOWN_TAG', `Unknown template tags: ${unknown.join(', ')}`)
    const combined = `${input.subject}\n${input.htmlBody}\n${input.textBody}`
    const missing = REQUIRED_TAGS.filter((tag) => !combined.includes(`{{${tag}}}`))
    if (missing.length) throw new ApiError(400, 'EMAIL_TEMPLATE_REQUIRED_TAG', `Required template tags are missing: ${missing.join(', ')}`)
    if (/<\s*(script|iframe|object|embed|form|input|button)\b/i.test(input.htmlBody) || /\bon\w+\s*=/i.test(input.htmlBody) || /javascript\s*:/i.test(input.htmlBody)) throw new ApiError(400, 'EMAIL_TEMPLATE_UNSAFE_HTML', 'The HTML template contains unsafe elements or attributes.')
  }

  private render(template: { subject: string; htmlBody: string; textBody: string }, values: Record<string, string>) {
    const replace = (source: string, htmlMode: boolean) => source.replace(/{{\s*(displayName|resetUrl|expiresMinutes)\s*}}/g, (_match, key: string) => htmlMode ? escapeHtml(values[key]) : values[key])
    return { subject: replace(template.subject, false), html: replace(template.htmlBody, true), text: replace(template.textBody, false) }
  }
}
