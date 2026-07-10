ALTER TABLE "User" ADD COLUMN "canMark" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canAssemble" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canManageMarkingLibrary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canManageProcessRules" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canViewAllWork" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MarketplaceListingIdentifier" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "marketplaceListingId" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL,
  "identifierType" TEXT NOT NULL,
  "rawValue" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'LISTING_IMPORT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceListingIdentifier_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceListingIdentifier_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarkingAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "masterDesignId" TEXT,
  "description" TEXT,
  "machineType" TEXT,
  "softwareName" TEXT,
  "material" TEXT,
  "markingPosition" TEXT,
  "markingWidthMm" REAL,
  "markingHeightMm" REAL,
  "powerSetting" REAL,
  "speedSetting" REAL,
  "frequencySetting" REAL,
  "passes" INTEGER,
  "instructions" TEXT,
  "settingsJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkingAsset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MarkingAsset_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "MarkingAssetFile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "markingAssetId" TEXT NOT NULL,
  "attachmentType" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "managedRelativePath" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileExtension" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "activeVersion" BOOLEAN NOT NULL DEFAULT true,
  "uploadedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkingAssetFile_markingAssetId_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarkingAssetFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "MarkingAssetListingLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "markingAssetId" TEXT NOT NULL,
  "marketplaceListingId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL,
  "matchMethod" TEXT NOT NULL,
  "confidence" REAL,
  "identifierSnapshotJson" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkingAssetListingLink_markingAssetId_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarkingAssetListingLink_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarkingAssetListingLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarkingAssetListingLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ProductProcessRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "marketplaceListingId" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "markingAssetId" TEXT,
  "markingRequired" BOOLEAN NOT NULL DEFAULT false,
  "assemblyRequired" BOOLEAN NOT NULL DEFAULT false,
  "assemblyTitle" TEXT,
  "assemblyInstructions" TEXT,
  "assemblyImageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductProcessRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductProcessRule_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductProcessRule_markingAssetId_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductProcessRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductProcessRule_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorkTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "orderId" TEXT,
  "consignmentLineId" TEXT,
  "stage" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "requiredQuantity" INTEGER NOT NULL,
  "completedQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'LOCKED',
  "assignedUserId" TEXT,
  "startedByUserId" TEXT,
  "completedByUserId" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "problemReason" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "MarketplaceListingIdentifier_accountId_identifierType_normalizedValue_idx" ON "MarketplaceListingIdentifier"("accountId", "identifierType", "normalizedValue");
CREATE INDEX "MarketplaceListingIdentifier_marketplaceListingId_active_idx" ON "MarketplaceListingIdentifier"("marketplaceListingId", "active");
CREATE INDEX "MarketplaceListingIdentifier_accountId_marketplace_active_idx" ON "MarketplaceListingIdentifier"("accountId", "marketplace", "active");
CREATE UNIQUE INDEX "MarketplaceListingIdentifier_listing_type_value_key" ON "MarketplaceListingIdentifier"("marketplaceListingId", "identifierType", "normalizedValue");
CREATE UNIQUE INDEX "MarkingAsset_masterDesignId_key" ON "MarkingAsset"("masterDesignId");
CREATE INDEX "MarkingAsset_active_updatedAt_idx" ON "MarkingAsset"("active", "updatedAt");
CREATE INDEX "MarkingAsset_status_active_idx" ON "MarkingAsset"("status", "active");
CREATE UNIQUE INDEX "MarkingAssetFile_asset_type_version_key" ON "MarkingAssetFile"("markingAssetId", "attachmentType", "versionNumber");
CREATE UNIQUE INDEX "MarkingAssetFile_one_active_type_key" ON "MarkingAssetFile"("markingAssetId", "attachmentType") WHERE "activeVersion" = true;
CREATE INDEX "MarkingAssetFile_asset_type_active_idx" ON "MarkingAssetFile"("markingAssetId", "attachmentType", "activeVersion");
CREATE INDEX "MarkingAssetFile_sha256_idx" ON "MarkingAssetFile"("sha256");
CREATE UNIQUE INDEX "MarkingAssetListingLink_asset_listing_key" ON "MarkingAssetListingLink"("markingAssetId", "marketplaceListingId");
CREATE INDEX "MarkingAssetListingLink_listing_active_idx" ON "MarkingAssetListingLink"("marketplaceListingId", "active");
CREATE INDEX "MarkingAssetListingLink_account_active_idx" ON "MarkingAssetListingLink"("accountId", "active");
CREATE UNIQUE INDEX "ProductProcessRule_one_active_listing_key" ON "ProductProcessRule"("marketplaceListingId") WHERE "active" = true;
CREATE INDEX "ProductProcessRule_account_active_idx" ON "ProductProcessRule"("accountId", "active");
CREATE INDEX "ProductProcessRule_listing_active_idx" ON "ProductProcessRule"("marketplaceListingId", "active");
CREATE INDEX "ProductProcessRule_asset_active_idx" ON "ProductProcessRule"("markingAssetId", "active");
CREATE INDEX "WorkTask_account_status_stage_idx" ON "WorkTask"("accountId", "status", "stage");
CREATE INDEX "WorkTask_assigned_status_stage_idx" ON "WorkTask"("assignedUserId", "status", "stage");
CREATE INDEX "WorkTask_order_stage_idx" ON "WorkTask"("orderId", "stage");
CREATE INDEX "WorkTask_source_consignment_idx" ON "WorkTask"("sourceType", "consignmentLineId");

INSERT OR IGNORE INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || lower(hex(randomblob(16))), "accountId", "id", upper("marketplace"), 'SELLER_SKU', trim("sellerSkuId"), upper(trim("sellerSkuId")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE trim(coalesce("sellerSkuId", '')) <> '';
INSERT OR IGNORE INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || lower(hex(randomblob(16))), "accountId", "id", upper("marketplace"), 'INTERNAL_SKU', trim("sku"), upper(trim("sku")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE trim(coalesce("sku", '')) <> '';
INSERT OR IGNORE INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || lower(hex(randomblob(16))), "accountId", "id", upper("marketplace"), 'FSN', trim("fsn"), upper(trim("fsn")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE trim(coalesce("fsn", '')) <> '';
INSERT OR IGNORE INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || lower(hex(randomblob(16))), "accountId", "id", upper("marketplace"), 'LISTING_ID', trim("listingId"), upper(trim("listingId")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE trim(coalesce("listingId", '')) <> '';
