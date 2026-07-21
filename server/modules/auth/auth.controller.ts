import type { Request, Response } from 'express'
import type { AppEnv } from '../../config/env.js'
import type { PrismaClient } from '@prisma/client'
import { hashToken } from '../../security/crypto.js'
import { ApiError } from '../../http/errors.js'
import { AuthRepository } from './auth.repository.js'
import { AuthService } from './auth.service.js'
import { CSRF_COOKIE, SESSION_COOKIE } from './auth.middleware.js'
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, sessionIdSchema, verificationConfirmSchema, verificationRequestSchema } from './auth.schemas.js'
import { RecaptchaService } from './recaptcha.service.js'
import { GoogleAuthService } from './google.service.js'
import { createOpaqueToken } from '../../security/crypto.js'
import { PasswordRecoveryService } from './password-recovery.service.js'
import { EmailVerificationService } from './email-verification.service.js'

function metadata(request: Request) { return { ipAddress: request.ip, userAgent: request.get('user-agent')?.slice(0, 500) } }

export class AuthController {
  private service: AuthService
  private repository: AuthRepository
  private recaptcha: RecaptchaService
  private google: GoogleAuthService
  private recovery: PasswordRecoveryService
  private verification: EmailVerificationService
  constructor(private db: PrismaClient, private env: AppEnv) { this.service = new AuthService(db, env); this.repository = new AuthRepository(db); this.recaptcha = new RecaptchaService(env); this.google = new GoogleAuthService(db, env); this.recovery = new PasswordRecoveryService(db, env); this.verification = new EmailVerificationService(db, env) }

  setCookies(response: Response, result: { token: string; csrfToken: string; expiresAt: Date }) {
    const shared = { secure: this.env.COOKIE_SECURE || this.env.NODE_ENV === 'production', sameSite: 'strict' as const, expires: result.expiresAt, path: '/' }
    response.cookie(SESSION_COOKIE, result.token, { ...shared, httpOnly: true })
    response.cookie(CSRF_COOKIE, result.csrfToken, { ...shared, httpOnly: false })
  }

  googleStart = (_request: Request, response: Response) => {
    const state = createOpaqueToken(24)
    response.cookie('northstar_google_state', state, { httpOnly: true, secure: this.env.COOKIE_SECURE || this.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 10 * 60_000, path: '/api/auth/google/callback' })
    response.redirect(this.google.authorizationUrl(state))
  }

  googleCallback = async (request: Request, response: Response) => {
    const code = typeof request.query.code === 'string' ? request.query.code : ''
    const state = typeof request.query.state === 'string' ? request.query.state : ''
    if (!code || !state || state !== request.cookies?.northstar_google_state) throw new ApiError(400, 'GOOGLE_STATE_INVALID', 'The Google sign-in request is invalid or expired.')
    const result = await this.google.callback(code, metadata(request))
    this.setCookies(response, result)
    response.clearCookie('northstar_google_state', { path: '/api/auth/google/callback' })
    response.redirect(`${this.env.APP_ORIGIN}/plans`)
  }

  register = async (request: Request, response: Response) => {
    const input = registerSchema.parse(request.body)
    await this.recaptcha.verify(input.recaptchaToken, 'register', request.ip)
    const result = await this.service.register(input, metadata(request))
    if (result.requiresVerification) {
      await this.verification.request(result.email, metadata(request))
      response.status(201).json({ requiresVerification: true })
      return
    }
    this.setCookies(response, result)
    response.status(201).json({ requiresVerification: false, user: result.user, expiresAt: result.expiresAt })
  }

  login = async (request: Request, response: Response) => {
    const input = loginSchema.parse(request.body)
    await this.recaptcha.verify(input.recaptchaToken, 'login', request.ip)
    const result = await this.service.login(input, metadata(request))
    this.setCookies(response, result)
    response.json({ user: result.user, expiresAt: result.expiresAt })
  }

  config = (_request: Request, response: Response) => {
    response.json({ googleEnabled: Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET && this.env.GOOGLE_REDIRECT_URI), recaptchaSiteKey: this.env.RECAPTCHA_SITE_KEY && this.env.RECAPTCHA_SECRET_KEY ? this.env.RECAPTCHA_SITE_KEY : null, emailVerificationRequired: this.env.EMAIL_VERIFICATION_REQUIRED })
  }

  forgotPassword = async (request: Request, response: Response) => {
    const input = forgotPasswordSchema.parse(request.body)
    await this.recovery.request(input.email, metadata(request))
    response.json({ message: 'If the account exists, password reset instructions will be sent.' })
  }

  resetPassword = async (request: Request, response: Response) => {
    const input = resetPasswordSchema.parse(request.body)
    await this.recovery.reset(input.token, input.password, metadata(request))
    this.clearCookies(response)
    response.json({ message: 'Password updated. Sign in again.' })
  }

  requestEmailVerification = async (request: Request, response: Response) => {
    const input = verificationRequestSchema.parse(request.body)
    await this.verification.request(input.email, metadata(request))
    response.json({ message: 'If the address is eligible, verification instructions will be sent.' })
  }

  confirmEmailVerification = async (request: Request, response: Response) => {
    const input = verificationConfirmSchema.parse(request.body)
    await this.verification.confirm(input.token, metadata(request))
    response.json({ message: 'Email verified. You can now sign in.' })
  }

  session = async (request: Request, response: Response) => {
    if (!request.auth) { response.status(401).json({ error: { code: 'NO_SESSION', message: 'No active session.' } }); return }
    const token = request.cookies?.[SESSION_COOKIE]
    const session = await this.repository.findSession(hashToken(token))
    if (!session) throw new ApiError(401, 'NO_SESSION', 'No active session.')
    const activeImpersonation = session.impersonation && !session.impersonation.endedAt && session.impersonation.expiresAt > new Date() && session.impersonation.targetUser.status === 'active' ? session.impersonation : null
    const effectiveUser = activeImpersonation?.targetUser ?? session.user
    response.json({
      user: this.service.publicUser(effectiveUser),
      expiresAt: session.expiresAt,
      permissions: [...request.auth.permissions],
      impersonation: activeImpersonation ? { id: activeImpersonation.id, expiresAt: activeImpersonation.expiresAt, actor: this.service.publicUser(session.user) } : null,
    })
  }

  logout = async (request: Request, response: Response) => {
    await this.service.logout(request.auth!.sessionId, request.auth!.actorUserId, metadata(request))
    this.clearCookies(response)
    response.status(204).end()
  }

  logoutAll = async (request: Request, response: Response) => {
    await this.service.logoutAll(request.auth!.actorUserId, metadata(request))
    this.clearCookies(response)
    response.status(204).end()
  }

  sessions = async (request: Request, response: Response) => {
    if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Session management is unavailable during impersonation.')
    response.json({ sessions: await this.service.listSessions(request.auth!.actorUserId, request.auth!.sessionId) })
  }

  revokeSession = async (request: Request, response: Response) => {
    if (request.auth!.impersonationSessionId) throw new ApiError(403, 'IMPERSONATION_SENSITIVE_OPERATION_BLOCKED', 'Session management is unavailable during impersonation.')
    const result = await this.service.revokeSession(request.auth!.actorUserId, sessionIdSchema.parse(request.params.sessionId), request.auth!.sessionId, metadata(request))
    if (result.current) this.clearCookies(response)
    response.json(result)
  }

  private clearCookies(response: Response) {
    response.clearCookie(SESSION_COOKIE, { path: '/' })
    response.clearCookie(CSRF_COOKIE, { path: '/' })
  }
}
