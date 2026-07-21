import { z } from 'zod'

const reservedHandles = new Set(['admin', 'administrator', 'support', 'system', 'northstar'])

export const updatePreferencesSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  handle: z.string().trim().regex(/^[A-Za-z0-9_-]{3,40}$/).transform((value) => value.toLowerCase()).refine((value) => !reservedHandles.has(value), { message: 'This public handle is reserved.' }).optional(),
  avatarUrl: z.union([z.string().url().max(500), z.literal('')]).optional(),
  bio: z.string().trim().max(280).optional(),
  locale: z.enum(['es', 'en']).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  searchable: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0)
