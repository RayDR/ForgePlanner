import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'

export class RecaptchaService {
  constructor(private env: AppEnv) {}

  async verify(token: string | undefined, action: 'login' | 'register', remoteIp?: string) {
    if (!this.env.RECAPTCHA_SECRET_KEY) return
    if (!token) throw new ApiError(400, 'RECAPTCHA_REQUIRED', 'Please complete the security check.')
    const body = new URLSearchParams({ secret: this.env.RECAPTCHA_SECRET_KEY, response: token })
    if (remoteIp) body.set('remoteip', remoteIp)
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body })
    const result = await response.json() as { success?: boolean; score?: number; action?: string }
    if (!result.success || result.action !== action || (result.score ?? 0) < this.env.RECAPTCHA_MIN_SCORE) {
      throw new ApiError(400, 'RECAPTCHA_FAILED', 'The security check could not be verified.')
    }
  }
}
