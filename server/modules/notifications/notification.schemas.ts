import { z } from 'zod'

export const notificationIdSchema = z.string().uuid()
export const notificationPreferenceSchema = z.object({
  inAppPlanInvitations: z.boolean().optional(),
  inAppPlanUpdates: z.boolean().optional(),
  emailPlanInvitations: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0)
