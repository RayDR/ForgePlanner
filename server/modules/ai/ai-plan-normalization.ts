function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function monthIds(startDate: unknown, endDate: unknown) {
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return []
  const [startYear, startMonth] = startDate.split('-').map(Number)
  const [endYear, endMonth] = endDate.split('-').map(Number)
  const start = startYear * 12 + startMonth - 1
  const end = endYear * 12 + endMonth - 1
  if (end < start || end - start >= 1_200) return []
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const value = start + index
    return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`
  })
}

function distributeSavingsTarget(total: number, months: string[]) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / months.length)
  return months.map((monthId, index) => ({
    monthId,
    target: (index === months.length - 1 ? cents - base * (months.length - 1) : base) / 100,
    actual: 0,
  }))
}

/**
 * Normalizes only derived canonical fields whose authoritative inputs are
 * already present in the provider output. It does not invent planner data or
 * weaken canonical validation.
 */
export function normalizeAiPlanDerivedFields(value: unknown): unknown {
  const plan = record(value)
  const project = record(plan?.project)
  const savingsPlan = record(project?.savingsPlan)
  const monthlyEntries = savingsPlan?.monthlyEntries
  if (!plan || !project || !savingsPlan || !Array.isArray(monthlyEntries)) return value

  if (monthlyEntries.length === 0) {
    const targetTotal = savingsPlan.targetTotal
    const months = monthIds(project.startDate, project.endDate)
    if (savingsPlan.enabled === true && typeof targetTotal === 'number' && Number.isFinite(targetTotal) && targetTotal > 0 && months.length) {
      const generatedEntries = distributeSavingsTarget(targetTotal, months)
      return {
        ...plan,
        project: {
          ...project,
          savingsPlan: {
            ...savingsPlan,
            defaultMonthlyTarget: generatedEntries[0]?.target ?? 0,
            monthlyEntries: generatedEntries,
          },
        },
      }
    }
    if (savingsPlan.targetTotal !== 0) return {
      ...plan,
      project: { ...project, savingsPlan: { ...savingsPlan, targetTotal: 0 } },
    }
    return value
  }

  const targets = monthlyEntries.map((entry) => record(entry)?.target)
  if (targets.some((target) => typeof target !== 'number' || !Number.isFinite(target) || target < 0)) return value
  const targetTotal = (targets as number[]).reduce((total, target) => total + target, 0)
  if (savingsPlan.targetTotal === targetTotal) return value

  return {
    ...plan,
    project: {
      ...project,
      savingsPlan: { ...savingsPlan, targetTotal },
    },
  }
}
