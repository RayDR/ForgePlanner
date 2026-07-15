import { getCategoryMeta } from '../data/northstarMockData'

export function CategoryPill({ category }: { category: string }) {
  const item = getCategoryMeta(category)
  return <span className={`badge badge-${item.tone}`}>{item.label}</span>
}
