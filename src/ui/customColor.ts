import type { ActivityColorKey } from '../types/roadmap'

const COLOR_HEX_PATTERN = /^#[0-9a-f]{6}$/i

export const semanticColorHex: Record<ActivityColorKey, string> = {
  slate: '#64748b',
  blue: '#2563eb',
  green: '#16a34a',
  amber: '#d97706',
  rose: '#e11d48',
}

export const paintColorPresets = [
  '#475569', '#64748b', '#0f766e', '#16a34a', '#65a30d', '#ca8a04',
  '#d97706', '#dc2626', '#e11d48', '#db2777', '#9333ea', '#7c3aed',
  '#4f46e5', '#2563eb', '#0284c7', '#0891b2', '#0d9488', '#059669',
] as const

export function normalizeCustomColor(value: string | undefined) {
  return value && COLOR_HEX_PATTERN.test(value) ? value.toLowerCase() : undefined
}

function hexChannels(value: string) {
  const normalized = normalizeCustomColor(value) ?? semanticColorHex.slate
  return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16))
}

export function nearestSemanticColor(value: string): ActivityColorKey {
  const [red, green, blue] = hexChannels(value)
  return (Object.entries(semanticColorHex) as Array<[ActivityColorKey, string]>).reduce(
    (closest, [colorKey, hex]) => {
      const [candidateRed, candidateGreen, candidateBlue] = hexChannels(hex)
      const distance = (red - candidateRed) ** 2 + (green - candidateGreen) ** 2 + (blue - candidateBlue) ** 2
      return distance < closest.distance ? { colorKey, distance } : closest
    },
    { colorKey: 'slate' as ActivityColorKey, distance: Number.POSITIVE_INFINITY },
  ).colorKey
}

const registeredClasses = new Set<string>()

/**
 * Registers a sanitized CSS custom-property class for a persisted user color.
 * This keeps arbitrary color values out of React inline styles and prevents
 * untrusted strings from becoming CSS rules.
 */
export function customColorClass(value: string | undefined) {
  const color = normalizeCustomColor(value)
  if (!color) return ''

  const className = `custom-color-${color.slice(1)}`
  if (typeof document !== 'undefined' && !registeredClasses.has(className)) {
    let styleElement = document.querySelector<HTMLStyleElement>('#planner-custom-colors')
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = 'planner-custom-colors'
      styleElement.dataset.generated = 'true'
      document.head.append(styleElement)
    }
    styleElement.sheet?.insertRule(`.${className}{--custom-color:${color};--activity-accent:${color};--task-color:${color};--filter-accent:${color}}`)
    registeredClasses.add(className)
  }
  return `has-custom-color ${className}`
}
