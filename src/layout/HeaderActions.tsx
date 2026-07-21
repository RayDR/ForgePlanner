import type { Locale } from '../i18n'
import { AccountMenu } from '../account/AccountMenu'
import { NotificationCenter } from '../notifications/NotificationCenter'
import { CollaborationLauncher } from '../plans/CollaborationLauncher'
import { LocaleThemeControls } from '../ui/LocaleThemeControls'
import { useSession } from '../auth/SessionProvider'

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
  const { session } = useSession()
  return <div className="header-account-controls" aria-label={props.locale === 'es' ? 'Acciones globales' : 'Global actions'}>
    {session ? <><div className="header-action-group header-action-group--collaboration"><NotificationCenter /><CollaborationLauncher /></div><span className="header-action-divider" aria-hidden="true" /></> : null}
    <AccountMenu />
    <span className="header-action-divider" aria-hidden="true" />
    <LocaleThemeControls {...props} />
  </div>
}
