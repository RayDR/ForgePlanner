import { LocaleThemeControls } from '../ui/LocaleThemeControls'
import { useSession } from './SessionProvider'

export function AuthAppearanceControls() {
  const { locale, theme, setAppearance } = useSession()
  return <div className="auth-appearance"><LocaleThemeControls locale={locale} theme={theme} onToggleLocale={() => void setAppearance({ locale: locale === 'es' ? 'en' : 'es' })} onToggleTheme={() => void setAppearance({ theme: theme === 'dark' ? 'light' : 'dark' })} switchToEnglishLabel="Switch to English" switchToSpanishLabel="Cambiar a español" switchToDarkLabel={locale === 'es' ? 'Cambiar a modo oscuro' : 'Switch to dark mode'} switchToLightLabel={locale === 'es' ? 'Cambiar a modo claro' : 'Switch to light mode'} /></div>
}
