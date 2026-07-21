import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function keyFrom(value: string) {
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  return key
}

export function encryptSecret(plaintext: string, encodedKey: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyFrom(encodedKey), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]); const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptSecret(envelope: string, encodedKey: string) {
  const [version, iv, tag, encrypted] = envelope.split('.')
  if (version !== VERSION || !iv || !tag || !encrypted) throw new Error('Unsupported encrypted secret format')
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(encodedKey), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
}
