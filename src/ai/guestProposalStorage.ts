import { GUEST_SCOPE } from '../persistence/identityScope'
import { readTemporarySessionState, saveTemporarySessionState } from '../persistence/temporarySessionStorage'
import type { GuestProposalRecord } from './aiTypes'

const options = (storage?: Storage) => ({ scope: GUEST_SCOPE, namespace: 'ai-proposals' as const, storage })
function validRecord(record: GuestProposalRecord) {
  return Boolean(record?.operation?.id && record.signedProposalToken && record.proposal && record.operation.expiresAt && new Date(record.operation.expiresAt).getTime() > Date.now())
}
export function readGuestProposals(storage?: Storage) {
  const stored = readTemporarySessionState<GuestProposalRecord[]>({ ...options(storage) }) ?? []
  const records = stored.filter(validRecord).slice(0, 3)
  // Remove expired/malformed entries eagerly so they cannot accumulate in the
  // tab session or be surfaced after a later hydration.
  if (records.length !== stored.length) {
    if (records.length) saveTemporarySessionState(records, { ...options(storage), ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 })
    else removeTemporaryState(storage)
  }
  return records
}
function removeTemporaryState(storage?: Storage) { saveTemporarySessionState([], { ...options(storage), ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 }) }
export function saveGuestProposal(record: GuestProposalRecord, storage?: Storage) { const records = [record, ...readGuestProposals(storage).filter((item) => item.operation.id !== record.operation.id)].filter(validRecord).slice(0, 3); saveTemporarySessionState(records, { ...options(storage), ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 }); return records }
export function removeGuestProposal(id: string, storage?: Storage) { const records = readGuestProposals(storage).filter((item) => item.operation.id !== id); saveTemporarySessionState(records, { ...options(storage), ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 }); return records }
