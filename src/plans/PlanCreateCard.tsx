import { useRef } from 'react'
import type { Locale } from '../i18n'
import { PlusIcon, UploadIcon } from '../ui/icons'

export function PlanCreateCard({ locale, onAi, onManual, onImport }: { locale: Locale; onAi: () => void; onManual: () => void; onImport: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const es = locale === 'es'
  return <article className="plan-card plan-card--create card create-plan-card" data-testid="plan-create-card">
    <button type="button" className="plan-create-card__primary" onClick={onAi}>
      <span className="create-plan-card__icon"><PlusIcon width={44} height={44} /></span>
      <strong>{es ? 'Planear con NorthStar AI' : 'Plan with NorthStar AI'}</strong>
      <small>{es ? 'Describe tu objetivo y construyan el plan juntos.' : 'Describe your goal and build the plan together.'}</small>
    </button>
    <div className="plan-create-card__actions">
      <button type="button" className="btn" onClick={onManual}>{es ? 'Crear manualmente' : 'Create manually'}</button>
      <button type="button" className="btn btn-ghost" onClick={() => inputRef.current?.click()}><UploadIcon width={16} /> {es ? 'Importar' : 'Import'}</button>
    </div>
    <input ref={inputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = '' }} />
  </article>
}
