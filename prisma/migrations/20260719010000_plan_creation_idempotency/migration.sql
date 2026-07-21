ALTER TABLE "Plan" ADD COLUMN "client_mutation_id" UUID;

CREATE UNIQUE INDEX "Plan_owner_user_id_client_mutation_id_key"
ON "Plan"("owner_user_id", "client_mutation_id");
