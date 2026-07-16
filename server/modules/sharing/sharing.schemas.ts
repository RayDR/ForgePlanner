import { z } from 'zod'

export const profileCodeSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]{3,40}#[0-9]{4,8}$/)
export const grantAccessSchema = z.object({ profileCode: profileCodeSchema, accessLevel: z.enum(['viewer', 'editor']) })
export const updateAccessSchema = z.object({ accessLevel: z.enum(['viewer', 'editor']) })
export const respondAccessSchema = z.object({ response: z.enum(['accepted', 'declined']) })
export const sharingStateSchema = z.object({ enabled: z.boolean() })
export const shareLinkSchema = z.object({ accessLevel: z.enum(['viewer', 'editor']) })
export const updateShareLinkSchema = z.object({ accessLevel: z.enum(['viewer', 'editor']).optional(), enabled: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0)
