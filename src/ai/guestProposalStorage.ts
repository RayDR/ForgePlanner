import { GUEST_SCOPE } from '../persistence/identityScope'
import { readTemporarySessionState, saveTemporarySessionState } from '../persistence/temporarySessionStorage'
import type { GuestProposalRecord } from './aiTypes'

const options = { scope: GUEST_SCOPE, namespace: 'ai-proposals' as const }
function validRecord(record: GuestProposalRecord) {
  return Boolean(record?.operation?.id && record.signedProposalToken && record.proposal && record.operation.expiresAt && new Date(record.operation.expiresAt).getTime() > Date.now())
}
export function readGuestProposals() {
  const stored = readTemporarySessionState<GuestProposalRecord[]>({ ...options }) ?? []
  const records = stored.filter(validRecord).slice(0, 3)
  // Remove expired/malformed entries eagerly so they cannot accumulate in the
  // tab session or be surfaced after a later hydration.
  if (records.length !== stored.length) {
    if (records.length) saveTemporarySessionState(records, { ...options, ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 })
    else removeTemporaryState()
  }
  return records
}
function removeTemporaryState() { saveTemporarySessionState([], { ...options, ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 }) }
export function saveGuestProposal(record: GuestProposalRecord) { const records = [record, ...readGuestProposals().filter((item) => item.operation.id !== record.operation.id)].filter(validRecord).slice(0, 3); saveTemporarySessionState(records, { ...options, ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 }); return records }
export function removeGuestProposal(id: string) { const records = readGuestProposals().filter((item) => item.operation.id !== id); saveTemporarySessionState(records, { ...options, ttlMs: 4 * 60 * 60 * 1000, maxBytes: 220 * 1024 }); return records }
