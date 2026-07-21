interface ProgressBarProps {
  value: number
  tone?: 'blue' | 'green' | 'amber'
}

const toneClasses = {
  blue: 'progress-track-blue',
  green: 'progress-track-green',
  amber: 'progress-track-amber',
}

export function ProgressBar({ value, tone = 'blue' }: ProgressBarProps) {
  const locale = useRoadmapStore((state) => state.locale)
  const safeValue = Math.max(0, Math.min(100, value))

  return (
    <progress className={`progress-track ${toneClasses[tone]}`} max={100} value={safeValue} aria-label={locale === 'es' ? 'Progreso' : 'Progress'} />
  )
}
import { useRoadmapStore } from '../hooks/useRoadmapStore'
