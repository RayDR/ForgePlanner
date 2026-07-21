import type { Locale } from '../i18n'

export interface PlanSavingsSettings {
  savingsEnabled: boolean
  savingsMode: 'free' | 'monthly-target'
  defaultMonthlyTarget: number
}

interface PlanSavingsConfigProps {
  locale: Locale
  value: PlanSavingsSettings
  onChange: (value: PlanSavingsSettings) => void
  templateIncluded?: boolean
}

export function PlanSavingsConfig({ locale, value, onChange, templateIncluded = false }: PlanSavingsConfigProps) {
  return (
    <div className="plan-savings-config">
      {templateIncluded ? <p className="savings-template-note">{locale === 'es' ? 'El seguimiento de ahorro está incluido en esta plantilla.' : 'Savings tracking is included with this template.'}</p> : <label className="progress-mode-toggle">
        <input
          type="checkbox"
          checked={value.savingsEnabled}
          onChange={(event) => onChange({ ...value, savingsEnabled: event.target.checked })}
        />
        <span>{locale === 'es' ? 'Registrar ahorro en este plan' : 'Track savings in this plan'}</span>
      </label>}
      {value.savingsEnabled ? (
        <div className="form-grid form-grid-compact">
          <label className="field-wrap">
            <span>{locale === 'es' ? 'Modo de ahorro' : 'Savings mode'}</span>
            <select
              className="field-input"
              value={value.savingsMode}
              onChange={(event) => onChange({ ...value, savingsMode: event.target.value as PlanSavingsSettings['savingsMode'] })}
            >
              <option value="free">{locale === 'es' ? 'Registro libre, sin meta' : 'Free tracking, no target'}</option>
              <option value="monthly-target">{locale === 'es' ? 'Meta mensual' : 'Monthly target'}</option>
            </select>
          </label>
          {value.savingsMode === 'monthly-target' ? (
            <label className="field-wrap">
              <span>{locale === 'es' ? 'Meta mensual predeterminada' : 'Default monthly target'}</span>
              <input
                className="field-input"
                type="number"
                min="0"
                value={value.defaultMonthlyTarget}
                onChange={(event) => onChange({ ...value, defaultMonthlyTarget: Math.max(0, Number(event.target.value || 0)) })}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
