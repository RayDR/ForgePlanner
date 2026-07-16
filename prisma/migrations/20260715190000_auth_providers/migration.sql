ALTER TABLE "User" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "provider_email" VARCHAR(320),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_provider_provider_user_id_key" ON "ExternalIdentity"("provider", "provider_user_id");
CREATE INDEX "ExternalIdentity_user_id_provider_idx" ON "ExternalIdentity"("user_id", "provider");
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
