import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { categoryMeta } from '../data/northstarMockData'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import { Modal } from '../ui/Modal'
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockIcon,
  MoreVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from '../ui/icons'
import { getActivityMonthIds, getCalculatedActivityProgress } from '../utils/roadmapModel'
import type { ActivityColorKey } from '../types/roadmap'
import { RecurrenceSelect } from '../ui/RecurrenceSelect'
import { readActivityDraft, writeActivityDraft } from '../persistence/activityDraftStorage'

const COLOR_OPTIONS: ActivityColorKey[] = ['slate', 'blue', 'green', 'amber', 'rose']

export function ActivityModal() {
  const navigate = useNavigate()
  const { planId } = useParams()
  const activities = useRoadmapStore((state) => state.activities)
  const project = useRoadmapStore((state) => state.project)
  const locale = useRoadmapStore((state) => state.locale)
  const activeActivityId = useRoadmapStore((state) => state.activeActivityId)
  const selectedMonthId = useRoadmapStore((state) => state.selectedMonthId)
  const closeActivity = useRoadmapStore((state) => state.closeActivity)
  const updateActivity = useRoadmapStore((state) => state.updateActivity)
  const setActivityStatus = useRoadmapStore((state) => state.setActivityStatus)
  const addSubtask = useRoadmapStore((state) => state.addSubtask)
  const editSubtask = useRoadmapStore((state) => state.editSubtask)
  const toggleSubtask = useRoadmapStore((state) => state.toggleSubtask)
  const deleteSubtask = useRoadmapStore((state) => state.deleteSubtask)
  const updateSubtaskWeight = useRoadmapStore((state) => state.updateSubtaskWeight)
  const reorderSubtasks = useRoadmapStore((state) => state.reorderSubtasks)
  const addComment = useRoadmapStore((state) => state.addComment)
  const deleteComment = useRoadmapStore((state) => state.deleteComment)

  const activity = useMemo(
    () => activities.find((item) => item.id === activeActivityId) ?? null,
    [activities, activeActivityId],
  )

  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [commentAuthor, setCommentAuthor] = useState('')
  const [commentMessage, setCommentMessage] = useState('')
  const [activityTab, setActivityTab] = useState<'all' | 'comments' | 'history' | 'worklog'>('comments')
  const [visibleItems, setVisibleItems] = useState(3)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [linkedTaskQuery, setLinkedTaskQuery] = useState('')
  const [linkedSearchOpen, setLinkedSearchOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [draggedSubtaskId, setDraggedSubtaskId] = useState<string | null>(null)
  const [subtaskActionsId, setSubtaskActionsId] = useState<string | null>(null)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [draftActivityId, setDraftActivityId] = useState<string | null>(null)
  const subtaskDraftRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const draftPlanId = planId ?? project.id
    const savedDraft = activity?.id ? readActivityDraft(draftPlanId, activity.id) : null
    const parsedDraft = (() => {
      try { return savedDraft ? JSON.parse(savedDraft) as { subtask?: string; author?: string; comment?: string; linkedQuery?: string } : null } catch { return null }
    })()
    // Reset editor state when a different persisted activity is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubtaskDraft(parsedDraft?.subtask ?? '')
    setCommentAuthor(parsedDraft?.author ?? '')
    setCommentMessage(parsedDraft?.comment ?? '')
    setActivityTab('comments')
    setVisibleItems(3)
    setSettingsOpen(false)
    setLinkedTaskQuery(parsedDraft?.linkedQuery ?? '')
    setLinkedSearchOpen(false)
    setSidebarCollapsed(false)
    setDraggedSubtaskId(null)
    setSubtaskActionsId(null)
    setStatusMenuOpen(false)
    setDraftActivityId(activity?.id ?? null)
  }, [activity?.id, planId, project.id])

  useEffect(() => {
    if (!activity?.id || draftActivityId !== activity.id) return
    writeActivityDraft(planId ?? project.id, activity.id, JSON.stringify({ subtask: subtaskDraft, author: commentAuthor, comment: commentMessage, linkedQuery: linkedTaskQuery }))
  }, [activity?.id, draftActivityId, subtaskDraft, commentAuthor, commentMessage, linkedTaskQuery, planId, project.id])

  if (!activity) {
    return null
  }

  const currentActivity = activity
  const monthIds = getActivityMonthIds(activity)
  const activeMonthId = currentActivity.monthlyEntries[selectedMonthId] ? selectedMonthId : monthIds[0]
  const statuses = [...project.statusDefinitions].sort((left, right) => left.order - right.order)
  const plannedEndDate = project.plannedEndDate ?? project.endDate
  const actualEndDate = project.actualEndDate ?? project.endDate
  const projectIsExtended = actualEndDate > plannedEndDate
  const selectedPlannerMonth = activeMonthId ?? selectedMonthId
  const availableCategories = project.categoryDefinitions?.length ? project.categoryDefinitions : Object.values(categoryMeta)
  const categoryLabel = availableCategories.find((category) => category.key === currentActivity.category)?.label ?? currentActivity.category
  const totalWeight = activity.subtasks.reduce((sum, subtask) => sum + Math.max(1, subtask.weight ?? 1), 0)
  const completedWeight = activity.subtasks.reduce((sum, subtask) => sum + (subtask.completed ? Math.max(1, subtask.weight ?? 1) : 0), 0)
  const usesWeightedProgress = activity.progressMode === 'weighted'
  const calculatedProgress = getCalculatedActivityProgress(activity)
  const normalizedLinkedQuery = linkedTaskQuery.trim().toLocaleLowerCase()
  const linkedCandidates = normalizedLinkedQuery.length < 2 ? [] : activities
    .filter((item) => item.id !== activity.id && !activity.linkedActivityIds.includes(item.id))
    .filter((item) => `${item.title} ${item.description}`.toLocaleLowerCase().includes(normalizedLinkedQuery))
    .slice(0, 8)
  const linkedActivities = activity.linkedActivityIds.flatMap((id) => {
    const linked = activities.find((item) => item.id === id)
    return linked ? [linked] : []
  })
  const relationshipModeLabel = locale === 'es'
    ? ({ independent: 'Independiente', 'soft-linked': 'Vinculación flexible', 'locked-sequence': 'Secuencia bloqueada' }[activity.relationshipMode] ?? activity.relationshipMode)
    : ({ independent: 'Independent', 'soft-linked': 'Soft linked', 'locked-sequence': 'Locked sequence' }[activity.relationshipMode] ?? activity.relationshipMode)
  const worklog = activity.history.filter((entry) => entry.type === 'monthly-entry-updated' || entry.type === 'subtask-created' || entry.type === 'subtask-updated' || entry.type === 'subtask-completed')
  const allActivityItems = [
    ...activity.comments.map((comment) => ({ id: `comment-${comment.id}`, kind: 'comment' as const, occurredAt: comment.createdAt, title: comment.author, message: comment.message })),
    ...activity.history.map((entry) => ({ id: `history-${entry.id}`, kind: 'history' as const, occurredAt: entry.occurredAt, title: entry.type, message: entry.message })),
  ].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
  const t = locale === 'es' ? {
    settings: 'Configuración de tarea', category: 'Categoría', weighting: 'Usar ponderación de subtareas', color: 'Color', title: 'Título', description: 'Descripción', progress: 'Progreso calculado', completedTasks: 'Basado en tareas completadas', status: 'Estado', transition: 'Cambiar a', overview: 'Resumen', projectTiming: 'Fechas del proyecto', plannedEnd: 'Fin planeado', actualEnd: 'Fin real', completed: 'Completado', notCompleted: 'No completado', extended: 'El plan supera la fecha de fin planeada.', details: 'Detalles de actividad', startDate: 'Fecha de inicio', endDate: 'Fecha de fin', openEnded: 'Sin fecha de fin', hours: 'Horas estimadas', budget: 'Impacto presupuestario', savings: 'Impacto en ahorro', relationships: 'Relaciones', mode: 'Modo', dependencies: 'Dependencias', linked: 'Tareas vinculadas', sequence: 'Grupo de secuencia', parent: 'Objetivo principal', none: 'Ninguno', timeline: 'Cronología mensual', subtasks: 'Subtareas', duplicate: 'Duplicar', copy: 'Copiar texto', delete: 'Eliminar', addSubtask: 'Nombre de la subtarea', searchTasks: 'Buscar tareas existentes', noDescription: 'Sin descripción', noMatches: 'No hay coincidencias', remove: 'Quitar', activity: 'Actividad', all: 'Todo', comments: 'Comentarios', history: 'Historial', worklog: 'Registro de trabajo', author: 'Autor', message: 'Mensaje', addComment: 'Agregar comentario', readMore: 'Ver más', openPlanner: 'Abrir plan mensual', closeSidebar: 'Cerrar panel de tarea', openSidebar: 'Abrir panel de tarea', markComplete: 'Marcar subtarea como completada', markIncomplete: 'Marcar subtarea como pendiente', actions: 'Acciones de subtarea', milestone: 'hito', weighted: 'ponderado', setColor: 'Cambiar color', repeat: 'Repetir', noRepeat: 'No repetir', repeatUntil: 'Repetir hasta',
  } : {
    settings: 'Task settings', category: 'Category', weighting: 'Use subtask weighting', color: 'Color', title: 'Title', description: 'Description', progress: 'Calculated progress', completedTasks: 'Based on completed tasks', status: 'Status', transition: 'Transition to', overview: 'Overview', projectTiming: 'Project timing', plannedEnd: 'Planned end', actualEnd: 'Actual end', completed: 'Completed', notCompleted: 'Not completed', extended: 'Plan extended beyond the planned end date.', details: 'Activity details', startDate: 'Start date', endDate: 'End date', openEnded: 'Open ended', hours: 'Estimated hours', budget: 'Budget impact', savings: 'Savings impact', relationships: 'Relationships', mode: 'Mode', dependencies: 'Dependencies', linked: 'Linked tasks', sequence: 'Sequence group', parent: 'Parent goal', none: 'None', timeline: 'Monthly timeline', subtasks: 'Subtasks', duplicate: 'Duplicate', copy: 'Copy text', delete: 'Delete', addSubtask: 'Name this subtask', searchTasks: 'Search existing tasks', noDescription: 'No description', noMatches: 'No matching tasks', remove: 'Remove', activity: 'Activity', all: 'All', comments: 'Comments', history: 'History', worklog: 'Work log', author: 'Author', message: 'Message', addComment: 'Add comment', readMore: 'Read more', openPlanner: 'Open monthly planner', closeSidebar: 'Close task sidebar', openSidebar: 'Open task sidebar', markComplete: 'Mark subtask complete', markIncomplete: 'Mark subtask incomplete', actions: 'Subtask actions', milestone: 'milestone', weighted: 'weighted', setColor: 'Set color', repeat: 'Repeat', noRepeat: 'Do not repeat', repeatUntil: 'Repeat until',
  }

  function dropSubtask(targetId: string) {
    if (!draggedSubtaskId || draggedSubtaskId === targetId) return
    const ordered = [...currentActivity.subtasks]
    const currentIndex = ordered.findIndex((item) => item.id === draggedSubtaskId)
    const targetIndex = ordered.findIndex((item) => item.id === targetId)
    if (currentIndex < 0 || targetIndex < 0) return
    const [moved] = ordered.splice(currentIndex, 1)
    ordered.splice(targetIndex, 0, moved)
    reorderSubtasks(currentActivity.id, ordered.map((item) => item.id))
    setDraggedSubtaskId(null)
  }

  function handleAddSubtask() {
    if (!subtaskDraft.trim()) {
      subtaskDraftRef.current?.focus()
      return
    }

    addSubtask(currentActivity.id, subtaskDraft)
    setSubtaskDraft('')
    requestAnimationFrame(() => subtaskDraftRef.current?.focus())
  }

  function linkActivity(linkedActivityId: string) {
    updateActivity(currentActivity.id, { linkedActivityIds: [...currentActivity.linkedActivityIds, linkedActivityId] })
    setLinkedTaskQuery('')
    setLinkedSearchOpen(false)
  }

  function handleAddComment() {
    if (!commentMessage.trim()) {
      return
    }

    addComment(currentActivity.id, {
      author: commentAuthor.trim() || (locale === 'es' ? 'Tú' : 'You'),
      message: commentMessage,
    })
    setCommentMessage('')
  }

  function openMonthlyPlanner() {
    if (!planId) {
      return
    }

    closeActivity()
    navigate(`/plans/${planId}/monthly/${selectedPlannerMonth}`)
  }

  return (
    <Modal
      open={Boolean(activity)}
      title={activity.title}
      onClose={closeActivity}
      closeLabel="×"
      closeAriaLabel={locale === 'es' ? 'Cerrar modal' : 'Close modal'}
      headerActions={<>
        <button type="button" className="btn btn-ghost activity-header-action" onClick={openMonthlyPlanner} disabled={!planId} aria-label={t.openPlanner} title={t.openPlanner}><CalendarIcon width={18} height={18} /></button>
        <div className="activity-settings-wrap">
          <button type="button" className="btn btn-ghost activity-settings-trigger" aria-label={t.settings} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><MoreVerticalIcon width={18} height={18} /></button>
          {settingsOpen ? <div className="activity-settings-popover">
            <strong>{t.settings}</strong>
            <label className="field-wrap"><span>{t.category}</span><select className="field-input" value={activity.category} onChange={(event) => updateActivity(activity.id, { category: event.target.value })}>{availableCategories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label>
            <div className="form-grid form-grid-compact">
              <label className="field-wrap"><span>{t.startDate}</span><input className="field-input" type="date" value={activity.startDate} onChange={(event) => updateActivity(activity.id, { startDate: event.target.value })} /></label>
              <label className="field-wrap"><span>{t.endDate}</span><input className="field-input" type="date" min={activity.startDate} value={activity.endDate ?? activity.startDate} onChange={(event) => updateActivity(activity.id, { endDate: event.target.value })} /></label>
            </div>
            <label className="field-wrap"><span>{t.repeat}</span><RecurrenceSelect locale={locale} value={activity.recurrence?.frequency ?? 'none'} startDate={activity.startDate} maximumEndDate={project.endDate} onChange={(frequency) => updateActivity(activity.id, { recurrence: frequency === 'none' ? undefined : { frequency, endDate: activity.recurrence?.endDate ?? project.endDate } })} /></label>
            {activity.recurrence ? <label className="field-wrap"><span>{t.repeatUntil}</span><input className="field-input" type="date" min={activity.startDate} max={project.endDate} value={activity.recurrence.endDate} onChange={(event) => updateActivity(activity.id, { recurrence: { ...activity.recurrence!, endDate: event.target.value } })} /></label> : null}
            <label className="progress-mode-toggle"><input type="checkbox" checked={usesWeightedProgress} onChange={(event) => updateActivity(activity.id, { progressMode: event.target.checked ? 'weighted' : 'completion' })} /><span>{t.weighting}</span></label>
            <span className="settings-label">{t.color}</span>
            <div className="color-palette color-palette-compact">{COLOR_OPTIONS.map((colorKey) => <button key={colorKey} type="button" className={activity.colorKey === colorKey ? `color-dot color-dot-${colorKey} is-active` : `color-dot color-dot-${colorKey}`} onClick={() => updateActivity(activity.id, { colorKey })} aria-label={`${t.setColor}: ${colorKey}`} />)}</div>
          </div> : null}
        </div>
      </>}
    >
      <div className={`activity-modal activity-modal-${activity.colorKey}`}>
        <section className="activity-hero">
          <div className="activity-hero-top">
            <div className="activity-hero-meta">
              <span className={`activity-label activity-label-${activity.colorKey}`}>{categoryLabel}</span>
              {activity.milestone ? <span className="badge badge-amber">{t.milestone}</span> : null}
            </div>
          </div>

          <div className="activity-hero-grid">
            <label className="field-wrap">
              <span>{t.title}</span>
              <input
                className="field-input"
                value={activity.title}
                onChange={(event) => updateActivity(activity.id, { title: event.target.value })}
              />
            </label>
            <label className="field-wrap activity-hero-span-2">
              <span>{t.description}</span>
              <textarea
                className="field-input"
                value={activity.description}
                onChange={(event) => updateActivity(activity.id, { description: event.target.value })}
              />
            </label>
            <div className="activity-calculated-row activity-hero-span-2" aria-readonly="true">
              <span>{t.progress}</span>
              <strong>{calculatedProgress}%</strong>
              <small>{usesWeightedProgress && activity.subtasks.length ? `${completedWeight} / ${totalWeight} ${t.weighted}` : t.completedTasks}</small>
            </div>
          </div>
        </section>

        <section className="activity-panel-grid">
          <aside className={sidebarCollapsed ? 'activity-sidebar-stack is-collapsed' : 'activity-sidebar-stack'}>
          <button type="button" className="activity-sidebar-toggle" aria-label={sidebarCollapsed ? t.openSidebar : t.closeSidebar} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
            <ChevronRightIcon width={18} height={18} />
          </button>
          <div className="activity-status-control">
            <button type="button" className="status-transition-trigger" aria-expanded={statusMenuOpen} onClick={() => setStatusMenuOpen((open) => !open)}>{statuses.find((status) => status.id === activity.statusId)?.label ?? t.status}<ChevronDownIcon width={13} height={13} /></button>
            {statusMenuOpen ? <div className="status-transition-menu" role="menu">{statuses.filter((status) => status.id !== activity.statusId).map((status) => <button key={status.id} type="button" role="menuitem" onClick={() => { setActivityStatus(activity.id, status.id); setStatusMenuOpen(false) }}><span>{t.transition}</span><ChevronRightIcon width={13} height={13} /><strong className={`badge badge-${status.colorKey}`}>{status.label}</strong></button>)}</div> : null}
          </div>
          <div className="activity-sidebar-content">

          <details className="activity-panel activity-sidebar-details" open>
            <summary className="panel-header">
              <div>
                <p className="eyebrow">{t.overview}</p>
              </div>
              <ChevronDownIcon width={14} height={14} />
            </summary>
            <div className="activity-info-grid">
              <section className="overview-section"><h4>{t.projectTiming}</h4><dl><div><dt>{t.plannedEnd}</dt><dd>{plannedEndDate}</dd></div><div><dt>{t.actualEnd}</dt><dd>{actualEndDate}</dd></div><div><dt>{t.completed}</dt><dd>{project.completedAt ?? t.notCompleted}</dd></div></dl>{projectIsExtended ? <p className="activity-highlight">{t.extended}</p> : null}</section>
              <section className="overview-section"><h4>{t.details}</h4><dl><div><dt>{t.startDate}</dt><dd>{activity.startDate}</dd></div><div><dt>{t.endDate}</dt><dd>{activity.endDate ?? t.openEnded}</dd></div><div><dt>{t.hours}</dt><dd>{activity.estimatedHours ?? 0}</dd></div><div><dt>{t.budget}</dt><dd>{activity.budgetImpact ?? 0}</dd></div><div><dt>{t.savings}</dt><dd>{activity.savingsImpact ?? 0}</dd></div></dl></section>
              <section className="overview-section"><h4>{t.relationships}</h4><dl><div><dt>{t.mode}</dt><dd>{relationshipModeLabel}</dd></div><div><dt>{t.dependencies}</dt><dd>{activity.dependencyIds.length ? activity.dependencyIds.join(', ') : t.none}</dd></div><div><dt>{t.linked}</dt><dd>{linkedActivities.length ? linkedActivities.map((linked) => linked.title).join(', ') : t.none}</dd></div><div><dt>{t.sequence}</dt><dd>{activity.sequenceGroupId ?? t.none}</dd></div><div><dt>{t.parent}</dt><dd>{activity.parentGoalId ?? t.none}</dd></div></dl></section>
              <section className="overview-section"><h4>{t.timeline}</h4><dl>{monthIds.map((monthId) => { const entry = activity.monthlyEntries[monthId]; return <div key={monthId}><dt>{monthId}</dt><dd>{entry.status} · {calculatedProgress}%</dd></div> })}</dl></section>
            </div>
          </details>
          </div>
          </aside>
        </section>

        <section className="activity-panel-grid activity-panel-grid-wide">
          <article className="activity-panel activity-main-subtasks">
            <div className="panel-header">
              <div>
                <h3>{t.subtasks}</h3>
              </div>
            </div>

            <ul className="subtask-list">
              {activity.subtasks.map((subtask) => (
                <li key={subtask.id} className={draggedSubtaskId === subtask.id ? 'subtask-row is-dragging' : 'subtask-row'} draggable onDragStart={(event) => { setDraggedSubtaskId(subtask.id); event.dataTransfer.effectAllowed = 'move' }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => { event.preventDefault(); dropSubtask(subtask.id) }} onDragEnd={() => setDraggedSubtaskId(null)}>
                  <div className="subtask-row-main">
                    <button type="button" className={subtask.completed ? 'subtask-complete is-complete' : 'subtask-complete'} aria-label={subtask.completed ? t.markIncomplete : t.markComplete} aria-pressed={subtask.completed} onClick={() => toggleSubtask(activity.id, subtask.id, !subtask.completed)}>{subtask.completed ? '✓' : ''}</button>
                    <input
                      className="field-input field-input-inline"
                      value={subtask.title}
                      onChange={(event) => editSubtask(activity.id, subtask.id, event.target.value)}
                    />
                    {usesWeightedProgress ? (
                      <label className="subtask-points" title={t.weighting}>
                        <span>{locale === 'es' ? 'Peso' : 'Weight'}</span>
                        <input type="number" min={1} max={100} value={subtask.weight ?? 1} onChange={(event) => updateSubtaskWeight(activity.id, subtask.id, Number(event.target.value || 1))} />
                      </label>
                    ) : null}
                  </div>
                  <div className="subtask-actions-wrap">
                    <button className="btn btn-ghost subtask-actions-trigger" type="button" onClick={() => setSubtaskActionsId((id) => id === subtask.id ? null : subtask.id)} aria-label={t.actions} aria-expanded={subtaskActionsId === subtask.id}><MoreVerticalIcon width={16} height={16} /></button>
                    {subtaskActionsId === subtask.id ? <div className="subtask-actions-menu"><button type="button" onClick={() => { addSubtask(activity.id, `${subtask.title} ${locale === 'es' ? 'copia' : 'copy'}`); setSubtaskActionsId(null) }}>{t.duplicate}</button><button type="button" onClick={() => { void navigator.clipboard.writeText(subtask.title); setSubtaskActionsId(null) }}>{t.copy}</button><button type="button" className="is-danger" onClick={() => { deleteSubtask(activity.id, subtask.id); setSubtaskActionsId(null) }}><Trash2Icon width={13} height={13} /> {t.delete}</button></div> : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="activity-inline-form">
              <button type="button" className="btn btn-ghost" onClick={handleAddSubtask} aria-label={t.addSubtask}><PlusIcon width={16} height={16} /></button>
              <input ref={subtaskDraftRef} className="field-input field-input-inline" placeholder={t.addSubtask} value={subtaskDraft} onChange={(event) => setSubtaskDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleAddSubtask() }} />
            </div>
            <div className="activity-linked-work">
              <h3>{t.linked}</h3>
              {linkedActivities.map((linked) => <div className="linked-task-row" key={linked.id}><span>{linked.title}</span><button type="button" className="btn btn-ghost" onClick={() => updateActivity(activity.id, { linkedActivityIds: activity.linkedActivityIds.filter((id) => id !== linked.id) })}>{t.remove}</button></div>)}
              <div className="linked-task-search">
                <input className="field-input" type="search" value={linkedTaskQuery} placeholder={t.searchTasks} autoComplete="off" onFocus={() => setLinkedSearchOpen(true)} onChange={(event) => { setLinkedTaskQuery(event.target.value); setLinkedSearchOpen(true) }} onKeyDown={(event) => { if (event.key === 'Escape') setLinkedSearchOpen(false) }} />
                {linkedSearchOpen && normalizedLinkedQuery.length >= 2 ? <div className="linked-task-results">{linkedCandidates.length ? linkedCandidates.map((candidate) => <button key={candidate.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => linkActivity(candidate.id)}><strong>{candidate.title}</strong><small>{candidate.description || t.noDescription}</small></button>) : <p>{t.noMatches}</p>}</div> : null}
              </div>
            </div>
          </article>

          <article className="activity-panel activity-main-comments">
            <div className="panel-header">
              <h3>{t.activity}</h3>
              <LockIcon width={14} height={14} />
            </div>
            <div className="activity-tabs" role="tablist">
              {(['all', 'comments', 'history', 'worklog'] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={activityTab === tab} className={activityTab === tab ? 'is-active' : ''} onClick={() => { setActivityTab(tab); setVisibleItems(3) }}>
                  {t[tab]}
                </button>
              ))}
            </div>
            {activityTab === 'comments' ? <>
            <div className="form-grid form-grid-compact activity-comment-form">
              <label className="field-wrap">
                <span>{t.author}</span>
                <input className="field-input" value={commentAuthor} onChange={(event) => setCommentAuthor(event.target.value)} />
              </label>
              <label className="field-wrap activity-comment-message">
                <span>{t.message}</span>
                <input className="field-input" value={commentMessage} onChange={(event) => setCommentMessage(event.target.value)} />
              </label>
              <div className="field-wrap activity-comment-submit">
                <span>&nbsp;</span>
                <button className="btn btn-secondary" type="button" onClick={handleAddComment}>
                  <PlusIcon width={14} height={14} />
                  <span>{t.addComment}</span>
                </button>
              </div>
            </div>

            <ul className="comment-list">
              {activity.comments.slice(0, visibleItems).map((comment) => (
                <li key={comment.id} className="comment-row">
                  <div>
                    <strong>{comment.author}</strong>
                    <p>{comment.message}</p>
                    <small>{new Date(comment.createdAt).toLocaleString()}</small>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => deleteComment(activity.id, comment.id)} aria-label={t.delete}>
                    <Trash2Icon width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
            </> : null}
            {activityTab === 'all' ? (
              <ul className="history-list activity-all-feed">
                {allActivityItems.slice(0, visibleItems).map((item) => (
                  <li key={item.id} className="history-row">
                    <span className={`badge badge-${item.kind === 'comment' ? 'blue' : activity.colorKey}`}>{item.kind === 'comment' ? t.comments : item.title}</span>
                    <div><p>{item.kind === 'comment' ? <><strong>{item.title}: </strong>{item.message}</> : item.message}</p><small>{new Date(item.occurredAt).toLocaleString()}</small></div>
                  </li>
                ))}
              </ul>
            ) : null}
            {activityTab === 'history' || activityTab === 'worklog' ? (
              <ul className="history-list">
                {(activityTab === 'worklog' ? worklog : activity.history).slice(0, visibleItems).map((entry) => (
                  <li key={entry.id} className="history-row">
                    <span className={`badge badge-${activity.colorKey}`}>{entry.type}</span>
                    <div><p>{entry.message}</p><small>{new Date(entry.occurredAt).toLocaleString()}</small></div>
                    {entry.monthId ? <span className="badge badge-slate">{entry.monthId}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {(activityTab === 'comments' && activity.comments.length > visibleItems) || (activityTab === 'all' && allActivityItems.length > visibleItems) || (activityTab === 'history' && activity.history.length > visibleItems) || (activityTab === 'worklog' && worklog.length > visibleItems) ? (
              <button type="button" className="btn btn-ghost activity-read-more" onClick={() => setVisibleItems((count) => count + 3)}>{t.readMore}</button>
            ) : null}
          </article>
        </section>
      </div>
    </Modal>
  )
}
