import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useRoadmapStore } from './useRoadmapStore'
import type {
  DeletedPlanRecord,
  ForgePlan,
  ForgePlannerState,
  MonthlyViewPreference,
  PlanTemplateKey,
  PlanningMode,
} from '../types/forgePlanner'
import type { PersistedRoadmapState } from '../utils/roadmapState'
import type { Activity, CategoryMeta } from '../types/roadmap'
import { DEFAULT_PROJECT_STATUSES } from '../utils/roadmapState'
import { getClosestActiveMonth } from '../utils/dateUtils'

const STORE_VERSION = 1

interface ForgePlannerStore extends ForgePlannerState {
  ensureInitialized: () => void
  openPlan: (planId: string) => void
  createPlan: (draft: {
    title: string
    description: string
    startDate: string
    endDate: string
    planningMode: PlanningMode
    templateKey?: PlanTemplateKey
    savingsEnabled?: boolean
    savingsMode?: 'free' | 'monthly-target'
    defaultMonthlyTarget?: number
    categoryDefinitions?: CategoryMeta[]
  }) => string
  quickEditPlan: (planId: string, updates: { title?: string; description?: string; startDate?: string; endDate?: string; planningMode?: PlanningMode; templateKey?: PlanTemplateKey; savingsEnabled?: boolean; savingsMode?: 'free' | 'monthly-target'; defaultMonthlyTarget?: number; categoryDefinitions?: CategoryMeta[] }) => void
  duplicatePlan: (planId: string) => void
  hidePlan: (planId: string) => void
  unhidePlan: (planId: string) => void
  archivePlan: (planId: string) => void
  unarchivePlan: (planId: string) => void
  deletePlan: (planId: string) => void
  restoreDeletedPlan: (deletedId: string) => void
  permanentlyDeletePlan: (deletedId: string) => void
  clearDeletedPlans: () => void
  purgeExpiredDeletedPlans: () => void
  setMonthlyViewPreference: (planId: string, preference: MonthlyViewPreference) => void
  getPlanById: (planId: string) => ForgePlan | undefined
  syncActivePlanFromRoadmap: () => void
  linkRemotePlans: (links: Array<{ importKey: string; remoteId: string; remoteRevision: number }>) => void
  mergeRemotePlans: (plans: ForgePlan[]) => void
  replaceRemotePlan: (plan: ForgePlan) => void
  markPlanSynced: (planId: string, remoteRevision: number) => void
  setRemoteSharingEnabled: (planId: string, enabled: boolean) => void
}

function deriveCategories(snapshot: PersistedRoadmapState) {
  if (snapshot.project.categoryDefinitions?.length) return snapshot.project.categoryDefinitions.map((category) => category.key)
  const categories = new Set<string>()
  for (const activity of snapshot.activities) {
    categories.add(activity.category)
  }
  for (const goal of snapshot.project.goals) {
    categories.add(goal.category)
  }
  return Array.from(categories)
}

function buildNorthStarPlan(snapshot: PersistedRoadmapState): ForgePlan {
  const now = new Date().toISOString()
  return {
    id: snapshot.project.id || crypto.randomUUID(),
    title: snapshot.project.name || 'Project NorthStar',
    description: snapshot.project.objective || 'Primary roadmap',
    startDate: snapshot.project.startDate,
    endDate: snapshot.project.endDate,
    planningMode: 'auto',
    templateKey: 'career-roadmap',
    categories: deriveCategories(snapshot),
    monthlyViewPreference: 'list',
    snapshot,
    createdAt: now,
    updatedAt: now,
  }
}

function createPlanSnapshot(draft: {
  title: string
  description: string
  startDate: string
  endDate: string
  locale: 'en' | 'es'
  theme: 'light' | 'dark'
  savingsEnabled?: boolean
  savingsMode?: 'free' | 'monthly-target'
  defaultMonthlyTarget?: number
  categoryDefinitions?: CategoryMeta[]
}): PersistedRoadmapState {
  const year = Number(draft.startDate.slice(0, 4))
  const id = crypto.randomUUID()
  const selectedMonthId = getClosestActiveMonth(year, draft.startDate, draft.endDate)

  return {
    schemaVersion: 7,
    project: {
      id,
      name: draft.title,
      objective: draft.description,
      startDate: draft.startDate,
      plannedStartDate: draft.startDate,
      endDate: draft.endDate,
      plannedEndDate: draft.endDate,
      actualEndDate: draft.endDate,
      selectedYear: year,
      goals: [],
      milestones: [],
      statusDefinitions: DEFAULT_PROJECT_STATUSES,
      categoryDefinitions: draft.categoryDefinitions ?? [
        { key: 'general', label: 'General', tone: 'slate', isDefault: true },
        { key: 'personal', label: draft.locale === 'es' ? 'Personal' : 'Personal', tone: 'blue' },
        { key: 'work', label: draft.locale === 'es' ? 'Trabajo' : 'Work', tone: 'green' },
      ],
      savingsPlan: {
        currency: 'USD',
        enabled: draft.savingsEnabled ?? false,
        mode: draft.savingsMode ?? 'free',
        defaultMonthlyTarget: draft.defaultMonthlyTarget ?? 0,
        targetTotal: 0,
        monthlyEntries: [],
      },
    },
    activities: [],
    trash: [],
    relationships: [],
    selectedYear: year,
    selectedMonthId,
    locale: draft.locale,
    theme: draft.theme,
  }
}

function nextDeletedExpiry() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
}

function withUpdatedPlan(plans: ForgePlan[], planId: string, updater: (plan: ForgePlan) => ForgePlan) {
  return plans.map((plan) => (plan.id === planId ? updater(plan) : plan))
}

function buildMonthlyDemoPlan(locale: 'en' | 'es', theme: 'light' | 'dark'): ForgePlan {  const snapshot = createPlanSnapshot({ title: 'Plan trimestral demo', description: 'Ejemplo mensual con objetivos y tareas fechadas.', startDate: '2026-09-01', endDate: '2026-11-30', locale, theme }); const demoId = 'demo-three-month-plan'; snapshot.project.id = demoId; const makeActivity = (id: string, title: string, startDate: string, endDate: string, monthId: string): Activity => ({    id, title, description: 'Actividad demo', category: 'career', priority: 'medium', relationshipMode: 'independent', startDate, endDate, linkedActivityIds: [], dependencyIds: [], milestone: false, colorKey: 'blue', statusId: 'planned', notes: '', subtasks: [], comments: [], history: [], monthlyEntries: { [monthId]: { monthId, status: 'planned', progress: 0 } },  }); snapshot.activities = [    makeActivity('demo-month-objective', 'Objetivo de lanzamiento', '2026-09-01', '2026-09-30', '2026-09'),    makeActivity('demo-design-sprint', 'Sprint de diseño', '2026-10-05', '2026-10-16', '2026-10'),    makeActivity('demo-release', 'Preparar lanzamiento', '2026-11-09', '2026-11-20', '2026-11'),  ]; const now = new Date().toISOString(); return { id: demoId, title: snapshot.project.name, description: snapshot.project.objective, startDate: snapshot.project.startDate, endDate: snapshot.project.endDate, planningMode: 'monthly', templateKey: 'blank', categories: ['career'], monthlyViewPreference: 'list', snapshot, createdAt: now, updatedAt: now }}
export const useForgePlannerStore = create<ForgePlannerStore>()(
  persist(
    (set, get) => ({
      schemaVersion: STORE_VERSION,
      activePlanId: undefined,
      plans: [],
      archivedPlanIds: [],
      hiddenPlanIds: [],
      deletedPlans: [],
      ensureInitialized: () => {
        const state = get()
        const demoExists = state.plans.some((plan) => plan.id === 'demo-three-month-plan') || state.deletedPlans.some((item) => item.plan.id === 'demo-three-month-plan')
        const roadmap = useRoadmapStore.getState()
        const demoPlan = demoExists ? undefined : buildMonthlyDemoPlan(roadmap.locale, roadmap.theme)
        if (state.plans.length || state.deletedPlans.length) {
          if (demoPlan) set({ plans: [...state.plans, demoPlan] })
          return
        }

        const snapshot = useRoadmapStore.getState().exportSnapshot()
        const northStarPlan = buildNorthStarPlan(snapshot)
        set({
          plans: demoPlan ? [northStarPlan, demoPlan] : [northStarPlan],
          activePlanId: northStarPlan.id,
        })
      },
      openPlan: (planId) => {
        const plan = get().plans.find((item) => item.id === planId)
        if (!plan) {
          return
        }

        useRoadmapStore.getState().loadSnapshot(plan.snapshot)
        set({ activePlanId: planId })
      },
      createPlan: (draft) => {
        const roadmap = useRoadmapStore.getState()
        const snapshot = createPlanSnapshot({
          title: draft.title,
          description: draft.description,
          startDate: draft.startDate,
          endDate: draft.endDate,
          locale: roadmap.locale,
          theme: roadmap.theme,
          savingsEnabled: draft.savingsEnabled,
          savingsMode: draft.savingsMode,
          defaultMonthlyTarget: draft.defaultMonthlyTarget,
          categoryDefinitions: draft.categoryDefinitions,
        })
        const now = new Date().toISOString()
        const plan: ForgePlan = {
          id: snapshot.project.id,
          title: draft.title,
          description: draft.description,
          startDate: draft.startDate,
          endDate: draft.endDate,
          planningMode: draft.planningMode,
          templateKey: draft.templateKey,
          categories: snapshot.project.categoryDefinitions?.map((category) => category.key) ?? [],
          monthlyViewPreference: 'list',
          snapshot,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          plans: [plan, ...state.plans],
          activePlanId: plan.id,
          archivedPlanIds: state.archivedPlanIds.filter((id) => id !== plan.id),
          hiddenPlanIds: state.hiddenPlanIds.filter((id) => id !== plan.id),
        }))

        useRoadmapStore.getState().loadSnapshot(snapshot)
        return plan.id
      },
      quickEditPlan: (planId, updates) => {
        const now = new Date().toISOString()
        set((state) => ({
          plans: withUpdatedPlan(state.plans, planId, (plan) => {
            const startDate = updates.startDate ?? plan.startDate
            const endDate = updates.endDate ?? plan.endDate
            const selectedYear = Number(startDate.slice(0, 4))
            const selectedMonthId = getClosestActiveMonth(selectedYear, startDate, endDate)
            const snapshot: PersistedRoadmapState = {
              ...plan.snapshot,
              selectedYear,
              selectedMonthId,
              project: {
                ...plan.snapshot.project,
                name: updates.title ?? plan.title,
                objective: updates.description ?? plan.description,
                startDate,
                plannedStartDate: updates.startDate ?? plan.snapshot.project.plannedStartDate ?? plan.snapshot.project.startDate,
                endDate,
                plannedEndDate: plan.snapshot.project.plannedEndDate ?? plan.snapshot.project.endDate,
                actualEndDate: endDate,
                selectedYear,
                savingsPlan: {
                  ...plan.snapshot.project.savingsPlan,
                  enabled: updates.savingsEnabled ?? plan.snapshot.project.savingsPlan.enabled ?? false,
                  mode: updates.savingsMode ?? plan.snapshot.project.savingsPlan.mode ?? 'free',
                  defaultMonthlyTarget: Math.max(0, updates.defaultMonthlyTarget ?? plan.snapshot.project.savingsPlan.defaultMonthlyTarget ?? 0),
                },
                categoryDefinitions: updates.categoryDefinitions ?? plan.snapshot.project.categoryDefinitions,
              },
            }

            return {
              ...plan,
              title: updates.title ?? plan.title,
              description: updates.description ?? plan.description,
              startDate,
              endDate,
              planningMode: updates.planningMode ?? plan.planningMode,
              templateKey: updates.templateKey ?? plan.templateKey,
              categories: (updates.categoryDefinitions ?? plan.snapshot.project.categoryDefinitions)?.map((category) => category.key) ?? plan.categories,
              snapshot,
              updatedAt: now,
            }
          }),
        }))

        const state = get()
        if (state.activePlanId === planId) {
          const active = state.plans.find((plan) => plan.id === planId)
          if (active) {
            useRoadmapStore.getState().loadSnapshot(active.snapshot)
          }
        }
      },
      duplicatePlan: (planId) => {
        const source = get().plans.find((item) => item.id === planId)
        if (!source) {
          return
        }

        const now = new Date().toISOString()
        const copyId = crypto.randomUUID()
        const copy: ForgePlan = {
          ...source,
          id: copyId,
          title: `${source.title} Copy`,
          createdAt: now,
          updatedAt: now,
          snapshot: {
            ...source.snapshot,
            project: {
              ...source.snapshot.project,
              id: copyId,
              name: `${source.title} Copy`,
              plannedEndDate: source.snapshot.project.plannedEndDate,
              actualEndDate: source.snapshot.project.actualEndDate,
            },
          },
        }

        set((state) => ({ plans: [copy, ...state.plans] }))
      },
      hidePlan: (planId) => {
        set((state) => ({ hiddenPlanIds: Array.from(new Set([...state.hiddenPlanIds, planId])) }))
      },
      unhidePlan: (planId) => {
        set((state) => ({ hiddenPlanIds: state.hiddenPlanIds.filter((id) => id !== planId) }))
      },
      archivePlan: (planId) => {
        set((state) => ({ archivedPlanIds: Array.from(new Set([...state.archivedPlanIds, planId])) }))
      },
      unarchivePlan: (planId) => {
        set((state) => ({ archivedPlanIds: state.archivedPlanIds.filter((id) => id !== planId) }))
      },
      deletePlan: (planId) => {
        set((state) => {
          const plan = state.plans.find((item) => item.id === planId)
          if (!plan) {
            return state
          }

          const deletedRecord: DeletedPlanRecord = {
            id: crypto.randomUUID(),
            plan,
            deletedAt: new Date().toISOString(),
            expiresAt: nextDeletedExpiry(),
          }

          const remainingPlans = state.plans.filter((item) => item.id !== planId)
          const nextActivePlanId = state.activePlanId === planId ? remainingPlans[0]?.id : state.activePlanId
          if (state.activePlanId === planId && remainingPlans[0]) {
            useRoadmapStore.getState().loadSnapshot(remainingPlans[0].snapshot)
          }

          return {
            plans: remainingPlans,
            activePlanId: nextActivePlanId,
            archivedPlanIds: state.archivedPlanIds.filter((id) => id !== planId),
            hiddenPlanIds: state.hiddenPlanIds.filter((id) => id !== planId),
            deletedPlans: [deletedRecord, ...state.deletedPlans],
          }
        })
      },
      restoreDeletedPlan: (deletedId) => {
        set((state) => {
          const deleted = state.deletedPlans.find((item) => item.id === deletedId)
          if (!deleted) {
            return state
          }

          return {
            plans: [deleted.plan, ...state.plans],
            deletedPlans: state.deletedPlans.filter((item) => item.id !== deletedId),
          }
        })
      },
      permanentlyDeletePlan: (deletedId) => set((state) => ({ deletedPlans: state.deletedPlans.filter((item) => item.id !== deletedId) })),
      clearDeletedPlans: () => set({ deletedPlans: [] }),
      purgeExpiredDeletedPlans: () => {
        set((state) => ({
          deletedPlans: state.deletedPlans.filter((item) => new Date(item.expiresAt).getTime() > Date.now()),
        }))
      },
      setMonthlyViewPreference: (planId, preference) => {
        set((state) => ({
          plans: withUpdatedPlan(state.plans, planId, (plan) => ({
            ...plan,
            monthlyViewPreference: preference,
            updatedAt: new Date().toISOString(),
          })),
        }))
      },
      getPlanById: (planId) => get().plans.find((plan) => plan.id === planId),
      linkRemotePlans: (links) => set((state) => ({ plans: state.plans.map((plan) => { const link = links.find((item) => item.importKey === plan.id); return link ? { ...plan, remoteId: link.remoteId, remoteRevision: link.remoteRevision } : plan }) })),
      mergeRemotePlans: (plans) => set((state) => ({ plans: [...state.plans, ...plans.filter((remote) => !state.plans.some((local) => local.remoteId === remote.remoteId || local.id === remote.id))] })),
      replaceRemotePlan: (remote) => set((state) => ({ plans: state.plans.map((plan) => plan.remoteId === remote.remoteId || plan.id === remote.id ? { ...remote, id: plan.id } : plan) })),
      markPlanSynced: (planId, remoteRevision) => set((state) => ({ plans: withUpdatedPlan(state.plans, planId, (plan) => ({ ...plan, remoteRevision })) })),
      setRemoteSharingEnabled: (planId, enabled) => set((state) => ({ plans: withUpdatedPlan(state.plans, planId, (plan) => ({ ...plan, remoteSharingEnabled: enabled })) })),
      syncActivePlanFromRoadmap: () => {
        const state = get()
        if (!state.activePlanId) {
          return
        }

        const snapshot = useRoadmapStore.getState().exportSnapshot()
        set({
          plans: withUpdatedPlan(state.plans, state.activePlanId, (plan) => ({
            ...plan,
            title: snapshot.project.name,
            description: snapshot.project.objective,
            startDate: snapshot.project.startDate,
            endDate: snapshot.project.endDate,
            categories: deriveCategories(snapshot),
            snapshot,
            updatedAt: new Date().toISOString(),
          })),
        })
      },
    }),
    {
      name: 'forge-planner-state',
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): ForgePlannerState => ({
        schemaVersion: state.schemaVersion,
        activePlanId: state.activePlanId,
        plans: state.plans,
        archivedPlanIds: state.archivedPlanIds,
        hiddenPlanIds: state.hiddenPlanIds,
        deletedPlans: state.deletedPlans,
      }),
    },
  ),
)
