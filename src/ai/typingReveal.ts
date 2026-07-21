export const REVEAL_INTERVAL_MS = 18
export const REVEAL_CHUNK_SIZE = 3

export function nextRevealLength(current: number, total: number, chunk = REVEAL_CHUNK_SIZE) {
  return Math.min(total, current + chunk)
}
