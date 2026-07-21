import argon2 from 'argon2'
import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../../config/env.js'
import { AuthService } from './auth.service.js'

const env = {
  NODE_ENV: 'test', PORT: 4100, DATABASE_URL: 'postgresql://test', APP_ORIGIN: 'http://localhost:5173',
  SESSION_TTL_HOURS: 24, COOKIE_SECURE: false, TRUST_PROXY: false, REGISTRATION_ENABLED: true, EMAIL_VERIFICATION_REQUIRED: false,
  RECAPTCHA_MIN_SCORE: 0.5,
  PASSWORD_RESET_TTL_MINUTES: 30, EMAIL_VERIFICATION_TTL_HOURS: 24, SMTP_PORT: 587, SMTP_SECURE: false, SMTP_FROM_NAME: 'NorthStar Planner',
  AI_PROVIDER: 'mock', OPENAI_PROPOSAL_MODEL: 'gpt-5.6-sol', OPENAI_TIMEOUT_MS: 20_000,
} satisfies AppEnv

function fakeDb(user: unknown) {
  const auditEvents: unknown[] = []
  const database = {
    user: { findUnique: async () => user, update: async () => user },
    session: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'session-id', ...data }) },
    auditLog: { create: async ({ data }: { data: unknown }) => { auditEvents.push(data); return data } },
  }
  return { db: database as unknown as PrismaClient, auditEvents }
}

describe('authentication service', () => {
  it('creates an opaque session after valid credentials', async () => {
    const passwordHash = await argon2.hash('ValidPassword123', { type: argon2.argon2id })
    const user = { id: 'user-id', email: 'person@example.com', passwordHash, status: 'active', profile: { displayName: 'Person', handle: 'person', discriminator: '1234', locale: 'es', timezone: 'UTC', preferences: {} } }
    const { db, auditEvents } = fakeDb(user)
    const result = await new AuthService(db, env).login({ email: user.email, password: 'ValidPassword123' }, {})
    expect(result.token).not.toContain(user.id)
    expect(result.user.profile?.code).toBe('person#1234')
    expect(auditEvents).toHaveLength(1)
  })

  it('returns the same generic error for an unknown account', async () => {
    const { db } = fakeDb(null)
    await expect(new AuthService(db, env).login({ email: 'missing@example.com', password: 'InvalidPassword1' }, {})).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })
})
