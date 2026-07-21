import { createHash } from 'node:crypto'
import { parseAiPlanningProposal } from '../../../shared/ai-proposal-contract/index.js'

export function prepareProposal(value: unknown) {
  const parsed = parseAiPlanningProposal(value)
  return { ...parsed, checksum: createHash('sha256').update(parsed.serialized, 'utf8').digest('hex') }
}

export function fingerprint(value: unknown) {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item as Record<string, unknown>).filter((key) => (item as Record<string, unknown>)[key] !== undefined).sort().map((key) => [key, canonical((item as Record<string, unknown>)[key])])) : item
  const serialized = JSON.stringify(canonical(value))
  return createHash('sha256').update(serialized).digest('hex')
}
