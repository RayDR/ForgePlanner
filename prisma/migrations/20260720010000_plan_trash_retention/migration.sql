ALTER TABLE "Plan"
ADD COLUMN "purge_after" TIMESTAMP(3),
ADD COLUMN "deleted_by_user_id" UUID;

UPDATE "Plan"
SET "purge_after" = "deleted_at" + INTERVAL '30 days'
WHERE "deleted_at" IS NOT NULL
  AND "purge_after" IS NULL;

CREATE INDEX "Plan_purge_after_id_idx" ON "Plan"("purge_after", "id");

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_deleted_by_user_id_fkey"
FOREIGN KEY ("deleted_by_user_id") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_deletion_lifecycle_check"
CHECK (
  ("deleted_at" IS NULL AND "purge_after" IS NULL AND "deleted_by_user_id" IS NULL)
  OR
  ("deleted_at" IS NOT NULL AND "purge_after" IS NOT NULL)
);
