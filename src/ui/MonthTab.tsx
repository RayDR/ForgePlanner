import { Button } from './Button'

interface MonthTabProps {
  label: string
  active: boolean
  highlighted?: boolean
  count?: number
  savings?: string
  empty?: boolean
  onClick: () => void
}

export function MonthTab({ label, active, highlighted = false, count, savings, empty = false, onClick }: MonthTabProps) {
  return (
    <Button variant={active ? 'active' : 'ghost'} className={`month-tab${highlighted ? ' month-tab-highlighted' : ''}${empty ? ' month-tab-empty' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <span className="month-tab-meta">{count ? <span className="month-tab-count">{count}</span> : null}{savings ? <span className="month-tab-savings">{savings}</span> : null}</span>
    </Button>
  )
}
