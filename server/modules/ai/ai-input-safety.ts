import { ApiError } from '../../http/errors.js'

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,}/i,
]

function luhn(value: string) {
  const digits = value.replace(/[ -]/g, '')
  if (!/^\d{13,19}$/.test(digits)) return false
  let total = 0; let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) { let digit = Number(digits[index]); if (double && (digit *= 2) > 9) digit -= 9; total += digit; double = !double }
  return total % 10 === 0
}

export function assertSafeAiInput(values: string[]) {
  for (const value of values) {
    if (patterns.some((pattern) => pattern.test(value)) || (value.match(/(?:\d[ -]?){13,19}/g) ?? []).some(luhn)) {
      throw new ApiError(400, 'AI_PROPOSAL_SENSITIVE_INPUT', 'Remove highly sensitive credentials or identity information before continuing.')
    }
  }
}
