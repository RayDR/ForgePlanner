import type { RecurrenceFrequency } from '../types/roadmap'

export const recurrenceOptions: Array<{ value: RecurrenceFrequency; minDays: number; es: string; en: string }> = [
  { value: 'daily', minDays: 1, es: 'Diario', en: 'Daily' },
  { value: 'weekly', minDays: 7, es: 'Semanal', en: 'Weekly' },
  { value: 'biweekly', minDays: 14, es: 'Cada dos semanas', en: 'Every two weeks' },
  { value: 'fortnightly', minDays: 15, es: 'Quincenal (días 1 y 15)', en: 'Fortnightly (1st and 15th)' },
  { value: 'month-start', minDays: 28, es: 'Primer día del mes', en: 'First day of month' },
  { value: 'month-end', minDays: 28, es: 'Último día del mes', en: 'Last day of month' },
  { value: 'monthly', minDays: 28, es: 'Mensual', en: 'Monthly' },
  { value: 'bimonthly', minDays: 59, es: 'Bimestral', en: 'Every two months' },
  { value: 'quarterly', minDays: 89, es: 'Trimestral', en: 'Quarterly' },
  { value: 'semiannual', minDays: 179, es: 'Semestral', en: 'Semiannual' },
  { value: 'annual', minDays: 364, es: 'Anual', en: 'Annual' },
]

export function getApplicableRecurrenceOptions(startDate: string, maximumEndDate: string) {
  const durationDays = Math.max(0, Math.floor((new Date(`${maximumEndDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000))
  return recurrenceOptions.filter((option) => durationDays >= option.minDays)
}
