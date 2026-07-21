import type { Prisma, PrismaClient } from '@prisma/client'
import type { RequestMetadata } from '../auth/auth.types.js'

export class AuditService {
  constructor(private db: PrismaClient) {}

  record(input: RequestMetadata & {
    action: string
    actorUserId?: string
    effectiveUserId?: string
    targetType?: string
    targetId?: string
    metadata?: Prisma.InputJsonValue
    impersonationSessionId?: string
  }) {
    return this.db.auditLog.create({ data: input })
  }
}
