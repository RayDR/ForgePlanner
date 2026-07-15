import { useRef, useState } from 'react'
import { parseNonNegativeNumber } from '../utils/monthSelection'

interface InlineSavingsValueProps {
  value: number
  label: string
  onSave: (value: number) => void
}

export function InlineSavingsValue({ value, label, onSave }: InlineSavingsValueProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const cancelledRef = useRef(false)

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false
      return
    }
    const parsed = parseNonNegativeNumber(draft)
    if (parsed !== null) onSave(parsed)
    else setDraft(String(value))
    setEditing(false)
  }

  if (!editing) {
    return <button type="button" className="inline-savings-value" aria-label={label} onClick={(event) => { event.stopPropagation(); setDraft(String(value)); setEditing(true) }}>{value}</button>
  }

  return (
    <input
      autoFocus
      className="inline-savings-input"
      type="number"
      min="0"
      inputMode="decimal"
      aria-label={label}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          cancelledRef.current = true
          setDraft(String(value))
          setEditing(false)
        }
      }}
    />
  )
}
