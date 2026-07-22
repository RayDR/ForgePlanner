# NorthStar canonical plan contract

`shared/plan-contract` is the only runtime contract for portable NorthStar plans. Version 8 is a structural change from the historical version 7 document:

- UI selection, locale, theme and monthly view preference are outside the plan.
- the hidden `_forge` object is replaced by strict `metadata`;
- status `isSystem` and `isDefault` are separate: the former protects known built-ins and the latter selects the initial status for new activities;
- portable plan-intelligence fields are explicit and bounded;
- category definitions are required and exactly one is the creation default.

## Bounded contexts

The canonical snapshot contains project content, goals, milestones, activities, monthly execution, savings, categories, statuses, relationships and recoverable activity trash. PostgreSQL ownership, access, revision, sharing, lifecycle and timestamps remain relational. Browser selection, appearance, routing and sync/outbox state remain client state. Prompts, proposals, providers, usage, learning profiles, behavior signals and recommendations never enter portable plan JSON.

The canonical snapshot is authoritative for portable name, objective and dates. `derivePlanRelationalMetadata` is the single shared mapping used by the API to derive searchable PostgreSQL mirrors on create, import and update, and to normalize response metadata. Mutation schemas reject duplicate client-provided relational fields, so conflicting values cannot be accepted. Existing inconsistent database mirrors are never allowed to override snapshot content.

## UI-only preferences

Portable JSON no longer contains route selection or appearance preferences. `selectedYear` and `selectedMonthId` remain in the identity-scoped `useRoadmapStore` UI envelope. `locale` and `theme` are retained by the identity/session appearance state and the same scoped UI envelope. `monthlyViewPreference` remains in the identity-scoped `ForgePlan` wrapper. During a v7 file import these values are returned as `extractedUiState`; the importer may apply them to that identity's UI state, but they are never written into the canonical snapshot. Reading a server plan does not replace the current account's appearance with stale snapshot preferences.

## IDs and relationships

Historical descriptive IDs and UUIDs are accepted through the bounded pattern `[A-Za-z0-9][A-Za-z0-9._:-]{0,119}`. New interactive entities should use UUIDs. A future deterministic proposal mapper may use stable, language-neutral IDs that satisfy the same format.

Activity `dependencyIds` and `linkedActivityIds` are execution-level references. Root relationships are an additional richer plan graph and may express constraints not duplicated on the activity. Both sets are preserved. Semantic validation combines dependency edges for cycle detection and rejects invalid endpoints, self-relations and exact duplicates.

## Monthly records and future AI conversion

The application keeps `Record<YYYY-MM, MonthlyActivityEntry>` because it is the editor's established domain representation. Keys and values are bounded and strictly validated. Cross-reference existence, uniqueness, cycles and key/value month consistency are semantic guarantees that JSON Schema alone cannot express.

The canonical JSON Schema is exported as `canonicalPlanJsonSchema`. The OpenAI conversion boundary derives a provider-compatible strict Structured Outputs schema from it without changing the persisted contract; unsupported provider-only constraints remain authoritative in the canonical Zod and semantic validators. No model/provider metadata belongs in the mapped plan.

## Migration policy

Version 7 and the recognized unversioned `monthlyPlans` format migrate in memory without mutation. Documents labeled 1–6 are accepted only if their full shape matches the recognized version 7 format and receive a warning. Future and unknown shapes are rejected. Migration on read never writes PostgreSQL; normalization happens only through an explicit later update/import.

### Exact v7 to v8 mapping

| v7 field | v8 destination |
| --- | --- |
| `schemaVersion: 7` | `schemaVersion: 8` |
| `_forge.planningMode` | `metadata.planningMode` |
| `_forge.templateKey` | `metadata.templateKey` |
| `locale` | `metadata.contentLanguage` and extracted UI state |
| `selectedYear`, `selectedMonthId`, `theme` | extracted UI state only |
| `_forge.monthlyViewPreference` | extracted UI state only |
| `_forge.categories` | removed as redundant; `project.categoryDefinitions` is authoritative |
| status legacy `isDefault` | preserved as the initial default only when exactly one custom status carries it; otherwise `planned`, or the lowest-order status if `planned` is absent |
| known status IDs `planned`, `in-progress`, `paused`, `blocked`, `done` | `isSystem: true`, independently of legacy `isDefault` |
| activity missing `sequenceNumber` | reverse source order |
| activity missing `colorKey` | deterministic category color |
| activity missing `statusId` | `planned` |
| activity missing `progressMode` | `completion` |
| activity missing `history` | empty array |
| subtask `storyPoints` | `weight` when `weight` is absent; otherwise `weight` wins |

The migration introduces `metadata.origin` (`template` when a template key exists, otherwise `manual`) and `metadata.plannerContractVersion`. A missing category default becomes the first category. Unknown properties, malformed dates/IDs, unresolved references, invalid savings totals and ambiguous shapes are rejected with structured issues rather than dropped. Unknown custom statuses remain custom and never become system statuses merely because they were historically selected by default.

When legacy status-default flags are absent or ambiguous, migration emits `STATUS_DEFAULT_NORMALIZED`; introduced status/category defaults also emit warnings. These deterministic repairs are therefore visible to import callers rather than silent.

The recognized unversioned migration preserves `monthlyPlans`, savings, dependencies, comments, subtasks and `moveHistory`; movement becomes monthly-entry state plus `month-changed` history. Its deterministic creation-history timestamp is the Unix epoch because the old shape did not store creation time.

Migration during GET is read-only and in memory. A migrated snapshot becomes persistent only through an explicit import/create, or a later user mutation sent with the PostgreSQL `expectedRevision`. A concurrent change returns `409 PLAN_VERSION_CONFLICT`; the read itself never increments revision or overwrites the row.

Representative compatibility coverage includes the repository's current Project NorthStar Canada plan with custom status/default semantics, dependency graphs, monthly savings and bilingual visible content, plus a recognized unversioned export with monthly execution history.

CSV remains a partial activity interchange format. Every derived activity and the resulting plan are validated before the active plan can be replaced.
