import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { PlanTrashPurgeService } from './plan-trash-purge.service.js'

describe('PlanTrashPurgeService batching', () => {
  it('continues after a per-record failure and reports accurate counts', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'failed-id' }, { id: 'deleted-id' }, { id: 'skipped-id' }])
    const deleteMany = vi.fn()
      .mockRejectedValueOnce(new Error('controlled database failure'))
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-id' })
    const db = { plan: { findMany, deleteMany }, auditLog: { create: auditCreate } } as unknown as PrismaClient

    const result = await new PlanTrashPurgeService(db, () => new Date('2026-07-20T00:00:00.000Z')).run({ limit: 3, dryRun: false })

    expect(result).toEqual({ scanned: 3, deleted: 1, skipped: 1, failed: 1, dryRun: false })
    expect(deleteMany).toHaveBeenCalledTimes(3)
    expect(deleteMany.mock.calls[0][0].where).toMatchObject({ id: 'failed-id', deletedAt: { not: null } })
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'plan.trash_purge_completed', metadata: expect.objectContaining({ failed: 1 }) }) }))
  })
})
