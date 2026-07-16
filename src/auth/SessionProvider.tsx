import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from './authApi'
import type { SessionPayload } from './authTypes'
import { useRoadmapStore } from '../hooks/useRoadmapStore'

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
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); useRoadmapStore.getState().setLocale(locale); useRoadmapStore.getState().setTheme(theme) }, [locale, theme])
  const activateSession = useCallback((payload: SessionPayload) => {
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
  useEffect(() => { authApi.session().then(activateSession).catch(() => setSession(null)).finally(() => setLoading(false)) }, [activateSession])
  const login = useCallback(async (email: string, password: string, recaptchaToken?: string) => { await authApi.login(email, password, recaptchaToken); activateSession(await authApi.session()) }, [activateSession])
  const register = useCallback(async (input: { email: string; password: string; displayName: string; acceptTerms: boolean; recaptchaToken?: string }) => { const result = await authApi.register(input); if (result.requiresVerification) return true; activateSession(await authApi.session()); return false }, [activateSession])
  const logout = useCallback(async (all = false) => { if (all) await authApi.logoutAll(); else await authApi.logout(); setSession(null) }, [])
  const refreshSession = useCallback(async () => activateSession(await authApi.session()), [activateSession])
  const setAppearance = useCallback(async (next: { locale?: 'es' | 'en'; theme?: 'light' | 'dark' }) => {
    const nextLocale = next.locale ?? locale; const nextTheme = next.theme ?? theme
    setLocale(nextLocale); setTheme(nextTheme); localStorage.setItem('northstar-auth-locale', nextLocale); localStorage.setItem('northstar-auth-theme', nextTheme); document.documentElement.setAttribute('data-theme', nextTheme)
    useRoadmapStore.getState().setLocale(nextLocale); useRoadmapStore.getState().setTheme(nextTheme)
    if (session) { await authApi.updatePreferences(next); activateSession(await authApi.session()) }
  }, [locale, theme, session, activateSession])
  const value = useMemo(() => ({ session, loading, login, register, logout, locale, theme, setAppearance, refreshSession }), [session, loading, login, register, logout, locale, theme, setAppearance, refreshSession])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// The provider and its hook intentionally share the private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}
