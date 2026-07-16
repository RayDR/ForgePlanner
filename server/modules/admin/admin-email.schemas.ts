import { z } from 'zod'

export const emailSettingsSchema = z.object({
  host: z.string().trim().min(1).max(255), port: z.number().int().min(1).max(65535), secure: z.boolean(),
  username: z.string().trim().max(255).optional().default(''), password: z.string().max(500).optional(),
  senderEmail: z.string().email(), senderName: z.string().trim().min(1).max(120), replyTo: z.union([z.string().email(), z.literal('')]).optional().default(''),
  enabled: z.boolean(), timeoutMs: z.number().int().min(1000).max(60_000), frontendUrl: z.string().url(), resetExpiresMinutes: z.number().int().min(5).max(1440),
})
export const testEmailSchema = z.object({ recipient: z.string().email().optional() })
