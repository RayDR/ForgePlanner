import type { Locale } from '../i18n'
import { MoonIcon, SunIcon } from './icons'
import { IconButton } from './IconButton'

interface LocaleThemeControlsProps {
  locale: Locale
  theme: 'light' | 'dark'
  onToggleLocale: () => void
  onToggleTheme: () => void
  switchToEnglishLabel: string
  switchToSpanishLabel: string
  switchToDarkLabel: string
  switchToLightLabel: string
}

export function LocaleThemeControls({
  locale,
  theme,
  onToggleLocale,
  onToggleTheme,
  switchToEnglishLabel,
  switchToSpanishLabel,
  switchToDarkLabel,
  switchToLightLabel,
}: LocaleThemeControlsProps) {
  return (
    <div className="locale-theme-controls">
      <IconButton label={locale === 'es' ? 'Español' : 'English'} title={locale === 'es' ? switchToEnglishLabel : switchToSpanishLabel} onClick={onToggleLocale} className="icon-button--flag">
        {locale === 'es' ? <span className="real-flag" role="img" aria-label="México">🇲🇽</span> : <span className="real-flag" role="img" aria-label="United States">🇺🇸</span>}
      </IconButton>
      <IconButton label={theme === 'dark' ? switchToLightLabel : switchToDarkLabel} onClick={onToggleTheme} className="icon-button--theme">
        {theme === 'dark' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
      </IconButton>
    </div>
  )
}
