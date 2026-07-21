import { describe, expect, it } from 'vitest'
import { detectProposalLanguage, selectProposalLanguage } from './ai-language.js'

describe('advisory AI proposal language detection', () => {
  it('keeps ambiguous short input unknown', () => expect(detectProposalLanguage('AWS cert')).toBe('UNKNOWN'))
  it('keeps Spanish with technical English terms Spanish', () => expect(detectProposalLanguage('Quiero mejorar mi trabajo con AWS cloud durante seis meses')).toBe('ES'))
  it('keeps English with Spanish proper names English', () => expect(detectProposalLanguage('I want to improve work with María during six months')).toBe('EN'))
  it('detects genuinely mixed input', () => expect(detectProposalLanguage('Quiero improve my trabajo with family y tiempo for learning')).toBe('MIXED'))
  it('honors explicit preference and locale fallback', () => { expect(selectProposalLanguage({ preferred: 'es', detected: 'EN', fallback: 'en' })).toBe('ES'); expect(selectProposalLanguage({ preferred: 'auto', detected: 'UNKNOWN', fallback: 'es' })).toBe('ES') })
})
