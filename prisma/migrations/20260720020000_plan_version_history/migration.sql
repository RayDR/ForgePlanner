CREATE TYPE "PlanVersionSource" AS ENUM (
  'USER',
  'IMPORT',
  'MIGRATION',
  'SYSTEM',
  'TRASH_DELETE',
  'TRASH_RESTORE',
  'VERSION_RESTORE',
  'AI_GENERATION',
  'AI_REFINEMENT',
  'AI_PATCH'
);

CREATE TABLE "PlanVersion" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "source" "PlanVersionSource" NOT NULL,
  "actor_user_id" UUID,
  "effective_user_id" UUID,
  "parent_version_id" UUID,
  "restored_from_version_id" UUID,
  "checksum" CHAR(64) NOT NULL,
  "snapshot_size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanVersion_snapshot_size_check" CHECK ("snapshot_size_bytes" >= 0 AND "snapshot_size_bytes" <= 262144)
);

CREATE UNIQUE INDEX "PlanVersion_plan_id_revision_key" ON "PlanVersion"("plan_id", "revision");
CREATE INDEX "PlanVersion_plan_id_revision_idx" ON "PlanVersion"("plan_id", "revision" DESC);
CREATE INDEX "PlanVersion_plan_id_created_at_idx" ON "PlanVersion"("plan_id", "created_at" DESC);
CREATE INDEX "PlanVersion_plan_id_source_idx" ON "PlanVersion"("plan_id", "source");
CREATE UNIQUE INDEX "Plan_id_revision_key" ON "Plan"("id", "revision");

ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_effective_user_id_fkey"
  FOREIGN KEY ("effective_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_parent_version_id_fkey"
  FOREIGN KEY ("parent_version_id") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_restored_from_version_id_fkey"
  FOREIGN KEY ("restored_from_version_id") REFERENCES "PlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing rows are populated by the bounded application backfill command.
-- NOT VALID skips the initial table scan but still protects new and changed rows.
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_current_version_fkey"
  FOREIGN KEY ("id", "revision") REFERENCES "PlanVersion"("plan_id", "revision")
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
