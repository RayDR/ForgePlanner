import type { Locale } from '../i18n'
import { AccountMenu } from '../account/AccountMenu'
import { NotificationCenter } from '../notifications/NotificationCenter'
import { CollaborationLauncher } from '../plans/CollaborationLauncher'
import { LocaleThemeControls } from '../ui/LocaleThemeControls'

interface HeaderActionsProps {
  locale: Locale
  theme: 'light' | 'dark'
  onToggleLocale: () => void
  onToggleTheme: () => void
  switchToEnglishLabel: string
  switchToSpanishLabel: string
  switchToDarkLabel: string
  switchToLightLabel: string
}

export function HeaderActions(props: HeaderActionsProps) {
  return <div className="header-account-controls" aria-label={props.locale === 'es' ? 'Acciones globales' : 'Global actions'}>
    <div className="header-action-group header-action-group--collaboration"><NotificationCenter /><CollaborationLauncher /></div>
    <span className="header-action-divider" aria-hidden="true" />
    <AccountMenu />
    <span className="header-action-divider" aria-hidden="true" />
    <LocaleThemeControls {...props} />
  </div>
}
