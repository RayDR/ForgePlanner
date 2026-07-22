import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useForgePlannerStore } from "../hooks/useForgePlannerStore";
import { useRoadmapStore } from "../hooks/useRoadmapStore";
import { MonthlyKanban } from "../kanban/MonthlyKanban";
import { activitiesForMonth, buildYearMonths } from "../utils/dateUtils";
import {
  getActivityDisplayId,
  getActivityStatusForMonth,
  getCalculatedActivityProgress,
  getEffectiveMonthlySavingsTarget,
  getSavingsEntry,
  isSavingsTrackingEnabled,
} from "../utils/roadmapModel";
import { Card } from "../ui/Card";
import { MonthTab } from "../ui/MonthTab";
import { ActivityIcon, KanbanIcon, ListIcon, PlusIcon, Trash2Icon } from "../ui/icons";
import { formatCurrency } from "../utils/progressUtils";
import type { MonthlyActivityEntry } from "../types/roadmap";
import type { RecurrenceFrequency } from "../types/roadmap";
import { RecurrenceSelect } from "../ui/RecurrenceSelect";
import { categoryMeta, getCategoryMeta } from "../data/northstarMockData";
import { CategoryFilter } from "../ui/CategoryFilter";
import { customColorClass } from "../ui/customColor";

function monthEndDate(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function MonthlyFocusView() {
  const { monthId, planId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const project = useRoadmapStore((state) => state.project);
  const activities = useRoadmapStore((state) => state.activities);
  const locale = useRoadmapStore((state) => state.locale);
  const openActivity = useRoadmapStore((state) => state.openActivity);
  const selectedMonthId = useRoadmapStore((state) => state.selectedMonthId);
  const selectedYear = useRoadmapStore((state) => state.selectedYear);
  const setSelectedPeriod = useRoadmapStore((state) => state.setSelectedPeriod);
  const updateSavingsEntry = useRoadmapStore(
    (state) => state.updateSavingsEntry,
  );
  const removeMonthlyEntry = useRoadmapStore(
    (state) => state.removeMonthlyEntry,
  );
  const addMonthlyEntry = useRoadmapStore((state) => state.addMonthlyEntry);
  const updateMonthlyEntry = useRoadmapStore(
    (state) => state.updateMonthlyEntry,
  );
  const createActivity = useRoadmapStore((state) => state.createActivity);
  const activePlanId = useForgePlannerStore((state) => state.activePlanId);
  const monthlyViewPreference = useForgePlannerStore((state) =>
    state.activePlanId
      ? state.plans.find((plan) => plan.id === state.activePlanId)?.monthlyViewPreference ?? "list"
      : "list",
  );
  const setMonthlyViewPreference = useForgePlannerStore((state) => state.setMonthlyViewPreference);
  const activeMonthId = monthId ?? selectedMonthId;
  const activeYear = Number(activeMonthId.slice(0, 4));
  const requestedHighlight = (
    location.state as { highlightMonthId?: string } | null
  )?.highlightMonthId;
  const [highlightedMonthId, setHighlightedMonthId] = useState<string | null>(
    requestedHighlight ?? null,
  );
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const monthTabListRef = useRef<HTMLDivElement>(null);
  const [undoEntry, setUndoEntry] = useState<{
    activityId: string;
    entry: MonthlyActivityEntry;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const viewMode = monthlyViewPreference;
  const availableCategories = project.categoryDefinitions?.length
    ? project.categoryDefinitions
    : Object.values(categoryMeta);
  const defaultCategoryKey = availableCategories.find((category) => category.isDefault)?.key ?? availableCategories[0]?.key ?? "general";
  const [activityDraft, setActivityDraft] = useState({
    title: "",
    description: "",
    category: defaultCategoryKey,
    startDate: `${activeMonthId}-01`,
    endDate: monthEndDate(activeMonthId),
    recurrenceFrequency: "none" as "none" | RecurrenceFrequency,
    recurrenceEndDate: project.endDate,
  });

  useEffect(() => {
    if (!monthId || !/^\d{4}-\d{2}$/.test(monthId)) return;
    if (
      monthId !== selectedMonthId ||
      Number(monthId.slice(0, 4)) !== selectedYear
    ) {
      setSelectedPeriod(monthId);
    }
  }, [monthId, selectedMonthId, selectedYear, setSelectedPeriod]);

  useEffect(() => {
    if (!requestedHighlight) return;
    // Route state starts the temporary highlight animation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightedMonthId(requestedHighlight);
    const timeout = window.setTimeout(() => setHighlightedMonthId(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [requestedHighlight, location.key]);

  useEffect(() => {
    if (!undoEntry) return;
    const timeout = window.setTimeout(() => setUndoEntry(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [undoEntry]);

  useEffect(() => {
    const container = monthTabListRef.current;
    const activeTab = container?.querySelector<HTMLElement>(
      ".month-tab.btn-active",
    );
    if (!container || !activeTab) return;
    container.scrollTo({
      left: activeTab.offsetLeft - container.offsetLeft,
      behavior: "smooth",
    });
  }, [activeMonthId, locale]);

  const monthOptions = buildYearMonths(
    activeYear,
    project.startDate,
    project.endDate,
    locale,
  );
  const monthActivities = useMemo(
    () => activitiesForMonth(activities, activeMonthId),
    [activities, activeMonthId],
  );
  const visibleMonthActivities = useMemo(
    () => categoryFilter ? monthActivities.filter((activity) => activity.category === categoryFilter) : monthActivities,
    [categoryFilter, monthActivities],
  );
  const activeMonth = monthOptions.find((month) => month.id === activeMonthId);
  const savingsEntry = getSavingsEntry(project, activeMonthId);
  const savingsEnabled = isSavingsTrackingEnabled(project);
  const savingsMode = project.savingsPlan.mode ?? "monthly-target";
  const effectiveSavingsTarget = getEffectiveMonthlySavingsTarget(
    project,
    activeMonthId,
  );
  const [targetValue, setTargetValue] = useState(
    String(effectiveSavingsTarget),
  );
  const [actualValue, setActualValue] = useState(
    String(savingsEntry?.actual ?? 0),
  );
  const [notesValue, setNotesValue] = useState(savingsEntry?.notes ?? "");
  const [evidenceName, setEvidenceName] = useState("");
  // The monthly editor remains available so an out-of-range month can be
  // intentionally activated. Roadmap visibility follows the stricter rule.
  const showSavingsPanel = savingsEnabled;

  useEffect(() => {
    // Controlled form values follow the canonical month selection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargetValue(String(effectiveSavingsTarget));
    setActualValue(String(savingsEntry?.actual ?? 0));
    setNotesValue(savingsEntry?.notes ?? "");
    setEvidenceName("");
  }, [
    effectiveSavingsTarget,
    savingsEntry?.actual,
    savingsEntry?.notes,
    activeMonthId,
  ]);

  const dateLabel = new Intl.DateTimeFormat(
    locale === "es" ? "es-MX" : "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(`${activeMonthId}-01T00:00:00Z`));
  const statusCounts = monthActivities.reduce<Record<string, number>>(
    (counts, activity) => {
      const status =
        activity.monthlyEntries[activeMonthId]?.status ?? "planned";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const maxStatusCount = Math.max(1, ...Object.values(statusCounts));
  const completedCount = monthActivities.filter(
    (activity) =>
      activity.monthlyEntries[activeMonthId]?.status === "completed",
  ).length;
  const progress = monthActivities.length
    ? Math.round(
        monthActivities.reduce(
          (sum, activity) => sum + getCalculatedActivityProgress(activity),
          0,
        ) / monthActivities.length,
      )
    : 0;
  const t =
    locale === "es"
      ? {
          months: "Meses",
          planner: "Plan mensual",
          savings: "Ahorro del mes",
          target: "Objetivo",
          actual: "Ahorrado",
          notes: "Notas",
          evidence: "Evidencia opcional",
          save: "Guardar",
          analytics: "Analítica del mes",
          activities: "Actividades",
          work: "Trabajo",
          progress: "Progreso",
          subtasks: "Subtareas",
          status: "Estado",
          category: "Categoría",
          empty: "No hay actividades asignadas a este mes.",
          remove: "Quitar del mes",
          removed: "Entrada eliminada del mes.",
          undo: "Deshacer",
          completed: "completadas",
          milestone: "Hitos",
          past: "Este mes ya pasó. Puedes seguir editándolo sin restricciones.",
          create: "Nueva actividad",
          addActivity: "Agregar actividad",
          addFirstActivity: "Agregar la primera actividad",
          listView: "Lista",
          kanbanView: "Kanban",
          addContribution: "Registrar aportación",
          addExpense: "Registrar gasto",
          activityTitle: "Título",
          description: "Descripción",
          cancel: "Cancelar",
          extendWindow: "Este mes está fuera de la ventana del plan. Guardar el ahorro ampliará la ventana para incluirlo. ¿Deseas continuar?",
        }
      : {
          months: "Months",
          planner: "Monthly planner",
          savings: "Monthly savings",
          target: "Target",
          actual: "Saved",
          notes: "Notes",
          evidence: "Optional evidence",
          save: "Save",
          analytics: "Monthly analytics",
          activities: "Activities",
          work: "Work",
          progress: "Progress",
          subtasks: "Subtasks",
          status: "Status",
          category: "Category",
          empty: "No activities are assigned to this month.",
          remove: "Remove from month",
          removed: "Monthly entry removed.",
          undo: "Undo",
          completed: "completed",
          milestone: "Milestones",
          past: "This month is in the past. You can still edit it without restrictions.",
          create: "New activity",
          addActivity: "Add activity",
          addFirstActivity: "Add the first activity",
          listView: "List",
          kanbanView: "Kanban",
          addContribution: "Add contribution",
          addExpense: "Add expense",
          activityTitle: "Title",
          description: "Description",
          cancel: "Cancel",
          extendWindow: "This month is outside the plan window. Saving these values will extend the plan window to include it. Do you want to continue?",
        };

  function removeEntry(activityId: string) {
    const entry = activities.find((activity) => activity.id === activityId)
      ?.monthlyEntries[activeMonthId];
    if (!entry) return;
    removeMonthlyEntry(activityId, activeMonthId);
    setUndoEntry({ activityId, entry });
  }

  function undoRemoval() {
    if (!undoEntry) return;
    addMonthlyEntry(
      undoEntry.activityId,
      activeMonthId,
      undoEntry.entry.status,
    );
    updateMonthlyEntry(undoEntry.activityId, activeMonthId, undoEntry.entry);
    setUndoEntry(null);
  }

  function saveSavings() {
    const target = savingsMode === "monthly-target" ? Number(targetValue || 0) : 0;
    const actual = Number(actualValue || 0);
    const hasValue = target > 0 || actual > 0 || Boolean(notesValue.trim()) || Boolean(evidenceName);
    if (!activeMonth?.active && hasValue && !window.confirm(t.extendWindow)) return;
    const evidenceNote = evidenceName
      ? `${notesValue}${notesValue ? "\n" : ""}[Evidence: ${evidenceName}]`
      : notesValue;
    updateSavingsEntry(
      activeMonthId,
      target,
      actual,
      evidenceNote,
    );
  }

  function submitActivity() {
    if (!activityDraft.title.trim()) return;
    const month = monthOptions.find((option) => option.id === activeMonthId);
    if (!month) return;
    createActivity({
      title: activityDraft.title.trim(),
      description: activityDraft.description.trim(),
      category: activityDraft.category,
      priority: "medium",
      relationshipMode: "independent",
      startDate: activityDraft.startDate,
      endDate: activityDraft.endDate,
      firstMonthId: month.id,
      initialStatus: "planned",
      dependencyIds: [],
      linkedActivityIds: [],
      milestone: false,
      notes: "",
      subtasks: [],
      recurrence: activityDraft.recurrenceFrequency === "none" ? undefined : { frequency: activityDraft.recurrenceFrequency, endDate: activityDraft.recurrenceEndDate },
    });
    setActivityDraft({
      title: "",
      description: "",
      category: defaultCategoryKey,
      startDate: `${activeMonthId}-01`,
      endDate: monthEndDate(activeMonthId),
      recurrenceFrequency: "none",
      recurrenceEndDate: project.endDate,
    });
    setCreateOpen(false);
  }

  function openActivityCreator(category?: string) {
    setActivityDraft((draft) => ({
      ...draft,
      category: category ?? draft.category,
      startDate: `${activeMonthId}-01`,
      endDate: monthEndDate(activeMonthId),
      recurrenceEndDate: project.endDate,
    }));
    setCreateOpen(true);
  }

  function selectViewMode(mode: "list" | "kanban") {
    if (activePlanId) setMonthlyViewPreference(activePlanId, mode);
  }

  function activityCreator() {
    return (
      <form className="monthly-inline-create" onSubmit={(event) => { event.preventDefault(); submitActivity(); }}>
        <div className="form-grid monthly-activity-primary-fields">
          <label className="field-wrap">
            <span>{t.activityTitle}</span>
            <input autoFocus className="field-input" value={activityDraft.title} onChange={(event) => setActivityDraft((draft) => ({ ...draft, title: event.target.value }))} />
          </label>
          <label className="field-wrap">
            <span>{t.category}</span>
            <select className="field-input" value={activityDraft.category} onChange={(event) => setActivityDraft((draft) => ({ ...draft, category: event.target.value }))}>
              {availableCategories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
            </select>
          </label>
          <label className="field-wrap"><span>{locale === "es" ? "Fecha de inicio" : "Start date"}</span><input className="field-input" type="date" value={activityDraft.startDate} onChange={(event) => setActivityDraft((draft) => ({ ...draft, startDate: event.target.value, endDate: event.target.value > draft.endDate ? event.target.value : draft.endDate }))} /></label>
          <label className="field-wrap"><span>{locale === "es" ? "Fecha de fin" : "End date"}</span><input className="field-input" type="date" min={activityDraft.startDate} value={activityDraft.endDate} onChange={(event) => setActivityDraft((draft) => ({ ...draft, endDate: event.target.value }))} /></label>
          <label className="field-wrap"><span>{locale === "es" ? "Repetir" : "Repeat"}</span><RecurrenceSelect locale={locale} value={activityDraft.recurrenceFrequency} startDate={activityDraft.startDate} maximumEndDate={project.endDate} onChange={(recurrenceFrequency) => setActivityDraft((draft) => ({ ...draft, recurrenceFrequency }))} /></label>
          {activityDraft.recurrenceFrequency !== "none" ? <label className="field-wrap"><span>{locale === "es" ? "Repetir hasta" : "Repeat until"}</span><input className="field-input" type="date" min={activityDraft.startDate} max={project.endDate} value={activityDraft.recurrenceEndDate} onChange={(event) => setActivityDraft((draft) => ({ ...draft, recurrenceEndDate: event.target.value }))} /></label> : null}
        </div>
        <label className="field-wrap activity-create-description">
          <span>{t.description}</span>
          <textarea className="field-input" value={activityDraft.description} onChange={(event) => setActivityDraft((draft) => ({ ...draft, description: event.target.value }))} />
        </label>
        <div className="row-wrap monthly-create-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>{t.cancel}</button>
          <button type="submit" className="btn btn-primary" disabled={!activityDraft.title.trim()}>{t.create}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="monthly-layout">
      <aside className="month-sidebar card">
        <p className="eyebrow">{t.months}</p>
        <div className="month-tab-list" ref={monthTabListRef}>
          {monthOptions.map((month) => {
            const count = activitiesForMonth(activities, month.id).length;
            const monthSavings = getSavingsEntry(project, month.id);
            const hasSavings =
              savingsEnabled &&
              Boolean(
                monthSavings &&
                  (monthSavings.target > 0 || monthSavings.actual > 0),
              );
            const localizedLabel = new Intl.DateTimeFormat(
              locale === "es" ? "es-MX" : "en-US",
              { month: "short", timeZone: "UTC" },
            ).format(new Date(`${month.id}-01T00:00:00Z`));
            return (
              <MonthTab
                key={month.id}
                label={localizedLabel}
                count={count || undefined}
                savings={
                  hasSavings
                    ? formatCurrency(monthSavings?.actual ?? 0)
                    : undefined
                }
                empty={!count && !hasSavings}
                active={month.id === activeMonthId}
                highlighted={month.id === highlightedMonthId}
                onClick={() => {
                  setSelectedPeriod(month.id);
                  navigate(
                    planId
                      ? `/plans/${planId}/monthly/${month.id}`
                      : `/monthly/${month.id}`,
                  );
                }}
              />
            );
          })}
        </div>
      </aside>
      <section className="agenda-column monthly-plan-column">
        {activeMonthId < new Date().toISOString().slice(0, 7) ? (
          <div className="past-month-notice" role="status">
            {t.past}
          </div>
        ) : null}
        <Card className="monthly-plan-header">
          <div>
            <p className="eyebrow">{t.planner}</p>
            <h2>{dateLabel}</h2>
          </div>
          <div className="monthly-header-actions">
            <button
              type="button"
              className={
                analyticsOpen
                  ? "btn btn-active monthly-analytics-trigger"
                  : "btn btn-ghost monthly-analytics-trigger"
              }
              onClick={() => setAnalyticsOpen((open) => !open)}
              aria-label={t.analytics}
            >
              <ActivityIcon width={17} height={17} />
            </button>
          </div>
        </Card>
        {showSavingsPanel ? (
          <Card
            className={`monthly-savings-compact monthly-savings-${savingsMode}`}
          >
            <div className="monthly-savings-title">
              <strong>{t.savings}</strong>
              <span>
                {formatCurrency(Number(actualValue || 0))}
                {savingsMode === "monthly-target"
                  ? ` / ${formatCurrency(Number(targetValue || 0))}`
                  : ""}
              </span>
            </div>
            {availableCategories.some((category) => category.key === "contributions" || category.key === "expenses") ? <div className="monthly-savings-entry-actions">
              {availableCategories.some((category) => category.key === "contributions") ? <button type="button" className="btn btn-ghost" onClick={() => openActivityCreator("contributions")}><PlusIcon width={15} />{t.addContribution}</button> : null}
              {availableCategories.some((category) => category.key === "expenses") ? <button type="button" className="btn btn-ghost" onClick={() => openActivityCreator("expenses")}><PlusIcon width={15} />{t.addExpense}</button> : null}
            </div> : null}
            <div className="monthly-savings-fields">
              {savingsMode === "monthly-target" ? (
                <label>
                  <span>{t.target}</span>
                  <input
                    type="number"
                    value={targetValue}
                    onChange={(event) => setTargetValue(event.target.value)}
                  />
                </label>
              ) : null}
              <label>
                <span>{t.actual}</span>
                <input
                  type="number"
                  value={actualValue}
                  onChange={(event) => setActualValue(event.target.value)}
                />
              </label>
              <label className="monthly-savings-notes">
                <span>{t.notes}</span>
                <input
                  value={notesValue}
                  onChange={(event) => setNotesValue(event.target.value)}
                />
              </label>
              <label className="monthly-evidence">
                <span>{t.evidence}</span>
                <input
                  type="file"
                  onChange={(event) =>
                    setEvidenceName(event.target.files?.[0]?.name ?? "")
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveSavings}
              >
                {t.save}
              </button>
            </div>
          </Card>
        ) : null}
        {analyticsOpen ? (
          <Card className="monthly-analytics">
            <div className="monthly-analytics-summary">
              <strong>{progress}%</strong>
              <span>
                {completedCount} / {monthActivities.length} {t.completed}
              </span>
              <span>
                {
                  monthActivities.filter((activity) => activity.milestone)
                    .length
                }{" "}
                {t.milestone}
              </span>
            </div>
            <div className="monthly-status-chart">
              {Object.entries(statusCounts).map(([status, count]) => (
                <button
                  key={status}
                  type="button"
                  style={
                    {
                      "--status-size": `${(count / maxStatusCount) * 100}%`,
                    } as React.CSSProperties
                  }
                >
                  <span>{status}</span>
                  <i />
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
          </Card>
        ) : null}
        <section className="monthly-work-panel">
          <header>
            <div className="monthly-work-heading">
              <h3>{t.activities}</h3>
              {visibleMonthActivities.length ? <span>{visibleMonthActivities.length}</span> : null}
            </div>
            <div className="monthly-view-toggle" role="tablist" aria-label={locale === "es" ? "Vista de actividades" : "Activity view"}>
              <button type="button" role="tab" aria-selected={viewMode === "list"} className={viewMode === "list" ? "is-active" : ""} onClick={() => selectViewMode("list")}>
                <ListIcon width={15} height={15} />
                {t.listView}
              </button>
              <button type="button" role="tab" aria-selected={viewMode === "kanban"} className={viewMode === "kanban" ? "is-active" : ""} onClick={() => selectViewMode("kanban")}>
                <KanbanIcon width={15} height={15} />
                {t.kanbanView}
              </button>
            </div>
            <CategoryFilter categories={availableCategories} value={categoryFilter} locale={locale} onChange={setCategoryFilter} />
          </header>
          {viewMode === "kanban" ? (
            <MonthlyKanban
              monthId={activeMonthId}
              activities={visibleMonthActivities}
              statuses={project.statusDefinitions}
              locale={locale}
              onOpen={openActivity}
            />
          ) : visibleMonthActivities.length ? (
            <div className="monthly-work-table">
              <div className="monthly-work-head">
                <span>{t.work}</span>
                <span>{t.progress}</span>
                <span>{t.subtasks}</span>
                <span>{t.status}</span>
                <span>{t.category}</span>
                <span />
              </div>
              {visibleMonthActivities.map((activity) => {
                const activityStatus = getActivityStatusForMonth(activity, activeMonthId) ?? "planned";
                const statusColor =
                  project.statusDefinitions.find(
                    (status) => status.id === activity.statusId,
                  )?.colorKey ?? "slate";
                const category = project.categoryDefinitions?.find((item) => item.key === activity.category) ?? getCategoryMeta(activity.category);
                return (
                  <article
                    key={activity.id}
                    className={`monthly-work-row monthly-work-${activity.colorKey} ${customColorClass(activity.colorHex)}`}
                  >
                    <button
                      type="button"
                      className="monthly-work-title"
                      onClick={() => openActivity(activity.id)}
                    >
                      <small>{getActivityDisplayId(activity, project, activities)}</small>
                      <strong>{activity.title}</strong>
                    </button>
                    <span>{getCalculatedActivityProgress(activity)}%</span>
                    <span>{activity.subtasks.length}</span>
                    <span>
                      <i
                        className={`monthly-badge monthly-badge-${statusColor}`}
                      >
                        {activityStatus}
                      </i>
                    </span>
                    <span>
                      <i
                        className={`monthly-badge monthly-badge-${category.tone} ${customColorClass(category.colorHex)}`}
                      >
                        {category.label}
                      </i>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost monthly-remove-entry"
                      onClick={() => removeEntry(activity.id)}
                      aria-label={t.remove}
                      title={t.remove}
                    >
                      <Trash2Icon width={14} height={14} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="monthly-empty">{categoryFilter ? (locale === "es" ? "No hay actividades de esta categoría en el mes." : "No activities in this category for this month.") : t.empty}</p>
          )}
          {createOpen ? activityCreator() : (
            <div className="monthly-add-activity">
              <button type="button" onClick={() => openActivityCreator()}>
                <PlusIcon width={16} height={16} />
                <span>{monthActivities.length ? t.addActivity : t.addFirstActivity}</span>
              </button>
            </div>
          )}
        </section>
        {undoEntry ? (
          <div className="monthly-undo" role="status">
            <span>{t.removed}</span>
            <button type="button" onClick={undoRemoval}>
              {t.undo}
            </button>
            <button type="button" onClick={() => setUndoEntry(null)}>
              ×
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
