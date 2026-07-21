CREATE TYPE "AiOperationStatus" AS ENUM ('DRAFT','PENDING','PROPOSED','REFINING','READY_FOR_CONVERSION','REJECTED','FAILED','EXPIRED');
CREATE TYPE "AiDetectedLanguage" AS ENUM ('EN','ES','MIXED','UNKNOWN');
CREATE TYPE "AiProposalLanguage" AS ENUM ('EN','ES');
CREATE TYPE "AiProposalRevisionSource" AS ENUM ('INITIAL_GENERATION','REFINEMENT');
CREATE TYPE "AiOperationRequestType" AS ENUM ('GENERATION','REFINEMENT');
CREATE TYPE "AiOperationRequestStatus" AS ENUM ('RESERVED','SUCCEEDED','FAILED');

CREATE TABLE "AiOperation" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "type" VARCHAR(40) NOT NULL DEFAULT 'PLAN_PROPOSAL',
  "title" VARCHAR(160),
  "status" "AiOperationStatus" NOT NULL,
  "selected_language" "AiProposalLanguage" NOT NULL,
  "detected_language" "AiDetectedLanguage" NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(80) NOT NULL,
  "prompt_template_version" VARCHAR(40) NOT NULL,
  "sanitized_input_metadata" JSONB NOT NULL,
  "refinement_count" INTEGER NOT NULL DEFAULT 0,
  "request_fingerprint" CHAR(64) NOT NULL,
  "generation_client_request_id" UUID NOT NULL,
  "current_proposal_revision_id" UUID,
  "ready_proposal_revision_id" UUID,
  "processing_request_id" UUID,
  "processing_lease_expires_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "purge_after" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "error_code" VARCHAR(80),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiProposalRevision" (
  "id" UUID NOT NULL,
  "ai_operation_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "parent_revision_id" UUID,
  "content" JSONB NOT NULL,
  "content_language" "AiProposalLanguage" NOT NULL,
  "source" "AiProposalRevisionSource" NOT NULL,
  "provider_request_id" VARCHAR(120),
  "input_token_count" INTEGER,
  "output_token_count" INTEGER,
  "estimated_cost_micros" BIGINT,
  "checksum" CHAR(64) NOT NULL,
  "content_size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiProposalRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiProposalRevision_size_check" CHECK ("content_size_bytes" >= 0 AND "content_size_bytes" <= 65536),
  CONSTRAINT "AiProposalRevision_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "AiOperationRequest" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "ai_operation_id" UUID NOT NULL,
  "type" "AiOperationRequestType" NOT NULL,
  "client_request_id" UUID NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "expected_revision" INTEGER,
  "status" "AiOperationRequestStatus" NOT NULL,
  "result_revision" INTEGER,
  "safe_error_code" VARCHAR(80),
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiOperationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiOperation_owner_user_id_generation_client_request_id_key" ON "AiOperation"("owner_user_id","generation_client_request_id");
CREATE INDEX "AiOperation_owner_user_id_created_at_idx" ON "AiOperation"("owner_user_id","created_at" DESC);
CREATE INDEX "AiOperation_owner_user_id_status_updated_at_idx" ON "AiOperation"("owner_user_id","status","updated_at" DESC);
CREATE INDEX "AiOperation_status_expires_at_idx" ON "AiOperation"("status","expires_at");
CREATE INDEX "AiOperation_processing_lease_expires_at_idx" ON "AiOperation"("processing_lease_expires_at");
CREATE UNIQUE INDEX "AiProposalRevision_ai_operation_id_revision_key" ON "AiProposalRevision"("ai_operation_id","revision");
CREATE INDEX "AiProposalRevision_ai_operation_id_created_at_idx" ON "AiProposalRevision"("ai_operation_id","created_at" DESC);
CREATE UNIQUE INDEX "AiOperationRequest_ai_operation_id_type_client_request_id_key" ON "AiOperationRequest"("ai_operation_id","type","client_request_id");
CREATE INDEX "AiOperationRequest_owner_user_id_type_client_request_id_idx" ON "AiOperationRequest"("owner_user_id","type","client_request_id");
CREATE INDEX "AiOperationRequest_status_lease_expires_at_idx" ON "AiOperationRequest"("status","lease_expires_at");

ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiProposalRevision" ADD CONSTRAINT "AiProposalRevision_ai_operation_id_fkey" FOREIGN KEY ("ai_operation_id") REFERENCES "AiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "AiProposalRevision" ADD CONSTRAINT "AiProposalRevision_parent_revision_id_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "AiProposalRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_current_proposal_revision_id_fkey" FOREIGN KEY ("current_proposal_revision_id") REFERENCES "AiProposalRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_ready_proposal_revision_id_fkey" FOREIGN KEY ("ready_proposal_revision_id") REFERENCES "AiProposalRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "AiOperationRequest" ADD CONSTRAINT "AiOperationRequest_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiOperationRequest" ADD CONSTRAINT "AiOperationRequest_ai_operation_id_fkey" FOREIGN KEY ("ai_operation_id") REFERENCES "AiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "check_ai_operation_revision_ownership"() RETURNS trigger AS $$
BEGIN
  IF NEW."current_proposal_revision_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AiProposalRevision" r WHERE r."id" = NEW."current_proposal_revision_id" AND r."ai_operation_id" = NEW."id"
  ) THEN RAISE EXCEPTION 'current proposal revision does not belong to operation' USING ERRCODE = '23514'; END IF;
  IF NEW."ready_proposal_revision_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AiProposalRevision" r WHERE r."id" = NEW."ready_proposal_revision_id" AND r."ai_operation_id" = NEW."id"
  ) THEN RAISE EXCEPTION 'ready proposal revision does not belong to operation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "AiOperation_revision_ownership_check"
AFTER INSERT OR UPDATE OF "current_proposal_revision_id", "ready_proposal_revision_id" ON "AiOperation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_ai_operation_revision_ownership"();
