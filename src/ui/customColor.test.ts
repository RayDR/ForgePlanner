import { describe, expect, it } from 'vitest'
import { customColorClass, nearestSemanticColor, normalizeCustomColor } from './customColor'

describe('custom colors', () => {
  it('normalizes safe six-digit hexadecimal colors', () => {
    expect(normalizeCustomColor('#AABBCC')).toBe('#aabbcc')
    expect(normalizeCustomColor('red')).toBeUndefined()
    expect(normalizeCustomColor('#fff')).toBeUndefined()
  })

  it('keeps a semantic fallback for existing color classes', () => {
    expect(nearestSemanticColor('#245fe5')).toBe('blue')
    expect(nearestSemanticColor('#e21b4d')).toBe('rose')
  })

  it('never creates a class from malformed input', () => {
    expect(customColorClass('};body{display:none}')).toBe('')
    expect(customColorClass('#12abef')).toContain('custom-color-12abef')
  })
})
