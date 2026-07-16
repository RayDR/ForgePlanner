import { z } from 'zod'

export const userListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['pending', 'active', 'suspended', 'disabled', 'deleted']).optional(),
  role: z.enum(['admin', 'user']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})
export const updateUserSchema = z.object({
  status: z.enum(['pending', 'active', 'suspended', 'disabled', 'deleted']).optional(),
  roles: z.array(z.enum(['admin', 'user'])).min(1).max(2).transform((roles) => [...new Set(roles)]).optional(),
}).refine((value) => value.status !== undefined || value.roles !== undefined, { message: 'At least one change is required.' })
export const impersonationSchema = z.object({ targetUserId: z.string().uuid(), reason: z.string().trim().min(5).max(500) })
export const auditQuerySchema = z.object({ action: z.string().trim().max(100).optional(), userId: z.string().uuid().optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(50) })
