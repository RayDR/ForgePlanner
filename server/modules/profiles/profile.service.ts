import type { Prisma, PrismaClient } from '@prisma/client'
import { Prisma as PrismaRuntime } from '@prisma/client'
import { ApiError } from '../../http/errors.js'

const reservedHandles = new Set(['admin', 'administrator', 'support', 'system', 'northstar'])

export function normalizeHandle(value: string) {
  const handle = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
  return handle.length >= 3 && !reservedHandles.has(handle) ? handle : `user${handle}`.slice(0, 40)
}

export class ProfileService {
  constructor(private db: Prisma.TransactionClient | PrismaClient) {}

  async create(userId: string, displayName: string) {
    const handle = normalizeHandle(displayName)
    const used = await this.db.profile.findMany({ where: { handle }, select: { discriminator: true } })
    const occupied = new Set(used.map((item) => item.discriminator))
    let discriminator: string | undefined
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const candidate = String((attempt * 7919 + 1000) % 10_000).padStart(4, '0')
      if (!occupied.has(candidate)) { discriminator = candidate; break }
    }
    if (!discriminator) discriminator = String(10_000 + used.length)
    return this.db.profile.create({ data: { userId, displayName, handle, discriminator } })
  }

  async update(userId: string, input: { displayName?: string; handle?: string; avatarUrl?: string; bio?: string; locale?: 'es' | 'en'; timezone?: string; theme?: 'light' | 'dark'; searchable?: boolean }) {
    const current = await this.db.profile.findUniqueOrThrow({ where: { userId } })
    if (input.timezone) {
      try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format() } catch { throw new ApiError(400, 'TIMEZONE_INVALID', 'The selected timezone is invalid.') }
    }
    const preferences = typeof current.preferences === 'object' && current.preferences && !Array.isArray(current.preferences) ? current.preferences as Prisma.JsonObject : {}
    try {
      return await this.db.profile.update({ where: { userId }, data: { displayName: input.displayName, handle: input.handle, avatarUrl: input.avatarUrl === '' ? null : input.avatarUrl, bio: input.bio, locale: input.locale, timezone: input.timezone, searchable: input.searchable, preferences: input.theme ? { ...preferences, theme: input.theme } : preferences } })
    } catch (error) {
      if (error instanceof PrismaRuntime.PrismaClientKnownRequestError && error.code === 'P2002') throw new ApiError(409, 'PROFILE_CODE_UNAVAILABLE', 'That public profile code is unavailable.')
      throw error
    }
  }
}
