import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
  displayName: z.string().trim().min(2).max(80),
  acceptTerms: z.boolean().default(false),
  recaptchaToken: z.string().max(4096).optional(),
})

export const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
  recaptchaToken: z.string().max(4096).optional(),
})

export const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()) })
export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
})
export const verificationRequestSchema = z.object({ email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()) })
export const verificationConfirmSchema = z.object({ token: z.string().min(32).max(512) })
export const sessionIdSchema = z.string().uuid()
