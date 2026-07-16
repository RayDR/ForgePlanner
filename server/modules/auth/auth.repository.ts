import type { PrismaClient } from '@prisma/client'

export class AuthRepository {
  constructor(private db: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.db.user.findUnique({
      where: { email },
      include: { profile: true, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    })
  }

  findSession(tokenHash: string) {
    return this.db.session.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { profile: true, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } },
        impersonation: { include: { targetUser: { include: { profile: true, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } } },
      },
    })
  }

  touchSession(sessionId: string) { return this.db.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }) }
}
