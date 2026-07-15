import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { PlannerForm } from '../planner/PlannerForm'
import { Card } from '../ui/Card'
import { ActivityRow } from '../ui/ActivityRow'

export function PlannerView() {
  const activities = useRoadmapStore((state) => state.activities)
  const openActivity = useRoadmapStore((state) => state.openActivity)
  const locale = useRoadmapStore((state) => state.locale)

  const t =
    locale === 'es'
      ? { eyebrow: 'Actividades recientes', title: 'Ultimos registros' }
      : { eyebrow: 'Recent activities', title: 'Latest entries' }

  return (
    <div className="planner-layout">
      <PlannerForm />

      <Card>
        <p className="eyebrow">{t.eyebrow}</p>
        <h2>{t.title}</h2>
        <div className="stack-sm">
          {activities.slice(0, 8).map((activity) => (
            <ActivityRow key={activity.id} activity={activity} onOpen={openActivity} />
          ))}
        </div>
      </Card>
    </div>
  )
}
