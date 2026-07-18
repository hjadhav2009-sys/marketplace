-- Phase 7.3.6: additive projection/import counters, privacy-safe issues and dynamic catalog forms.
ALTER TABLE "UploadBatch" ADD COLUMN "alreadyImportedRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "repeatedSourceRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "informationRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "warningRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "blockingErrorRows" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "MarketplaceFileProfile" ADD COLUMN "formSchemaJson" TEXT,
  ADD COLUMN "technicalHeaderFingerprint" TEXT,
  ADD COLUMN "humanHeaderFingerprint" TEXT,
  ADD COLUMN "templateKind" TEXT,
  ADD COLUMN "productTypesJson" TEXT,
  ADD COLUMN "fieldGroupsJson" TEXT;

ALTER TABLE "ImportRowIssue" ADD COLUMN "safeDataJson" TEXT,
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'WARNING',
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "resolutionAction" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "ImportRowIssue_batchId_severity_resolved_idx" ON "ImportRowIssue"("batchId", "severity", "resolved");
CREATE INDEX "ImportRowIssue_sourceType_sourceId_resolved_idx" ON "ImportRowIssue"("sourceType", "sourceId", "resolved");

CREATE TABLE "MarketplaceListingAttribute" (
  "id" TEXT NOT NULL,
  "marketplaceListingId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "marketplace" "Marketplace" NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceListingAttribute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceListingAttribute_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceListingAttribute_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketplaceListingAttribute_marketplaceListingId_technicalKey_key" ON "MarketplaceListingAttribute"("marketplaceListingId", "technicalKey");
CREATE INDEX "MarketplaceListingAttribute_accountId_marketplace_technicalKey_idx" ON "MarketplaceListingAttribute"("accountId", "marketplace", "technicalKey");
CREATE INDEX "MarketplaceListingAttribute_accountId_valueText_idx" ON "MarketplaceListingAttribute"("accountId", "valueText");
