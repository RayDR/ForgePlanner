import { createHash } from 'node:crypto'
import { ApiError } from '../../http/errors.js'
import { parsePlanDocument, type CanonicalPlan } from '../../../shared/plan-contract/index.js'

export const MAX_CANONICAL_SNAPSHOT_BYTES = 256 * 1024
export const DEFAULT_VERSION_PAGE_SIZE = 25
export const MAX_VERSION_PAGE_SIZE = 100
export const MAX_BACKFILL_BATCH_SIZE = 250

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sortObjectKeys((value as Record<string, unknown>)[key])]))
  }
  return value
}

export function canonicalPlanSerialization(snapshot: CanonicalPlan) {
  return JSON.stringify(sortObjectKeys(snapshot))
}

export function prepareVersionSnapshot(input: unknown, options: { status?: number; code?: string } = {}) {
  const parsed = parsePlanDocument(input)
  if (!parsed.success) throw new ApiError(options.status ?? 400, options.code ?? 'INVALID_PLAN_SNAPSHOT', 'The plan snapshot failed canonical validation.')
  const serialized = canonicalPlanSerialization(parsed.plan)
  const bytes = Buffer.from(serialized, 'utf8')
  if (bytes.byteLength > MAX_CANONICAL_SNAPSHOT_BYTES) throw new ApiError(413, 'PLAN_SNAPSHOT_TOO_LARGE', 'The canonical plan snapshot exceeds the supported size.')
  return {
    snapshot: parsed.plan,
    serialized,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    snapshotSizeBytes: bytes.byteLength,
    schemaVersion: parsed.plan.schemaVersion,
  }
}

export function verifyStoredVersion(input: { snapshot: unknown; checksum: string; snapshotSizeBytes: number }) {
  const prepared = prepareVersionSnapshot(input.snapshot, { status: 500, code: 'CORRUPTED_PLAN_VERSION' })
  if (prepared.checksum !== input.checksum || prepared.snapshotSizeBytes !== input.snapshotSizeBytes) {
    throw new ApiError(500, 'PLAN_VERSION_INTEGRITY_ERROR', 'The historical plan version failed its integrity check.')
  }
  return prepared
}
