ALTER TABLE "Plan" ADD COLUMN "sharing_enabled" BOOLEAN NOT NULL DEFAULT true;

-- Preserve the privacy choice used by the previous archived-plan implementation.
UPDATE "Plan" SET "sharing_enabled" = false WHERE "status" = 'archived_private';
UPDATE "Plan" SET "status" = 'active' WHERE "status" IN ('archived_private', 'archived_shared');

CREATE TABLE "PlanShareLink" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "access_level" "PlanAccessLevel" NOT NULL DEFAULT 'viewer',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanShareLink_plan_id_key" ON "PlanShareLink"("plan_id");
CREATE INDEX "PlanShareLink_enabled_access_level_idx" ON "PlanShareLink"("enabled", "access_level");
ALTER TABLE "PlanShareLink" ADD CONSTRAINT "PlanShareLink_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
