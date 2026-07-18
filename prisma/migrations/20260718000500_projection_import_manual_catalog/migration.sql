-- Phase 7.3.6: additive projection/import counters, privacy-safe issues and dynamic catalog forms.
ALTER TABLE "UploadBatch" ADD COLUMN "alreadyImportedRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN "repeatedSourceRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN "informationRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN "warningRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN "blockingErrorRows" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "MarketplaceFileProfile" ADD COLUMN "formSchemaJson" TEXT;
ALTER TABLE "MarketplaceFileProfile" ADD COLUMN "technicalHeaderFingerprint" TEXT;
ALTER TABLE "MarketplaceFileProfile" ADD COLUMN "humanHeaderFingerprint" TEXT;
ALTER TABLE "MarketplaceFileProfile" ADD COLUMN "templateKind" TEXT;
ALTER TABLE "MarketplaceFileProfile" ADD COLUMN "productTypesJson" TEXT;
ALTER TABLE "MarketplaceFileProfile" ADD COLUMN "fieldGroupsJson" TEXT;

ALTER TABLE "ImportRowIssue" ADD COLUMN "safeDataJson" TEXT;
ALTER TABLE "ImportRowIssue" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'WARNING';
ALTER TABLE "ImportRowIssue" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "ImportRowIssue" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "ImportRowIssue" ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ImportRowIssue" ADD COLUMN "resolvedAt" DATETIME;
ALTER TABLE "ImportRowIssue" ADD COLUMN "resolvedByUserId" TEXT;
ALTER TABLE "ImportRowIssue" ADD COLUMN "resolutionAction" TEXT;
ALTER TABLE "ImportRowIssue" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "ImportRowIssue_batchId_severity_resolved_idx" ON "ImportRowIssue"("batchId", "severity", "resolved");
CREATE INDEX "ImportRowIssue_sourceType_sourceId_resolved_idx" ON "ImportRowIssue"("sourceType", "sourceId", "resolved");

CREATE TABLE "MarketplaceListingAttribute" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "marketplaceListingId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL,
  "technicalKey" TEXT NOT NULL,
  "displayLabel" TEXT NOT NULL,
  "valueJson" TEXT NOT NULL,
  "valueText" TEXT,
  "sourceProfileId" TEXT,
  "sourceHeader" TEXT,
  "sourceAuthority" TEXT NOT NULL DEFAULT 'MANUAL_OWNER',
  "manualLocked" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MarketplaceListingAttribute_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceListingAttribute_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketplaceListingAttribute_marketplaceListingId_technicalKey_key" ON "MarketplaceListingAttribute"("marketplaceListingId", "technicalKey");
CREATE INDEX "MarketplaceListingAttribute_accountId_marketplace_technicalKey_idx" ON "MarketplaceListingAttribute"("accountId", "marketplace", "technicalKey");
CREATE INDEX "MarketplaceListingAttribute_accountId_valueText_idx" ON "MarketplaceListingAttribute"("accountId", "valueText");
