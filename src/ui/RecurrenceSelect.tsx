import type { Locale } from '../i18n'
import type { RecurrenceFrequency } from '../types/roadmap'
import { getApplicableRecurrenceOptions } from '../utils/recurrence'

export function RecurrenceSelect({ locale, value, startDate, maximumEndDate, onChange }: { locale: Locale; value: 'none' | RecurrenceFrequency; startDate: string; maximumEndDate: string; onChange: (value: 'none' | RecurrenceFrequency) => void }) {
  return <select className="field-input" value={value} onChange={(event) => onChange(event.target.value as 'none' | RecurrenceFrequency)}><option value="none">{locale === 'es' ? 'No repetir' : 'Do not repeat'}</option>{getApplicableRecurrenceOptions(startDate, maximumEndDate).map((option) => <option key={option.value} value={option.value}>{locale === 'es' ? option.es : option.en}</option>)}</select>
}
