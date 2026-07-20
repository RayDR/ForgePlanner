import type { CanonicalPlan } from './plan.types.js'

/** PostgreSQL relational columns are searchable mirrors derived only from the canonical snapshot. */
export function derivePlanRelationalMetadata(snapshot: CanonicalPlan) {
  return {
    name: snapshot.project.name,
    objective: snapshot.project.objective,
    startDate: snapshot.project.startDate,
    endDate: snapshot.project.endDate,
  }
}
