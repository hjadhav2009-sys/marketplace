ALTER TYPE "BatchStatus" ADD VALUE IF NOT EXISTS 'NEEDS_MAPPING';
CREATE TYPE "MarketplaceImportPurpose" AS ENUM ('PRODUCT_CATALOG', 'DAILY_ORDER', 'CONSIGNMENT_QUANTITY', 'CONSIGNMENT_ENRICHMENT');
ALTER TABLE "WorkTask" ADD COLUMN "workCardSnapshotJson" TEXT, ADD COLUMN "routeSnapshotJson" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "MarketplaceFileProfile" (
  "id" TEXT NOT NULL,
  "accountId" TEXT,
  "marketplace" "Marketplace" NOT NULL,
  "importPurpose" "MarketplaceImportPurpose" NOT NULL,
  "profileName" TEXT NOT NULL,
  "headerFingerprint" TEXT NOT NULL,
  "workbookSignatureJson" TEXT,
  "fieldMappingJson" TEXT NOT NULL,
  "requiredFieldsJson" TEXT NOT NULL,
  "optionalFieldsJson" TEXT,
  "dataSheetRuleJson" TEXT,
  "dataStartRuleJson" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceFileProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceFileProfile_marketplace_importPurpose_headerFingerprint_version_key" ON "MarketplaceFileProfile"("marketplace", "importPurpose", "headerFingerprint", "version");
CREATE INDEX "MarketplaceFileProfile_accountId_marketplace_importPurpose_active_idx" ON "MarketplaceFileProfile"("accountId", "marketplace", "importPurpose", "active");
CREATE INDEX "MarketplaceFileProfile_marketplace_importPurpose_active_idx" ON "MarketplaceFileProfile"("marketplace", "importPurpose", "active");

ALTER TABLE "UploadBatch" ADD COLUMN "fileProfileId" TEXT;
CREATE INDEX "UploadBatch_fileProfileId_idx" ON "UploadBatch"("fileProfileId");
ALTER TABLE "MarketplaceFileProfile" ADD CONSTRAINT "MarketplaceFileProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_fileProfileId_fkey" FOREIGN KEY ("fileProfileId") REFERENCES "MarketplaceFileProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkChangeEvent" (
  "id" SERIAL NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "stage" "WorkStage",
  "groupKey" TEXT,
  "entityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkChangeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkChangeEvent_accountId_id_idx" ON "WorkChangeEvent"("accountId", "id");
CREATE INDEX "WorkChangeEvent_accountId_stage_id_idx" ON "WorkChangeEvent"("accountId", "stage", "id");
ALTER TABLE "WorkChangeEvent" ADD CONSTRAINT "WorkChangeEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
