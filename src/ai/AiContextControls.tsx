import { useState } from 'react'
import type { AiProposalCopy } from './aiProposalCopy'
import type { AiComposerContext } from './proposalInput'

type Choice<T extends string | number> = { value: T; label: string; icon: string }

function ChoiceGroup<T extends string | number>({ label, value, choices, onChange, selectedLabel }: {
  label: string
  value: T
  choices: Choice<T>[]
  onChange: (value: T) => void
  selectedLabel: string
}) {
  return <fieldset className="ai-context-group">
    <legend>{label}</legend>
    <div className="ai-context-chips" role="radiogroup" aria-label={label}>
      {choices.map((choice) => {
        const selected = value === choice.value
        return <button key={choice.value} className={selected ? 'ai-context-chip is-selected' : 'ai-context-chip'} type="button" role="radio" aria-checked={selected} onClick={() => onChange(choice.value)}>
          <span aria-hidden="true">{choice.icon}</span><span>{choice.label}</span>{selected ? <span className="ai-context-check" aria-label={selectedLabel}>✓</span> : null}
        </button>
      })}
    </div>
  </fieldset>
}

export function AiContextControls({ value, onChange, copy: t }: {
  value: AiComposerContext
  onChange: (value: AiComposerContext) => void
  copy: AiProposalCopy
}) {
  const presetDurations = [1, 3, 6, 12, 18, 24]
  const presetHours = [2, 5, 8, 12]
  const [customDuration, setCustomDuration] = useState(value.durationMonths != null && !presetDurations.includes(value.durationMonths))
  const [customHours, setCustomHours] = useState(value.hoursPerWeek != null && !presetHours.includes(value.hoursPerWeek))
  const set = <K extends keyof AiComposerContext>(key: K, next: AiComposerContext[K]) => onChange({ ...value, [key]: next })

  return <div className="ai-context-controls">
    <ChoiceGroup label={t.scope} value={value.scope} selectedLabel={t.selected} onChange={(next) => set('scope', next)} choices={[
      { value: 'focused', label: t.focused, icon: '◎' }, { value: 'balanced', label: t.balanced, icon: '◫' }, { value: 'comprehensive', label: t.comprehensive, icon: '▦' },
    ]} />

    <fieldset className="ai-context-group">
      <legend>{t.duration}</legend>
      <div className="ai-context-chips" role="radiogroup" aria-label={t.duration}>
        <button type="button" role="radio" aria-checked={value.durationMonths === null && !customDuration} className={value.durationMonths === null && !customDuration ? 'ai-context-chip is-selected' : 'ai-context-chip'} onClick={() => { setCustomDuration(false); set('durationMonths', null) }}><span aria-hidden="true">◌</span>{t.automatic}{value.durationMonths === null && !customDuration ? <span className="ai-context-check" aria-label={t.selected}>✓</span> : null}</button>
        {presetDurations.map((month) => <button key={month} type="button" role="radio" aria-checked={!customDuration && value.durationMonths === month} className={!customDuration && value.durationMonths === month ? 'ai-context-chip is-selected' : 'ai-context-chip'} onClick={() => { setCustomDuration(false); set('durationMonths', month) }}><span aria-hidden="true">◷</span>{month} {t.monthsShort}{!customDuration && value.durationMonths === month ? <span className="ai-context-check" aria-label={t.selected}>✓</span> : null}</button>)}
        <button type="button" role="radio" aria-checked={customDuration} className={customDuration ? 'ai-context-chip is-selected' : 'ai-context-chip'} onClick={() => { setCustomDuration(true); if (value.durationMonths == null || presetDurations.includes(value.durationMonths)) set('durationMonths', null) }}><span aria-hidden="true">＋</span>{t.custom}{customDuration ? <span className="ai-context-check" aria-label={t.selected}>✓</span> : null}</button>
      </div>
      {customDuration ? <div className="ai-context-custom"><label><span>{t.duration}</span><input className="field-input" type="number" min="1" max="120" value={value.durationMonths ?? ''} onChange={(event) => set('durationMonths', event.target.value ? Number(event.target.value) : null)} /></label><button type="button" className="btn btn-ghost" onClick={() => { setCustomDuration(false); set('durationMonths', null) }}>{t.clear}</button></div> : null}
    </fieldset>

    <ChoiceGroup label={t.complexity} value={value.complexity} selectedLabel={t.selected} onChange={(next) => set('complexity', next)} choices={[
      { value: 'simple', label: t.simple, icon: '●' }, { value: 'moderate', label: t.moderate, icon: '◆' }, { value: 'advanced', label: t.advanced, icon: '✦' },
    ]} />
    <ChoiceGroup label={t.detail} value={value.detail} selectedLabel={t.selected} onChange={(next) => set('detail', next)} choices={[
      { value: 'overview', label: t.overview, icon: '▤' }, { value: 'detailed', label: t.detailed, icon: '☷' }, { value: 'step-by-step', label: t.steps, icon: '☑' },
    ]} />

    <fieldset className="ai-context-group">
      <legend>{t.hours}</legend>
      <div className="ai-context-chips" role="radiogroup" aria-label={t.hours}>
        <button type="button" role="radio" aria-checked={value.hoursPerWeek === null && !customHours} className={value.hoursPerWeek === null && !customHours ? 'ai-context-chip is-selected' : 'ai-context-chip'} onClick={() => { setCustomHours(false); set('hoursPerWeek', null) }}><span aria-hidden="true">◌</span>{t.automatic}{value.hoursPerWeek === null && !customHours ? <span className="ai-context-check" aria-label={t.selected}>✓</span> : null}</button>
        {[[2, '1–3'], [5, '4–6'], [8, '7–10'], [12, '10+']].map(([hours, label]) => <button key={hours} type="button" role="radio" aria-checked={!customHours && value.hoursPerWeek === hours} className={!customHours && value.hoursPerWeek === hours ? 'ai-context-chip is-selected' : 'ai-context-chip'} onClick={() => { setCustomHours(false); set('hoursPerWeek', Number(hours)) }}><span aria-hidden="true">◷</span>{label} {t.hoursShort}{!customHours && value.hoursPerWeek === hours ? <span className="ai-context-check" aria-label={t.selected}>✓</span> : null}</button>)}
        <button type="button" role="radio" aria-checked={customHours} className={customHours ? 'ai-context-chip is-selected' : 'ai-context-chip'} onClick={() => { setCustomHours(true); if (value.hoursPerWeek == null || presetHours.includes(value.hoursPerWeek)) set('hoursPerWeek', null) }}><span aria-hidden="true">＋</span>{t.custom}{customHours ? <span className="ai-context-check" aria-label={t.selected}>✓</span> : null}</button>
      </div>
      {customHours ? <div className="ai-context-custom"><label><span>{t.hours}</span><input className="field-input" type="number" min="1" max="80" value={value.hoursPerWeek ?? ''} onChange={(event) => set('hoursPerWeek', event.target.value ? Number(event.target.value) : null)} /></label><button type="button" className="btn btn-ghost" onClick={() => { setCustomHours(false); set('hoursPerWeek', null) }}>{t.clear}</button></div> : null}
    </fieldset>

    <ChoiceGroup label={t.financial} value={value.financialMode} selectedLabel={t.selected} onChange={(next) => onChange({ ...value, financialMode: next, financialAmount: next === 'none' ? null : value.financialAmount })} choices={[
      { value: 'none', label: t.none, icon: '—' }, { value: 'budget', label: t.budget, icon: '▣' }, { value: 'savings', label: t.savings, icon: '◇' },
    ]} />
    {value.financialMode !== 'none' ? <div className="ai-financial-fields">
      <label><span>{value.financialMode === 'budget' ? t.budget : t.savings}</span><input className="field-input" type="number" min="0" value={value.financialAmount ?? ''} onChange={(event) => set('financialAmount', event.target.value ? Number(event.target.value) : null)} /></label>
      <label><span>{t.currency}</span><select className="field-input" value={value.currency} onChange={(event) => set('currency', event.target.value as AiComposerContext['currency'])}>{['USD', 'MXN', 'CAD', 'EUR', 'GBP'].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      <button type="button" className="btn btn-ghost" onClick={() => onChange({ ...value, financialMode: 'none', financialAmount: null })}>{t.clear}</button>
    </div> : null}
  </div>
}
