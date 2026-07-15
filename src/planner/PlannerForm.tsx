import { useState } from 'react'
import { categoryMeta } from '../data/northstarMockData'
import { useRoadmapStore } from '../hooks/useRoadmapStore'
import type { ActivityDraft, ActivityPriority, CategoryKey, MonthlyActivityStatus, RelationshipMode } from '../types/roadmap'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const initialDraft: ActivityDraft = {
  title: '',
  category: 'career',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  firstMonthId: '2026-08',
  description: '',
  subtasks: [],
  initialStatus: 'planned',
  priority: 'medium',
  relationshipMode: 'independent',
  notes: '',
  dependencyIds: [],
  linkedActivityIds: [],
  milestone: false,
}

export function PlannerForm() {
  const createActivity = useRoadmapStore((state) => state.createActivity)
  const activities = useRoadmapStore((state) => state.activities)
  const goals = useRoadmapStore((state) => state.project.goals)
  const [draft, setDraft] = useState<ActivityDraft>(initialDraft)
  const [subtasksText, setSubtasksText] = useState('')
  const [dependencyText, setDependencyText] = useState('')
  const [linkedText, setLinkedText] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!draft.title.trim()) {
      return
    }

    createActivity({
      ...draft,
      title: draft.title.trim(),
      dependencyIds: dependencyText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      linkedActivityIds: linkedText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      subtasks: subtasksText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    })

    setDraft(initialDraft)
    setSubtasksText('')
    setDependencyText('')
    setLinkedText('')
  }

  return (
    <Card>
      <form className="planner-form" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Planner data entry</p>
          <h2>Create global activity</h2>
          <p className="section-copy">Create the activity once, then seed its first monthly planning entry.</p>
        </div>

        <div className="form-grid">
          <Field label="Title">
            <input className="field-input" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </Field>
          <Field label="Category">
            <select className="field-input" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as CategoryKey }))}>
              {Object.values(categoryMeta).map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" className="field-input" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
          </Field>
          <Field label="End date">
            <input type="date" className="field-input" value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
          </Field>
          <Field label="First month entry (YYYY-MM)">
            <input className="field-input" value={draft.firstMonthId} onChange={(event) => setDraft((current) => ({ ...current, firstMonthId: event.target.value }))} placeholder="2027-03" />
          </Field>
          <Field label="Initial monthly status">
            <select className="field-input" value={draft.initialStatus} onChange={(event) => setDraft((current) => ({ ...current, initialStatus: event.target.value as MonthlyActivityStatus }))}>
              {['planned', 'in-progress', 'continued', 'paused', 'skipped', 'resumed', 'completed', 'cancelled'].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="field-input" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as ActivityPriority }))}>
              {['low', 'medium', 'high', 'critical'].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Relationship mode">
            <select className="field-input" value={draft.relationshipMode} onChange={(event) => setDraft((current) => ({ ...current, relationshipMode: event.target.value as RelationshipMode }))}>
              {['independent', 'soft-linked', 'locked-sequence'].map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estimated hours">
            <input type="number" className="field-input" value={draft.estimatedHours ?? ''} onChange={(event) => setDraft((current) => ({ ...current, estimatedHours: event.target.value ? Number(event.target.value) : undefined }))} />
          </Field>
          <Field label="Budget impact">
            <input type="number" className="field-input" value={draft.budgetImpact ?? ''} onChange={(event) => setDraft((current) => ({ ...current, budgetImpact: event.target.value ? Number(event.target.value) : undefined }))} />
          </Field>
          <Field label="Savings impact">
            <input type="number" className="field-input" value={draft.savingsImpact ?? ''} onChange={(event) => setDraft((current) => ({ ...current, savingsImpact: event.target.value ? Number(event.target.value) : undefined }))} />
          </Field>
          <Field label="Milestone">
            <select className="field-input" value={String(draft.milestone)} onChange={(event) => setDraft((current) => ({ ...current, milestone: event.target.value === 'true' }))}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
        </div>

        <div className="form-grid">
          <Field label="Description">
            <textarea className="field-input" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
          </Field>
          <Field label="Notes">
            <textarea className="field-input" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
          </Field>
          <Field label="Dependencies (comma-separated activity IDs)">
            <input className="field-input" value={dependencyText} onChange={(event) => setDependencyText(event.target.value)} placeholder="a3,a5" />
          </Field>
          <Field label="Linked activities (comma-separated IDs)">
            <input className="field-input" value={linkedText} onChange={(event) => setLinkedText(event.target.value)} placeholder="a2,a4" />
          </Field>
          <Field label="Subtasks (one per line)">
            <textarea className="field-input" value={subtasksText} onChange={(event) => setSubtasksText(event.target.value)} />
          </Field>
          <Field label="Parent goal">
            <select className="field-input" value={draft.parentGoalId ?? ''} onChange={(event) => setDraft((current) => ({ ...current, parentGoalId: event.target.value || undefined }))}>
              <option value="">None</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="row-between">
          <small>{activities.length} existing activities</small>
          <Button type="submit" variant="primary">
            Add activity
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field-wrap">
      <span>{label}</span>
      {children}
    </label>
  )
}