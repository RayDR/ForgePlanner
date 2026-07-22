import type { CategoryMeta } from '../types/roadmap'
import { customColorClass } from './customColor'

interface CategoryFilterBaseProps {
  categories: CategoryMeta[]
  locale: 'es' | 'en'
}

interface SingleCategoryFilterProps extends CategoryFilterBaseProps {
  multiple?: false
  value: string
  onChange: (value: string) => void
}

interface MultipleCategoryFilterProps extends CategoryFilterBaseProps {
  multiple: true
  values: string[]
  onChange: (values: string[]) => void
}

type CategoryFilterProps = SingleCategoryFilterProps | MultipleCategoryFilterProps

export function CategoryFilter(props: CategoryFilterProps) {
  const { categories, locale } = props
  const label = locale === 'es' ? 'Filtrar por categoría' : 'Filter by category'
  const selectedKeys = props.multiple ? props.values : props.value ? [props.value] : []
  const selectedCategories = selectedKeys.map((key) => categories.find((category) => category.key === key)).filter((category): category is CategoryMeta => Boolean(category))
  const availableCategories = props.multiple ? categories.filter((category) => !selectedKeys.includes(category.key)) : categories

  function selectCategory(value: string) {
    if (!value) {
      if (!props.multiple) props.onChange('')
      return
    }
    if (props.multiple) props.onChange([...props.values, value])
    else props.onChange(value)
  }

  function removeCategory(key: string) {
    if (props.multiple) props.onChange(props.values.filter((value) => value !== key))
    else props.onChange('')
  }

  function resetFilters() {
    if (props.multiple) props.onChange([])
    else props.onChange('')
  }

  return (
    <div className={`category-filter${props.multiple ? ' category-filter--multiple' : ''}`}>
      <div className="category-filter-controls">
        <label>
          <span>{label}</span>
          <select value={props.multiple ? '' : props.value} onChange={(event) => selectCategory(event.target.value)} aria-label={label}>
            <option value="">{props.multiple ? (locale === 'es' ? 'Agregar categoría' : 'Add category') : (locale === 'es' ? 'Todas las categorías' : 'All categories')}</option>
            {availableCategories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
          </select>
        </label>
        {!props.multiple && selectedKeys.length ? <button type="button" onClick={resetFilters} aria-label={locale === 'es' ? 'Quitar filtro' : 'Clear filter'} title={locale === 'es' ? 'Quitar filtro' : 'Clear filter'}>×</button> : null}
      </div>
      {props.multiple && selectedCategories.length ? (
        <div className="category-filter-tags" aria-label={locale === 'es' ? 'Categorías seleccionadas' : 'Selected categories'}>
          {selectedCategories.map((category) => (
            <span key={category.key} className={`category-filter-tag category-filter-tag-${category.tone} ${customColorClass(category.colorHex)}`}>
              <span>{category.label}</span>
              <button type="button" onClick={() => removeCategory(category.key)} aria-label={locale === 'es' ? `Quitar ${category.label}` : `Remove ${category.label}`}>×</button>
            </span>
          ))}
          <button type="button" className="category-filter-reset" onClick={resetFilters}>{locale === 'es' ? 'Restablecer filtros' : 'Reset filters'}</button>
        </div>
      ) : null}
    </div>
  )
}
