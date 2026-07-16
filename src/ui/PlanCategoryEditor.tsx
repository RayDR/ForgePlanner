import { useState } from 'react'
import type { Locale } from '../i18n'
import type { CategoryMeta } from '../types/roadmap'

interface CategorySource {
  id: string
  title: string
  categories: CategoryMeta[]
}

interface PlanCategoryEditorProps {
  locale: Locale
  value: CategoryMeta[]
  sources: CategorySource[]
  onChange: (categories: CategoryMeta[]) => void
}

const tones: CategoryMeta['tone'][] = ['slate', 'blue', 'green', 'amber', 'rose']

function categoryKey(label: string) {
  return label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID()
}

export function PlanCategoryEditor({ locale, value, sources, onChange }: PlanCategoryEditorProps) {
  const [newLabel, setNewLabel] = useState('')
  const [sourceId, setSourceId] = useState('')
  const t = locale === 'es'
    ? { title: 'Categorías del plan', add: 'Agregar categoría', placeholder: 'Nombre de categoría', copy: 'Copiar de otro plan', choose: 'Selecciona un plan', remove: 'Eliminar categoría', color: 'Color' }
    : { title: 'Plan categories', add: 'Add category', placeholder: 'Category name', copy: 'Copy from another plan', choose: 'Choose a plan', remove: 'Delete category', color: 'Color' }

  function addCategory() {
    const label = newLabel.trim()
    if (!label) return
    const baseKey = categoryKey(label)
    let key = baseKey
    let suffix = 2
    while (value.some((category) => category.key === key)) key = `${baseKey}-${suffix++}`
    onChange([...value, { key, label, tone: 'slate', isDefault: value.length === 0 }])
    setNewLabel('')
  }

  function copyCategories() {
    const source = sources.find((plan) => plan.id === sourceId)
    if (!source) return
    const merged = new Map(value.map((category) => [category.key, category]))
    source.categories.forEach((category) => merged.set(category.key, { ...category }))
    onChange([...merged.values()])
  }

  return (
    <section className="plan-category-editor">
      <h3>{t.title}</h3>
      <div className="plan-category-list">
        {value.map((category, index) => (
          <div className="plan-category-row" key={category.key}>
            <button type="button" className={category.isDefault ? 'category-default-toggle is-active' : 'category-default-toggle'} aria-label={locale === 'es' ? 'Usar como categoría predeterminada' : 'Use as default category'} aria-pressed={Boolean(category.isDefault)} onClick={() => onChange(value.map((item, itemIndex) => ({ ...item, isDefault: itemIndex === index })))}>★</button>
            <input aria-label={t.placeholder} className="field-input" value={category.label} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
            <select aria-label={t.color} className="field-input" value={category.tone} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, tone: event.target.value as CategoryMeta['tone'] } : item))}>{tones.map((tone) => <option value={tone} key={tone}>{tone}</option>)}</select>
            <button type="button" className="btn btn-ghost" aria-label={t.remove} title={t.remove} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>
        ))}
      </div>
      <div className="plan-category-add">
        <input className="field-input" value={newLabel} placeholder={t.placeholder} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCategory() } }} />
        <button type="button" className="btn btn-secondary" onClick={addCategory}>{t.add}</button>
      </div>
      {sources.length ? <div className="plan-category-copy"><select className="field-input" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">{t.choose}</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select><button type="button" className="btn btn-ghost" disabled={!sourceId} onClick={copyCategories}>{t.copy}</button></div> : null}
    </section>
  )
}
