import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { authApi } from './authApi'
import type { SessionPayload } from './authTypes'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { GUEST_SCOPE, getIdentityScope, userIdentityScope } from '../persistence/identityScope'
import { clearBrowserIdentityMemory, transitionBrowserIdentity } from '../persistence/identityTransition'
import { publishIdentitySignal, subscribeToIdentitySignals } from '../persistence/identitySignals'

interface SessionContextValue {
  session: SessionPayload | null
  loading: boolean
  login: (email: string, password: string, recaptchaToken?: string) => Promise<void>
  register: (input: { email: string; password: string; displayName: string; acceptTerms: boolean; recaptchaToken?: string }) => Promise<boolean>
  logout: (all?: boolean) => Promise<void>
  locale: 'es' | 'en'
  theme: 'light' | 'dark'
  setAppearance: (next: { locale?: 'es' | 'en'; theme?: 'light' | 'dark' }) => Promise<void>
  refreshSession: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<'es' | 'en'>(() => localStorage.getItem('northstar-auth-locale') === 'en' ? 'en' : 'es')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('northstar-auth-theme') === 'light' ? 'light' : 'dark')
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const operationRef = useRef(0)
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); useRoadmapStore.getState().setLocale(locale); useRoadmapStore.getState().setTheme(theme) }, [locale, theme])
  const activateSession = useCallback(async (payload: SessionPayload) => {
    const scope = userIdentityScope(payload.user.id)
    if (getIdentityScope() !== scope) await transitionBrowserIdentity(scope)
    const profile = payload.user.profile
    setSession(payload)
    if (!profile) return
    const nextLocale = profile.locale === 'en' ? 'en' : 'es'
    const nextTheme = profile.preferences?.theme === 'light' ? 'light' : 'dark'
    setLocale(nextLocale); setTheme(nextTheme)
    localStorage.setItem('northstar-auth-locale', nextLocale); localStorage.setItem('northstar-auth-theme', nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    useRoadmapStore.getState().setLocale(nextLocale); useRoadmapStore.getState().setTheme(nextTheme)
  }, [])
  const resolveSession = useCallback(async () => {
    const operation = ++operationRef.current
    setLoading(true)
    try {
      const payload = await authApi.session()
      if (operation !== operationRef.current) return
      await activateSession(payload)
    } catch {
      if (operation !== operationRef.current) return
      clearBrowserIdentityMemory()
      await transitionBrowserIdentity(GUEST_SCOPE)
      setSession(null)
    } finally {
      if (operation === operationRef.current) setLoading(false)
    }
  }, [activateSession])
  useEffect(() => {
    const timer = window.setTimeout(() => { void resolveSession() }, 0)
    return () => window.clearTimeout(timer)
  }, [resolveSession])
  useEffect(() => subscribeToIdentitySignals(() => { clearBrowserIdentityMemory(); void resolveSession() }), [resolveSession])
  const login = useCallback(async (email: string, password: string, recaptchaToken?: string) => {
    const operation = ++operationRef.current
    setLoading(true); clearBrowserIdentityMemory()
    try {
      await authApi.login(email, password, recaptchaToken)
      const payload = await authApi.session()
      if (operation !== operationRef.current) return
      await activateSession(payload); publishIdentitySignal('session-changed')
    } catch (cause) {
      if (operation === operationRef.current) { await transitionBrowserIdentity(GUEST_SCOPE); setSession(null) }
      throw cause
    } finally {
      if (operation === operationRef.current) setLoading(false)
    }
  }, [activateSession])
  const register = useCallback(async (input: { email: string; password: string; displayName: string; acceptTerms: boolean; recaptchaToken?: string }) => {
    const operation = ++operationRef.current
    setLoading(true); clearBrowserIdentityMemory()
    try {
      const result = await authApi.register(input)
      if (result.requiresVerification) { await transitionBrowserIdentity(GUEST_SCOPE); setSession(null); return true }
      const payload = await authApi.session()
      if (operation === operationRef.current) { await activateSession(payload); publishIdentitySignal('session-changed') }
      return false
    } catch (cause) {
      if (operation === operationRef.current) { await transitionBrowserIdentity(GUEST_SCOPE); setSession(null) }
      throw cause
    } finally {
      if (operation === operationRef.current) setLoading(false)
    }
  }, [activateSession])
  const logout = useCallback(async (all = false) => {
    const operation = ++operationRef.current
    setLoading(true); clearBrowserIdentityMemory(); setSession(null)
    try {
      if (all) await authApi.logoutAll(); else await authApi.logout()
    } finally {
      if (operation === operationRef.current) {
        await transitionBrowserIdentity(GUEST_SCOPE)
        setLoading(false); publishIdentitySignal('session-changed')
      }
    }
  }, [])
  const refreshSession = useCallback(async () => {
    const operation = ++operationRef.current
    setLoading(true)
    try {
      const payload = await authApi.session()
      if (operation === operationRef.current) await activateSession(payload)
    } catch (cause) {
      if (operation === operationRef.current) { clearBrowserIdentityMemory(); await transitionBrowserIdentity(GUEST_SCOPE); setSession(null) }
      throw cause
    } finally {
      if (operation === operationRef.current) setLoading(false)
    }
  }, [activateSession])
  useEffect(() => {
    if (!session?.expiresAt) return
    const delay = Math.max(0, new Date(session.expiresAt).getTime() - Date.now())
    const timer = window.setTimeout(() => { void resolveSession() }, Math.min(delay + 250, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [session?.expiresAt, resolveSession])
  const setAppearance = useCallback(async (next: { locale?: 'es' | 'en'; theme?: 'light' | 'dark' }) => {
    const nextLocale = next.locale ?? locale; const nextTheme = next.theme ?? theme
    setLocale(nextLocale); setTheme(nextTheme); localStorage.setItem('northstar-auth-locale', nextLocale); localStorage.setItem('northstar-auth-theme', nextTheme); document.documentElement.setAttribute('data-theme', nextTheme)
    useRoadmapStore.getState().setLocale(nextLocale); useRoadmapStore.getState().setTheme(nextTheme)
    if (session) { await authApi.updatePreferences(next); await activateSession(await authApi.session()) }
  }, [locale, theme, session, activateSession])
  const value = useMemo(() => ({ session, loading, login, register, logout, locale, theme, setAppearance, refreshSession }), [session, loading, login, register, logout, locale, theme, setAppearance, refreshSession])
  return <SessionContext.Provider value={value}>{loading ? <main className="auth-loading" aria-live="polite">{locale === 'es' ? 'Cargando…' : 'Loading…'}</main> : children}</SessionContext.Provider>
}

// The provider and its hook intentionally share the private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}
