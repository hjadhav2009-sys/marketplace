CREATE TYPE "WorkSourceType" AS ENUM ('ORDER', 'CONSIGNMENT');
CREATE TYPE "WorkStage" AS ENUM ('PICK', 'MARK', 'ASSEMBLE', 'PACK');
CREATE TYPE "WorkTaskStatus" AS ENUM ('LOCKED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'PROBLEM', 'CANCELLED', 'SKIPPED');
CREATE TYPE "ProcessRoute" AS ENUM ('PICK_PACK', 'PICK_MARK_PACK', 'PICK_ASSEMBLE_PACK', 'PICK_MARK_ASSEMBLE_PACK');
CREATE TYPE "AttachmentType" AS ENUM ('MARKING_FILE', 'MARKING_PREVIEW', 'MARKING_REPORT', 'ASSEMBLY_GUIDE', 'ASSEMBLY_IMAGE', 'OTHER');
CREATE TYPE "IdentifierType" AS ENUM ('SELLER_SKU', 'INTERNAL_SKU', 'FSN', 'LISTING_ID', 'LID', 'ASIN', 'FNSKU', 'EAN', 'UPC', 'GTIN', 'MODEL_NUMBER', 'BARCODE', 'EXTERNAL_ID');

ALTER TABLE "User" ADD COLUMN "canMark" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canAssemble" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canManageMarkingLibrary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canManageProcessRules" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canViewAllWork" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MarketplaceListingIdentifier" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "marketplaceListingId" TEXT NOT NULL,
  "marketplace" "Marketplace" NOT NULL,
  "identifierType" "IdentifierType" NOT NULL,
  "rawValue" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'LISTING_IMPORT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceListingIdentifier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarkingAsset" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "masterDesignId" TEXT,
  "description" TEXT,
  "machineType" TEXT,
  "softwareName" TEXT,
  "material" TEXT,
  "markingPosition" TEXT,
  "markingWidthMm" DOUBLE PRECISION,
  "markingHeightMm" DOUBLE PRECISION,
  "powerSetting" DOUBLE PRECISION,
  "speedSetting" DOUBLE PRECISION,
  "frequencySetting" DOUBLE PRECISION,
  "passes" INTEGER,
  "instructions" TEXT,
  "settingsJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkingAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarkingAssetFile" (
  "id" TEXT NOT NULL,
  "markingAssetId" TEXT NOT NULL,
  "attachmentType" "AttachmentType" NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "managedRelativePath" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileExtension" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "activeVersion" BOOLEAN NOT NULL DEFAULT true,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkingAssetFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarkingAssetListingLink" (
  "id" TEXT NOT NULL,
  "markingAssetId" TEXT NOT NULL,
  "marketplaceListingId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "marketplace" "Marketplace" NOT NULL,
  "matchMethod" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "identifierSnapshotJson" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkingAssetListingLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductProcessRule" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "marketplaceListingId" TEXT NOT NULL,
  "route" "ProcessRoute" NOT NULL,
  "markingAssetId" TEXT,
  "markingRequired" BOOLEAN NOT NULL DEFAULT false,
  "assemblyRequired" BOOLEAN NOT NULL DEFAULT false,
  "assemblyTitle" TEXT,
  "assemblyInstructions" TEXT,
  "assemblyImageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductProcessRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTask" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "sourceType" "WorkSourceType" NOT NULL,
  "orderId" TEXT,
  "consignmentLineId" TEXT,
  "stage" "WorkStage" NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "requiredQuantity" INTEGER NOT NULL,
  "completedQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" "WorkTaskStatus" NOT NULL DEFAULT 'LOCKED',
  "assignedUserId" TEXT,
  "startedByUserId" TEXT,
  "completedByUserId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "problemReason" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketplaceListingIdentifier" ADD CONSTRAINT "MarketplaceListingIdentifier_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListingIdentifier" ADD CONSTRAINT "MarketplaceListingIdentifier_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarkingAsset" ADD CONSTRAINT "MarkingAsset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarkingAsset" ADD CONSTRAINT "MarkingAsset_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarkingAssetFile" ADD CONSTRAINT "MarkingAssetFile_markingAssetId_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarkingAssetFile" ADD CONSTRAINT "MarkingAssetFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarkingAssetListingLink" ADD CONSTRAINT "MarkingAssetListingLink_markingAssetId_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarkingAssetListingLink" ADD CONSTRAINT "MarkingAssetListingLink_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarkingAssetListingLink" ADD CONSTRAINT "MarkingAssetListingLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarkingAssetListingLink" ADD CONSTRAINT "MarkingAssetListingLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductProcessRule" ADD CONSTRAINT "ProductProcessRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductProcessRule" ADD CONSTRAINT "ProductProcessRule_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductProcessRule" ADD CONSTRAINT "ProductProcessRule_markingAssetId_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductProcessRule" ADD CONSTRAINT "ProductProcessRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductProcessRule" ADD CONSTRAINT "ProductProcessRule_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MarketplaceListingIdentifier_account_type_value_idx" ON "MarketplaceListingIdentifier"("accountId", "identifierType", "normalizedValue");
CREATE INDEX "MarketplaceListingIdentifier_listing_active_idx" ON "MarketplaceListingIdentifier"("marketplaceListingId", "active");
CREATE INDEX "MarketplaceListingIdentifier_account_marketplace_active_idx" ON "MarketplaceListingIdentifier"("accountId", "marketplace", "active");
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

INSERT INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || md5(random()::text || clock_timestamp()::text), "accountId", "id", upper("marketplace")::"Marketplace", 'SELLER_SKU', btrim("sellerSkuId"), upper(btrim("sellerSkuId")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE btrim(coalesce("sellerSkuId", '')) <> '' ON CONFLICT DO NOTHING;
INSERT INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || md5(random()::text || clock_timestamp()::text), "accountId", "id", upper("marketplace")::"Marketplace", 'INTERNAL_SKU', btrim("sku"), upper(btrim("sku")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE btrim(coalesce("sku", '')) <> '' ON CONFLICT DO NOTHING;
INSERT INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || md5(random()::text || clock_timestamp()::text), "accountId", "id", upper("marketplace")::"Marketplace", 'FSN', btrim("fsn"), upper(btrim("fsn")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE btrim(coalesce("fsn", '')) <> '' ON CONFLICT DO NOTHING;
INSERT INTO "MarketplaceListingIdentifier" ("id", "accountId", "marketplaceListingId", "marketplace", "identifierType", "rawValue", "normalizedValue", "source", "active", "createdAt", "updatedAt")
SELECT 'li_' || md5(random()::text || clock_timestamp()::text), "accountId", "id", upper("marketplace")::"Marketplace", 'LISTING_ID', btrim("listingId"), upper(btrim("listingId")), 'BACKFILL_20260711', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "MarketplaceListing" WHERE btrim(coalesce("listingId", '')) <> '' ON CONFLICT DO NOTHING;
