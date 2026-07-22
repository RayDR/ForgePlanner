import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CategoryFilter } from './CategoryFilter'

const categories = [
  { key: 'work', label: 'Trabajo', tone: 'blue' as const },
  { key: 'study', label: 'Estudio', tone: 'green' as const },
]

describe('CategoryFilter', () => {
  it('renders multiple selected categories as removable tags with a reset action', () => {
    const markup = renderToStaticMarkup(<CategoryFilter multiple categories={categories} values={['work', 'study']} locale="es" onChange={vi.fn()} />)
    expect(markup).toContain('Trabajo')
    expect(markup).toContain('Estudio')
    expect(markup).toContain('Quitar Trabajo')
    expect(markup).toContain('Restablecer filtros')
  })
})
