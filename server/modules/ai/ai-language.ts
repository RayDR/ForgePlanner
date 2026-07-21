export type DetectedLanguage = 'EN' | 'ES' | 'MIXED' | 'UNKNOWN'

const spanish = new Set(['quiero','necesito','para','con','durante','mejorar','crear','aprender','ahorrar','plan','meses','trabajo','tiempo','familia','objetivo'])
const english = new Set(['want','need','for','with','during','improve','create','learn','save','months','work','time','family','goal'])

export function detectProposalLanguage(value: string): DetectedLanguage {
  const words = value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+/g) ?? []
  if (words.length < 3) return 'UNKNOWN'
  let es = 0; let en = 0
  for (const word of words) { if (spanish.has(word)) es += 1; if (english.has(word)) en += 1 }
  if (es >= 2 && en >= 2 && Math.min(es, en) / Math.max(es, en) >= 0.6) return 'MIXED'
  if (es >= 2 && es > en) return 'ES'
  if (en >= 2 && en > es) return 'EN'
  return 'UNKNOWN'
}

export function selectProposalLanguage(input: { preferred: 'auto' | 'en' | 'es'; detected: DetectedLanguage; fallback: 'en' | 'es' }) {
  if (input.preferred !== 'auto') return input.preferred.toUpperCase() as 'EN' | 'ES'
  if (input.detected === 'EN' || input.detected === 'ES') return input.detected
  return input.fallback.toUpperCase() as 'EN' | 'ES'
}
