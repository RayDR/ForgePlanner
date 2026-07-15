import { monthlyStatusMeta } from '../utils/roadmapModel'
import type { MonthlyActivityStatus } from '../types/roadmap'

const toneByStatus: Record<MonthlyActivityStatus, 'slate' | 'blue' | 'green' | 'amber' | 'rose'> = {
  planned: 'slate',
  'in-progress': 'blue',
  continued: 'blue',
  paused: 'amber',
  skipped: 'amber',
  resumed: 'green',
  completed: 'green',
  cancelled: 'rose',
}

export function StatusPill({ status }: { status: MonthlyActivityStatus }) {
  return <span className={`badge badge-${toneByStatus[status]}`}>{monthlyStatusMeta[status]}</span>
}
