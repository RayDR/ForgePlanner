import { z } from 'zod'
export const organizationSchema = z.object({ name: z.string().trim().min(2).max(120) })
export const profileCodeInputSchema = z.object({ profileCode: z.string().trim().regex(/^[a-zA-Z0-9_-]{3,40}#[0-9]{4,8}$/) })
export const organizationMemberSchema = profileCodeInputSchema.extend({ role: z.enum(['admin', 'member']).default('member') })
export const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) })
export const uuidSchema = z.string().uuid()
