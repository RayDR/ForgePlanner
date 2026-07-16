import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ActivityModal } from '../activity/ActivityModal'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { copy } from '../i18n'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import { LocaleThemeControls } from '../ui/LocaleThemeControls'
import { formatDateRange, getProjectYears } from '../utils/dateUtils'
import { formatCurrency, getAverageProgress, getSavingsProgress } from '../utils/progressUtils'
import { getProjectSavingsTotals, getYearlySavingsTotals, isSavingsTrackingEnabled } from '../utils/roadmapModel'
import { resolveInitialMonthForYear } from '../utils/monthSelection'
import { CalendarIcon, ListIcon, MoreVerticalIcon, PencilIcon } from '../ui/icons'
import { useSession } from '../auth/SessionProvider'
import { NotificationCenter } from '../notifications/NotificationCenter'
import { AccountMenu } from '../account/AccountMenu'
import { CollaborationLauncher } from '../plans/CollaborationLauncher'

const views = [
  { to: '/roadmap', label: 'Annual roadmap' },
  { to: '/monthly', label: 'Monthly planner' },
]

export function AppShell() {
  const { setAppearance } = useSession()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const importExcelInputRef = useRef<HTMLInputElement | null>(null)
  const [showDataMenu, setShowDataMenu] = useState(false)
  const [showSavingsBreakdown, setShowSavingsBreakdown] = useState(false)
  const [showDateEditor, setShowDateEditor] = useState(false)
  const [dateDraft, setDateDraft] = useState({ startDate: '', endDate: '' })
  const dataMenuRef = useRef<HTMLDivElement | null>(null)
  const project = useRoadmapStore((state) => state.project)
  const activities = useRoadmapStore((state) => state.activities)
  const locale = useRoadmapStore((state) => state.locale)
  const theme = useRoadmapStore((state) => state.theme)
  const selectedYear = useRoadmapStore((state) => state.selectedYear)
  const setSelectedYear = useRoadmapStore((state) => state.setSelectedYear)
  const setSelectedPeriod = useRoadmapStore((state) => state.setSelectedPeriod)
  const setLocale = useRoadmapStore((state) => state.setLocale)
  const setTheme = useRoadmapStore((state) => state.setTheme)
  const updateProjectDetails = useRoadmapStore((state) => state.updateProjectDetails)
  const pendingMove = useRoadmapStore((state) => state.pendingMove)
  const migrationIssue = useRoadmapStore((state) => state.migrationIssue)
  const dismissMigrationIssue = useRoadmapStore((state) => state.dismissMigrationIssue)
  const confirmPendingMove = useRoadmapStore((state) => state.confirmPendingMove)
  const cancelPendingMove = useRoadmapStore((state) => state.cancelPendingMove)
  const exportStateAsJson = useRoadmapStore((state) => state.exportStateAsJson)
  const importStateFromJson = useRoadmapStore((state) => state.importStateFromJson)
  const exportActivitiesAsExcelCsv = useRoadmapStore((state) => state.exportActivitiesAsExcelCsv)
  const importActivitiesFromExcelCsv = useRoadmapStore((state) => state.importActivitiesFromExcelCsv)
  const activePlanId = useForgePlannerStore((state) => state.activePlanId)
  const activePlan = useForgePlannerStore((state) =>
    state.activePlanId ? state.plans.find((plan) => plan.id === state.activePlanId) : undefined,
  )
  const syncActivePlanFromRoadmap = useForgePlannerStore((state) => state.syncActivePlanFromRoadmap)
  const { planId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const totalProgress = getAverageProgress(activities)
  const savingsProgress = getSavingsProgress(project)
  const savingsTotals = getProjectSavingsTotals(project)
  const yearlySavingsTotals = getProjectYears(project.startDate, project.endDate).map((year) => ({ year, ...getYearlySavingsTotals(project, year) }))
  const years = getProjectYears(project.startDate, project.endDate)
  const t = copy[locale]
  const savingsEnabled = isSavingsTrackingEnabled(project)
  const readOnly = activePlan?.remoteAccess === 'viewer'

  function selectYear(year: number) {
    if (location.pathname.includes('/monthly') && planId) {
      const monthIdsWithData = [
        ...activities.flatMap((activity) => Object.keys(activity.monthlyEntries)),
        ...project.savingsPlan.monthlyEntries
          .filter((entry) => entry.actual > 0 || entry.target > 0 || Boolean(entry.notes?.trim()))
          .map((entry) => entry.monthId),
      ]
      const nextMonthId = resolveInitialMonthForYear(
        year,
        project.startDate,
        project.endDate,
        monthIdsWithData,
      )
      setSelectedPeriod(nextMonthId)
      navigate(`/plans/${planId}/monthly/${nextMonthId}`, { replace: true })
      return
    }

    setSelectedYear(year)
  }

  const routeMonthMatch = location.pathname.match(/\/monthly\/(\d{4})-\d{2}(?:\/|$)/)
  const visibleSelectedYear = routeMonthMatch ? Number(routeMonthMatch[1]) : selectedYear

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!readOnly) syncActivePlanFromRoadmap()
  }, [
    syncActivePlanFromRoadmap,
    activePlanId,
    project,
    activities,
    selectedYear,
    locale,
    theme,
    readOnly,
  ])

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!dataMenuRef.current) {
        return
      }

      const target = event.target as Node | null
      if (target && !dataMenuRef.current.contains(target)) {
        setShowDataMenu(false)
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  function handleExportJson() {
    const blob = new Blob([exportStateAsJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'northstar-planner-export.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleExportBackupJson() {
    if (!migrationIssue) {
      return
    }

    const blob = new Blob([migrationIssue.backupJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'northstar-planner-migration-backup.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportJson(file: File) {
    const text = await file.text()
    const result = importStateFromJson(text)

    if (!result.ok) {
      alert(result.error || t.importErrorJson)
    }
  }

  function handleExportExcel() {
    const blob = new Blob([exportActivitiesAsExcelCsv()], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'northstar-activities.xlsx.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportExcel(file: File) {
    const text = await file.text()
    const result = importActivitiesFromExcelCsv(text)

    if (!result.ok) {
      alert(result.error || t.importErrorExcel)
    }
  }

  return (
    <div className="app-bg">
      <div className="shell">
        <header className="app-header">
          <div className="app-header-topbar">
            <Button className="back-to-plans" variant="ghost" onClick={() => navigate('/plans')}>
              <span aria-hidden="true">←</span>
              {t.backToPlans}
            </Button>
            <div className="header-account-controls"><NotificationCenter /><CollaborationLauncher /><AccountMenu /><LocaleThemeControls
              locale={locale}
              theme={theme}
              onToggleLocale={() => { const next = locale === 'es' ? 'en' : 'es'; setLocale(next); void setAppearance({ locale: next }) }}
              onToggleTheme={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); void setAppearance({ theme: next }) }}
              switchToEnglishLabel={t.languageSwitchToEnglish}
              switchToSpanishLabel={t.languageSwitchToSpanish}
              switchToDarkLabel={t.switchToDarkMode}
              switchToLightLabel={t.switchToLightMode}
            /></div>
          </div>
          <div>
            <p className="eyebrow">{t.appName}</p>
            <h1>{activePlan?.title ?? project.name}</h1>
            <p className="header-copy">{project.objective}</p>
            {readOnly ? <p className="plan-read-only-badge">{t.sharedReadOnly}</p> : null}
          </div>

          <div className="metrics-grid">
            <Card className={`metric-card ${readOnly ? '' : 'metric-card-interactive'}`} title={readOnly ? undefined : t.editDatesTooltip} onDoubleClick={() => { if (!readOnly) { setDateDraft({ startDate: project.startDate, endDate: project.endDate }); setShowDateEditor(true) } }}>
              <span>{t.planWindow}</span>
              <strong>{formatDateRange(project.startDate, project.endDate)}</strong>
            </Card>
            <Card className="metric-card">
              <span>{t.totalProgress}</span>
              <strong>{totalProgress}%</strong>
            </Card>
            {savingsEnabled ? <Card className="metric-card metric-card-interactive" role="button" tabIndex={0} onClick={() => setShowSavingsBreakdown(true)} onKeyDown={(event) => { if (event.key === 'Enter') setShowSavingsBreakdown(true) }}>
              <span>{t.savingsProgress}</span>
              <strong>{savingsProgress}%</strong>
            </Card> : null}
          </div>
          <details className="mobile-dashboard-details">
            <summary>{t.planDetails}</summary>
            <div>
              <button type="button" onClick={() => { setDateDraft({ startDate: project.startDate, endDate: project.endDate }); setShowDateEditor(true) }}><span>{t.planWindow}</span><strong>{formatDateRange(project.startDate, project.endDate)}</strong><PencilIcon width={15} height={15} /></button>
              <button type="button"><span>{t.totalProgress}</span><strong>{totalProgress}%</strong></button>
              {savingsEnabled ? <button type="button" onClick={() => setShowSavingsBreakdown(true)}><span>{t.savingsProgress}</span><strong>{savingsProgress}%</strong></button> : null}
            </div>
          </details>
        </header>

        <Card className="toolbar">
          <nav>
            {views.map((view) => (
              <NavLink
                key={view.to}
                to={planId ? `/plans/${planId}${view.to}` : '/plans'}
                className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
                title={view.to === '/roadmap' ? t.annual : view.to === '/monthly' ? t.monthly : t.planner}
              >
                {view.to === '/roadmap' ? <ListIcon width={19} height={19} /> : <CalendarIcon width={19} height={19} />}
                <span className="nav-link-label">{view.to === '/roadmap' ? t.annual : view.to === '/monthly' ? t.monthly : t.planner}</span>
              </NavLink>
            ))}
          </nav>
          <div className="toolbar-actions">
            <div className="data-menu-wrap" ref={dataMenuRef}>
              <IconButton label={t.dataMenuLabel} onClick={() => setShowDataMenu((current) => !current)}>
                <MoreVerticalIcon width={18} height={18} />
              </IconButton>
              {showDataMenu ? (
                <div className="data-menu">
                  <button onClick={handleExportJson}>{t.exportJson}</button>
                  {!readOnly ? <button onClick={() => importInputRef.current?.click()}>{t.importJson}</button> : null}
                  <button onClick={handleExportExcel}>{t.exportExcel}</button>
                  {!readOnly ? <button onClick={() => importExcelInputRef.current?.click()}>{t.importExcel}</button> : null}
                </div>
              ) : null}
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (file) {
                  await handleImportJson(file)
                }
                event.currentTarget.value = ''
                setShowDataMenu(false)
              }}
            />
            <input
              ref={importExcelInputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (file) {
                  await handleImportExcel(file)
                }
                event.currentTarget.value = ''
                setShowDataMenu(false)
              }}
            />
          </div>
          <div className="year-controls">
            {years.map((year) => (
              <Button key={year} variant={visibleSelectedYear === year ? 'active' : 'ghost'} onClick={() => selectYear(year)} aria-pressed={visibleSelectedYear === year}>
                {year}
              </Button>
            ))}
          </div>
        </Card>

        {migrationIssue ? (
          <Card className="move-banner">
            <p>{migrationIssue.message}</p>
            <div className="move-banner-actions">
              <Button variant="secondary" onClick={handleExportBackupJson}>
                {t.exportBackup}
              </Button>
              <Button variant="ghost" onClick={dismissMigrationIssue}>
                {t.dismiss}
              </Button>
            </div>
          </Card>
        ) : null}

        {pendingMove ? (
          <Card className="move-banner">
            <p>{pendingMove.message}</p>
            <div className="move-banner-actions">
              <Button variant="secondary" onClick={() => confirmPendingMove(false)}>
                {t.adjustOnly}
              </Button>
              <Button variant="primary" onClick={() => confirmPendingMove(true)}>
                {t.adjustGroup}
              </Button>
              <Button variant="ghost" onClick={cancelPendingMove}>
                {t.cancel}
              </Button>
            </div>
          </Card>
        ) : null}

        <main>
          <Outlet />
        </main>
      </div>

      {showDateEditor ? (
        <div className="modal-overlay" onClick={() => setShowDateEditor(false)}>
          <div className="modal-shell compact-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header"><h2>{t.planWindow}</h2><button className="btn btn-ghost" onClick={() => setShowDateEditor(false)}>×</button></header>
            <div className="modal-body form-grid">
              <label className="field-wrap"><span>{t.startDate}</span><input className="field-input" type="date" value={dateDraft.startDate} onChange={(event) => setDateDraft((current) => ({ ...current, startDate: event.target.value }))} /></label>
              <label className="field-wrap"><span>{t.endDate}</span><input className="field-input" type="date" value={dateDraft.endDate} onChange={(event) => setDateDraft((current) => ({ ...current, endDate: event.target.value }))} /></label>
            </div>
            <footer className="modal-footer"><button className="btn btn-ghost" onClick={() => setShowDateEditor(false)}>{t.cancel}</button><button className="btn btn-primary" onClick={() => { updateProjectDetails(dateDraft); setShowDateEditor(false) }}>{t.save}</button></footer>
          </div>
        </div>
      ) : null}

      {savingsEnabled && showSavingsBreakdown ? (
        <div className="modal-overlay" onClick={() => setShowSavingsBreakdown(false)}>
          <div className="modal-shell savings-breakdown-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header"><h2>{t.savingsProgress}</h2><button className="btn btn-ghost" onClick={() => setShowSavingsBreakdown(false)}>×</button></header>
            <div className="modal-body savings-breakdown">
              {yearlySavingsTotals.map((item) => <Card key={item.year} className="roadmap-summary-card"><strong>{item.year}</strong><span>{t.target}: {formatCurrency(item.target)}</span><span>{t.actual}: {formatCurrency(item.actual)}</span><span>{t.difference}: {formatCurrency(item.difference)}</span></Card>)}
              <Card className="roadmap-summary-card"><strong>{t.globalTotal}</strong><span>{formatCurrency(savingsTotals.actual)} / {formatCurrency(savingsTotals.target)}</span><span>{t.remaining}: {formatCurrency(savingsTotals.remaining)}</span><span>{savingsTotals.progress}%</span></Card>
            </div>
          </div>
        </div>
      ) : null}

      <ActivityModal />
    </div>
  )
}
