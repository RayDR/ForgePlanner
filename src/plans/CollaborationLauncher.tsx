import { useMemo, useState } from 'react'
import { useForgePlannerStore } from '../hooks/useForgePlannerStore'
import { useSession } from '../auth/SessionProvider'
import { IconButton } from '../ui/IconButton'
import { UsersIcon } from '../ui/icons'
import type { ForgePlan } from '../types/forgePlanner'
import { PlanSharingDialog } from './PlanSharingDialog'
import { ModalPortal } from '../ui/Modal'

export function CollaborationLauncher() {
  const { locale } = useSession()
  const allPlans = useForgePlannerStore((state) => state.plans)
  const plans = useMemo(() => allPlans.filter((plan) => plan.remoteId && plan.remoteAccess === 'owner'), [allPlans])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ForgePlan | null>(null)
  const es = locale === 'es'
  if (selected) return <><IconButton label={es ? 'Colaboración' : 'Collaboration'} onClick={() => setOpen(true)}><UsersIcon width={19} height={19} /></IconButton><PlanSharingDialog plan={selected} locale={locale} onClose={() => setSelected(null)} /></>
  return <>
    <IconButton label={es ? 'Colaboración' : 'Collaboration'} onClick={() => setOpen(true)}><UsersIcon width={19} height={19} /></IconButton>
    {open ? <ModalPortal><div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="modal-shell collaboration-picker" role="dialog" aria-modal="true" aria-labelledby="collaboration-title">
        <header className="modal-header"><div><p className="eyebrow">NORTHSTAR PLANNER</p><h2 id="collaboration-title">{es ? 'Personas y planes' : 'People and plans'}</h2><small>{es ? 'Selecciona un plan para asignar personas y permisos.' : 'Choose a plan to assign people and permissions.'}</small></div><button className="btn btn-ghost" onClick={() => setOpen(false)} aria-label={es ? 'Cerrar' : 'Close'}>×</button></header>
        <div className="modal-body collaboration-plan-list">{plans.length ? plans.map((plan) => <button type="button" key={plan.id} onClick={() => { setOpen(false); setSelected(plan) }}><span className="collaboration-plan-icon"><UsersIcon width={20} /></span><span><strong>{plan.title}</strong><small>{plan.remoteSharingEnabled === false ? (es ? 'Privado' : 'Private') : (es ? 'Administrar acceso' : 'Manage access')}</small></span><b>›</b></button>) : <p>{es ? 'Primero importa o crea un plan en tu cuenta.' : 'Import or create a plan in your account first.'}</p>}</div>
      </section>
    </div></ModalPortal> : null}
  </>
}
