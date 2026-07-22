ALTER TYPE "AiOperationStatus" ADD VALUE IF NOT EXISTS 'CONVERTING';
ALTER TYPE "AiOperationStatus" ADD VALUE IF NOT EXISTS 'PLAN_PREVIEW_READY';
ALTER TYPE "AiOperationStatus" ADD VALUE IF NOT EXISTS 'CONVERSION_FAILED';
ALTER TYPE "AiOperationStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

ALTER TABLE "AiOperation"
  ADD COLUMN "conversion_client_request_id" UUID,
  ADD COLUMN "conversion_provider" VARCHAR(40),
  ADD COLUMN "conversion_model" VARCHAR(80),
  ADD COLUMN "conversion_prompt_version" VARCHAR(40),
  ADD COLUMN "conversion_snapshot" JSONB,
  ADD COLUMN "conversion_checksum" CHAR(64),
  ADD COLUMN "conversion_size_bytes" INTEGER,
  ADD COLUMN "conversion_provider_request_id" VARCHAR(120),
  ADD COLUMN "conversion_input_token_count" INTEGER,
  ADD COLUMN "conversion_output_token_count" INTEGER,
  ADD COLUMN "regeneration_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "conversion_started_at" TIMESTAMP(3),
  ADD COLUMN "preview_ready_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "created_plan_id" UUID;

ALTER TABLE "PlanVersion" ADD COLUMN "ai_operation_id" UUID;

ALTER TABLE "AiOperation"
  ADD CONSTRAINT "AiOperation_conversion_size_check" CHECK ("conversion_size_bytes" IS NULL OR ("conversion_size_bytes" >= 0 AND "conversion_size_bytes" <= 262144)),
  ADD CONSTRAINT "AiOperation_regeneration_count_check" CHECK ("regeneration_count" >= 0 AND "regeneration_count" <= 2);

CREATE UNIQUE INDEX "AiOperation_created_plan_id_key" ON "AiOperation"("created_plan_id");
CREATE UNIQUE INDEX "AiOperation_owner_user_id_conversion_client_request_id_key"
  ON "AiOperation"("owner_user_id", "conversion_client_request_id");
CREATE INDEX "PlanVersion_ai_operation_id_idx" ON "PlanVersion"("ai_operation_id");

ALTER TABLE "AiOperation"
  ADD CONSTRAINT "AiOperation_created_plan_id_fkey"
  FOREIGN KEY ("created_plan_id") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanVersion"
  ADD CONSTRAINT "PlanVersion_ai_operation_id_fkey"
  FOREIGN KEY ("ai_operation_id") REFERENCES "AiOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
