import type { Prisma, PrismaClient } from '@prisma/client'
import { ApiError } from '../../http/errors.js'

export class NotificationService {
  constructor(private db: PrismaClient) {}

  async list(userId: string) {
    const [items, unreadCount] = await Promise.all([
      this.db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.db.notification.count({ where: { userId, readAt: null } }),
    ])
    return { items, unreadCount }
  }

  async preferences(userId: string) {
    return this.db.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} })
  }

  async updatePreferences(userId: string, input: { inAppPlanInvitations?: boolean; inAppPlanUpdates?: boolean; emailPlanInvitations?: boolean }) {
    return this.db.notificationPreference.upsert({ where: { userId }, create: { userId, ...input }, update: input })
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.db.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: new Date() } })
    if (!result.count) {
      const exists = await this.db.notification.count({ where: { id: notificationId, userId } })
      if (!exists) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.')
    }
  }

  markAllRead(userId: string) { return this.db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } }) }

  async create(userId: string, type: 'plan_invitation' | 'plan_invitation_accepted' | 'plan_invitation_declined', data: Prisma.InputJsonObject) {
    const preference = await this.preferences(userId)
    const allowed = type === 'plan_invitation' ? preference.inAppPlanInvitations : preference.inAppPlanUpdates
    if (!allowed) return null
    return this.db.notification.create({ data: { userId, type, data } })
  }
}
