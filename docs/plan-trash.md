# Server-backed plan trash

Authenticated plan trash is authoritative in PostgreSQL. Guest trash remains in the identity-scoped browser store and is never merged into account trash.

## Lifecycle

- Only the owner may delete, restore or permanently delete a plan.
- Soft deletion records `deletedAt`, `purgeAfter` (30 days), `deletedByUserId` and increments the plan revision.
- A repeated delete returns the original deletion state and never extends retention.
- Normal lists, collaborators and share links exclude deleted plans.
- Restore clears deletion metadata, increments revision and preserves sharing configuration.
- Permanent deletion requires the plan to be in trash. Plan access and share-link rows cascade; the audit event remains without retaining plan content.
- Lifecycle mutations require `expectedRevision`; stale active state returns `409 PLAN_VERSION_CONFLICT`.

Trash listing reads relational metadata only and never selects, parses or returns snapshots. A corrupt snapshot therefore remains visible and permanently deletable. Restore validates the full snapshot inside the lifecycle transaction; corruption returns the stable `CORRUPTED_PLAN_SNAPSHOT` error and rolls the restore back. A valid historical snapshot is migrated to v8 only in memory. Neither trash listing nor restore writes that normalized snapshot; a later explicit plan edit persists it through normal optimistic concurrency.

The migration backfills historical deleted rows with `purgeAfter = deletedAt + 30 days`. Old records may therefore be immediately eligible for purge. The first production invocation must remain a dry run, and its count must be reviewed before running with `--execute`. This repository does not contain the production database, so eligibility of real user records cannot be determined during migration development.

## Purge command

The command is a dry run unless `--execute` is supplied:

```bash
npm run plans:purge-trash
npm run plans:purge-trash -- --execute --limit=500
```

Production can invoke the second command from cron or a systemd timer after supplying the normal `DATABASE_URL`. The batch limit must be between 1 and 1000. Only rows with both `deletedAt` and an expired `purgeAfter` are selected. Each candidate is deleted independently with the eligibility predicate repeated, so one controlled failure does not roll back or prevent the remaining records. Logs and audit summaries contain counts only, never names or snapshots.
