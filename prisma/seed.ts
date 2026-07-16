import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { permissions } from '../server/modules/authorization/policies.js'
import { ProfileService } from '../server/modules/profiles/profile.service.js'

const prisma = new PrismaClient()

async function main() {
  const permissionKeys = Object.values(permissions)
  for (const key of permissionKeys) await prisma.permission.upsert({ where: { key }, create: { key }, update: {} })
  const userRole = await prisma.role.upsert({ where: { key: 'user' }, create: { key: 'user', name: 'User' }, update: {} })
  const adminRole = await prisma.role.upsert({ where: { key: 'admin' }, create: { key: 'admin', name: 'Administrator' }, update: {} })
  const allPermissions = await prisma.permission.findMany()
  const userPermissionKeys = new Set([permissions.PLAN_CREATE, permissions.PLAN_READ, permissions.PLAN_UPDATE, permissions.PLAN_DELETE, permissions.PLAN_SHARE])
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } }, create: { roleId: adminRole.id, permissionId: permission.id }, update: {} })
    if (userPermissionKeys.has(permission.key as never)) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: userRole.id, permissionId: permission.id } }, create: { roleId: userRole.id, permissionId: permission.id }, update: {} })
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (!existing) {
      if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must have at least 12 characters when creating an administrator')
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, passwordHash, status: 'active', emailVerifiedAt: new Date() } })
        await new ProfileService(tx).create(user.id, process.env.ADMIN_DISPLAY_NAME ?? 'NorthStar Admin')
        await tx.userRole.createMany({ data: [{ userId: user.id, roleId: adminRole.id }, { userId: user.id, roleId: userRole.id }] })
      })
    } else {
      await prisma.userRole.createMany({ data: [{ userId: existing.id, roleId: adminRole.id }, { userId: existing.id, roleId: userRole.id }], skipDuplicates: true })
    }
  }
}

main().finally(() => prisma.$disconnect())
