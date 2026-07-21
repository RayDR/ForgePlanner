# Immutable plan version history (Stage 5)

Authenticated PostgreSQL plans use a linear, immutable history. `Plan.revision` always equals the revision of the current canonical snapshot and exactly one `PlanVersion(planId, revision)` represents it.

Every version has an independent server-generated UUID. Creation has no parent. Every later revision points to the previously current version through `parentVersionId`. Restoring revision 2 while revision 5 is current creates revision 6: its parent is revision 5 and `restoredFromVersionId` points to revision 2. Restore never rewinds or rewrites history, and no branch API exists.

## Writes and provenance

`PlanRevisionService` is the only normal writer of `Plan.snapshot` and `Plan.revision`. In one transaction it validates/migrates to canonical v8, derives relational mirrors, deterministically serializes the snapshot, enforces the 256 KiB UTF-8 ceiling, computes SHA-256 and byte size, advances the revision, inserts `PlanVersion`, and writes a non-sensitive audit event.

The server assigns provenance. Current routes use `USER`, `IMPORT`, `TRASH_DELETE`, `TRASH_RESTORE`, and `VERSION_RESTORE`. `MIGRATION` is backfill-only. `SYSTEM` and the three `AI_*` values are reserved; no current route assigns them. Clients cannot submit provenance, actors, lineage, checksum, size, or schema metadata.

The only exceptional writer is `PlanVersionBackfillService`. It may normalize an existing v7 snapshot to v8 without incrementing `Plan.revision`, then inserts the missing matching version with source `MIGRATION` and null actors. It is bounded, explicit, idempotent, and not exposed over HTTP.

Unchanged import retries create neither a revision nor audit event. Changed imports create an `IMPORT` revision with optimistic concurrency and never restore trash implicitly.

## Database invariant and Prisma

Custom migration SQL adds a `DEFERRABLE INITIALLY DEFERRED` composite foreign key from `Plan(id, revision)` to `PlanVersion(planId, revision)`. Deferral lets both records be created in one transaction but prevents commit without the matching version. It starts `NOT VALID` so legacy plans can be backfilled; backfill validates it only when no current version is missing.

Prisma cannot express this circular deferred constraint in its schema DSL. It remains in migration SQL and is covered by PostgreSQL integration tests. Permanent plan deletion is atomic and cascades every private version snapshot.

## API and privacy

- `GET /api/plans/:planId/versions` returns metadata only, defaults to 25 and caps at 100. It neither selects snapshots nor recomputes checksums.
- `GET /api/plans/:planId/versions/:revision` loads exactly one snapshot and verifies canonical validity, size, and checksum.
- `POST /api/plans/:planId/versions/:revision/restore` is limited to 10 requests per minute and creates a new revision.

Owners and accepted editors can read detail and restore. Viewers may list metadata but receive no actor identity and cannot read history content. Public links have no history routes. Revocation applies immediately. Deleted plans expose no history API. Integrity failures never return the untrusted snapshot.

Historical snapshots exist only in React component memory—not persisted Zustand, localStorage, sessionStorage, IndexedDB, or normal exports. Requests use AbortController plus the Stage 1 identity scope/generation guard. Changing identity or plan clears detail. Restore replaces the canonical remote DTO and updates the autosave baseline to avoid a duplicate revision.

## Maintenance

Dry-run is the default:

```bash
DATABASE_URL=... npm run plans:backfill-versions -- --limit=100
DATABASE_URL=... npm run plans:backfill-versions -- --plan-id=<uuid>
```

Writes require an exact database confirmation:

```bash
DATABASE_URL=... npm run plans:backfill-versions -- --execute --confirm-database=<database> --limit=100
```

Continue bounded batches with `--cursor=<uuid>`. Results report `SCANNED`, `CREATED`, `UNCHANGED`, `CORRUPTED`, `CONFLICT`, `FAILED`, and `SKIPPED`; snapshots are never logged. Verification has no repair mode:

```bash
DATABASE_URL=... npm run plans:verify-versions -- --limit=100
DATABASE_URL=... npm run plans:verify-versions -- --plan-id=<uuid>
```

Deploy the migration, review dry-run, execute bounded backfill, rerun to confirm `UNCHANGED`, and verify. A corrupt plan remains permanently deletable for privacy.

## Growth and future AI

Storage grows approximately by the sum of canonical snapshot sizes for accepted revisions. Payload size, list page size, restore rate and backfill concurrency are bounded. The MVP retains all versions. Compression, cold/object-storage archival, checkpoints plus patches, and retention tiers are documented future options; Stage 5 performs no pruning.

AI provenance is schema-ready but Stage 5 stores no prompts or unreferenced AI identifiers. A future approved stage can add an `AiOperation` entity and nullable real foreign key without redesigning version identity or lineage.
