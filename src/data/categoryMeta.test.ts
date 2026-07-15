import { describe, expect, it } from 'vitest'
import { getCategoryMeta } from './northstarMockData'

describe('getCategoryMeta', () => {
  it('returns configured metadata for known categories', () => {
    expect(getCategoryMeta('savings')).toMatchObject({ key: 'savings', tone: 'green' })
  })

  it('keeps legacy category labels and uses a safe visual fallback', () => {
    expect(getCategoryMeta('legacy-custom-category')).toMatchObject({
      label: 'legacy-custom-category',
      tone: 'slate',
    })
  })

  it('handles missing runtime values without throwing', () => {
    expect(getCategoryMeta(undefined)).toMatchObject({ label: 'Uncategorized', tone: 'slate' })
  })
})
