import type { ActivityColorKey } from '../types/roadmap'
import { nearestSemanticColor, normalizeCustomColor, paintColorPresets, semanticColorHex } from './customColor'

interface ColorPickerProps {
  value?: string
  fallback: ActivityColorKey
  label: string
  onChange: (value: { colorHex: string; colorKey: ActivityColorKey }) => void
}

export function ColorPicker({ value, fallback, label, onChange }: ColorPickerProps) {
  const selected = normalizeCustomColor(value) ?? semanticColorHex[fallback]

  function select(colorHex: string) {
    const normalized = normalizeCustomColor(colorHex)
    if (!normalized) return
    onChange({ colorHex: normalized, colorKey: nearestSemanticColor(normalized) })
  }

  return (
    <div className="paint-color-picker">
      <label className="paint-color-custom">
        <span>{label}</span>
        <input type="color" value={selected} aria-label={label} onChange={(event) => select(event.target.value)} />
        <output>{selected.toUpperCase()}</output>
      </label>
      <div className="paint-color-presets" aria-label={label}>
        {paintColorPresets.map((colorHex, index) => (
          <button
            key={colorHex}
            type="button"
            className={`paint-color-swatch paint-color-swatch-${index + 1}${selected === colorHex ? ' is-active' : ''}`}
            aria-label={`${label}: ${colorHex}`}
            aria-pressed={selected === colorHex}
            onClick={() => select(colorHex)}
          />
        ))}
      </div>
    </div>
  )
}
