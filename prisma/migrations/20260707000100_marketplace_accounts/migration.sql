ALTER TABLE "Account" ADD COLUMN "companyName" TEXT NOT NULL DEFAULT 'Sullery';
ALTER TABLE "Account" ADD COLUMN "marketplace" TEXT NOT NULL DEFAULT 'FLIPKART';
ALTER TABLE "Account" ADD COLUMN "accountDisplayName" TEXT;
ALTER TABLE "Account" ADD COLUMN "accountCode" TEXT;
ALTER TABLE "Account" ADD COLUMN "notes" TEXT;

UPDATE "Account"
SET
  "accountDisplayName" = COALESCE("accountDisplayName", "name"),
  "accountCode" = COALESCE("accountCode", "code")
WHERE "accountDisplayName" IS NULL OR "accountCode" IS NULL;

CREATE INDEX "Account_companyName_idx" ON "Account"("companyName");
CREATE INDEX "Account_marketplace_active_idx" ON "Account"("marketplace", "active");
