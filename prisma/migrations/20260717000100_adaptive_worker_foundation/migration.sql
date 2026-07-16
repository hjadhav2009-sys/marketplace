ALTER TABLE "WorkTask" ADD COLUMN "workCardSnapshotJson" TEXT;
ALTER TABLE "WorkTask" ADD COLUMN "routeSnapshotJson" TEXT;
ALTER TABLE "WorkTask" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "MarketplaceFileProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT,
  "marketplace" TEXT NOT NULL,
  "importPurpose" TEXT NOT NULL,
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
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MarketplaceFileProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketplaceFileProfile_marketplace_importPurpose_headerFingerprint_version_key" ON "MarketplaceFileProfile"("marketplace", "importPurpose", "headerFingerprint", "version");
CREATE INDEX "MarketplaceFileProfile_accountId_marketplace_importPurpose_active_idx" ON "MarketplaceFileProfile"("accountId", "marketplace", "importPurpose", "active");
CREATE INDEX "MarketplaceFileProfile_marketplace_importPurpose_active_idx" ON "MarketplaceFileProfile"("marketplace", "importPurpose", "active");
ALTER TABLE "UploadBatch" ADD COLUMN "fileProfileId" TEXT REFERENCES "MarketplaceFileProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "UploadBatch_fileProfileId_idx" ON "UploadBatch"("fileProfileId");

CREATE TABLE "WorkChangeEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "accountId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "stage" TEXT,
  "groupKey" TEXT,
  "entityId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkChangeEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkChangeEvent_accountId_id_idx" ON "WorkChangeEvent"("accountId", "id");
CREATE INDEX "WorkChangeEvent_accountId_stage_id_idx" ON "WorkChangeEvent"("accountId", "stage", "id");
