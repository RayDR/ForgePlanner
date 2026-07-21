import { z } from 'zod'

export const templateContentSchema = z.object({ subject: z.string().trim().min(1).max(240), htmlBody: z.string().min(1).max(100_000), textBody: z.string().min(1).max(50_000) })
