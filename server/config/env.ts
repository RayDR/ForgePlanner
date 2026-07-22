import { z } from 'zod'

const booleanValue = z.string().optional().transform((value) => value === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  COOKIE_SECURE: booleanValue,
  TRUST_PROXY: booleanValue,
  REGISTRATION_ENABLED: z.string().optional().transform((value) => value !== 'false'),
  EMAIL_VERIFICATION_REQUIRED: booleanValue,
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  RECAPTCHA_SITE_KEY: z.string().optional(),
  RECAPTCHA_SECRET_KEY: z.string().optional(),
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanValue,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().default('ForgePlanner'),
  EMAIL_ENCRYPTION_KEY: z.string().optional(),
  AI_GUEST_SESSION_SIGNING_KEY: z.string().min(32).optional(),
  AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_PROPOSAL_MODEL: z.string().min(1).default('gpt-5.6-terra'),
  OPENAI_CONVERSION_MODEL: z.string().min(1).default('gpt-5.6-luna'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(60_000),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && !value.AI_GUEST_SESSION_SIGNING_KEY) {
    context.addIssue({
      code: 'custom',
      path: ['AI_GUEST_SESSION_SIGNING_KEY'],
      message: 'AI_GUEST_SESSION_SIGNING_KEY is required in production.',
    })
  }
  if (value.AI_PROVIDER === 'openai' && !value.OPENAI_API_KEY) {
    context.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai.' })
  }
})

export type AppEnv = z.infer<typeof schema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return schema.parse(source)
}
