CREATE TYPE "ConsignmentStatus" AS ENUM ('DRAFT','PARSING','REVIEW_REQUIRED','READY_TO_ACTIVATE','ACTIVATING','ACTIVE','COMPLETED','PROBLEM','CANCELLED','FAILED');
CREATE TYPE "ConsignmentLineMatchStatus" AS ENUM ('EXACT_SKU','EXACT_FSN','EXACT_MULTIPLE','IDENTIFIER_CONFLICT','NOT_FOUND','INVALID');
CREATE TYPE "ConsignmentImportFileType" AS ENUM ('CONSIGNMENT_DETAILS','LABEL_REQUIREMENTS','QUALITY_CHECK_REFERENCE','README','UNKNOWN_SUPPORTING');
CREATE TYPE "ConsignmentIssueSeverity" AS ENUM ('INFO','WARNING','ERROR');

ALTER TABLE "User" ADD COLUMN "canViewConsignments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canImportConsignments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canManageConsignments" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ConsignmentBatch" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "marketplace" "Marketplace" NOT NULL DEFAULT 'FLIPKART',
  "externalConsignmentNumber" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "destinationText" TEXT,
  "status" "ConsignmentStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceFileName" TEXT NOT NULL,
  "sourceFileSha256" TEXT NOT NULL,
  "sourceUploadRelativePath" TEXT,
  "totalSourceRows" INTEGER NOT NULL DEFAULT 0,
  "totalValidLines" INTEGER NOT NULL DEFAULT 0,
  "totalRequiredQuantity" INTEGER NOT NULL DEFAULT 0,
  "matchedLines" INTEGER NOT NULL DEFAULT 0,
  "unmatchedLines" INTEGER NOT NULL DEFAULT 0,
  "ambiguousLines" INTEGER NOT NULL DEFAULT 0,
  "conflictLines" INTEGER NOT NULL DEFAULT 0,
  "markingLines" INTEGER NOT NULL DEFAULT 0,
  "readyMadeLines" INTEGER NOT NULL DEFAULT 0,
  "activatedAt" TIMESTAMP(3),
  "activatedByUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsignmentBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsignmentBatch_marketplace_check" CHECK ("marketplace" = 'FLIPKART'),
  CONSTRAINT "ConsignmentBatch_quantity_check" CHECK ("totalSourceRows" >= 0 AND "totalValidLines" >= 0 AND "totalRequiredQuantity" >= 0)
);

CREATE TABLE "ConsignmentLine" (
  "id" TEXT NOT NULL,
  "consignmentBatchId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "productNameSource" TEXT,
  "sellerSkuSource" TEXT,
  "fsnSource" TEXT,
  "brandSource" TEXT,
  "sizeSource" TEXT,
  "colorSource" TEXT,
  "modelIdSource" TEXT,
  "requiredQuantity" INTEGER NOT NULL,
  "costPriceReference" DOUBLE PRECISION,
  "lengthCmReference" DOUBLE PRECISION,
  "breadthCmReference" DOUBLE PRECISION,
  "heightCmReference" DOUBLE PRECISION,
  "weightKgReference" DOUBLE PRECISION,
  "marketplaceListingId" TEXT,
  "matchStatus" "ConsignmentLineMatchStatus" NOT NULL,
  "matchIdentifierType" "IdentifierType",
  "matchIdentifierValue" TEXT,
  "matchMessage" TEXT,
  "processRoute" "ProcessRoute",
  "processRuleId" TEXT,
  "markingAssetId" TEXT,
  "productTitleSnapshot" TEXT,
  "productImageSnapshot" TEXT,
  "sellerSkuSnapshot" TEXT,
  "fsnSnapshot" TEXT,
  "listingIdSnapshot" TEXT,
  "activated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsignmentLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsignmentLine_quantity_check" CHECK ("requiredQuantity" > 0),
  CONSTRAINT "ConsignmentLine_reference_check" CHECK (
    ("costPriceReference" IS NULL OR "costPriceReference" >= 0) AND
    ("lengthCmReference" IS NULL OR "lengthCmReference" >= 0) AND
    ("breadthCmReference" IS NULL OR "breadthCmReference" >= 0) AND
    ("heightCmReference" IS NULL OR "heightCmReference" >= 0) AND
    ("weightKgReference" IS NULL OR "weightKgReference" >= 0)
  )
);

CREATE TABLE "ConsignmentImportFile" (
  "id" TEXT NOT NULL,
  "consignmentBatchId" TEXT NOT NULL,
  "fileType" "ConsignmentImportFileType" NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "managedRelativePath" TEXT,
  "fileSizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "entryName" TEXT,
  "parsed" BOOLEAN NOT NULL DEFAULT false,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentImportFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsignmentImportFile_size_check" CHECK ("fileSizeBytes" >= 0 AND "rowCount" >= 0)
);

CREATE TABLE "ConsignmentImportIssue" (
  "id" TEXT NOT NULL,
  "consignmentBatchId" TEXT NOT NULL,
  "consignmentLineId" TEXT,
  "rowNumber" INTEGER,
  "issueType" TEXT NOT NULL,
  "severity" "ConsignmentIssueSeverity" NOT NULL,
  "message" TEXT NOT NULL,
  "safeDataJson" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentImportIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsignmentImportIssue_row_check" CHECK ("rowNumber" IS NULL OR "rowNumber" > 0)
);

ALTER TABLE "WorkTask" DROP CONSTRAINT "WorkTask_orderId_fkey";
ALTER TABLE "WorkTask"
  ADD CONSTRAINT "WorkTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkTask_consignmentLineId_fkey" FOREIGN KEY ("consignmentLineId") REFERENCES "ConsignmentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkTask_source_check" CHECK (
    ("sourceType" = 'ORDER' AND "orderId" IS NOT NULL AND "consignmentLineId" IS NULL) OR
    ("sourceType" = 'CONSIGNMENT' AND "consignmentLineId" IS NOT NULL AND "orderId" IS NULL)
  ),
  ADD CONSTRAINT "WorkTask_quantity_check" CHECK ("requiredQuantity" > 0 AND "completedQuantity" >= 0 AND "completedQuantity" <= "requiredQuantity"),
  ADD CONSTRAINT "WorkTask_sequence_check" CHECK ("sequenceNumber" > 0);

ALTER TABLE "ConsignmentBatch"
  ADD CONSTRAINT "ConsignmentBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentBatch_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsignmentLine"
  ADD CONSTRAINT "ConsignmentLine_batch_fkey" FOREIGN KEY ("consignmentBatchId") REFERENCES "ConsignmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentLine_account_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentLine_listing_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentLine_rule_fkey" FOREIGN KEY ("processRuleId") REFERENCES "ProductProcessRule"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentLine_asset_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsignmentImportFile" ADD CONSTRAINT "ConsignmentImportFile_batch_fkey" FOREIGN KEY ("consignmentBatchId") REFERENCES "ConsignmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsignmentImportIssue"
  ADD CONSTRAINT "ConsignmentImportIssue_batch_fkey" FOREIGN KEY ("consignmentBatchId") REFERENCES "ConsignmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentImportIssue_line_fkey" FOREIGN KEY ("consignmentLineId") REFERENCES "ConsignmentLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsignmentImportIssue_user_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ConsignmentBatch_account_marketplace_number_key" ON "ConsignmentBatch"("accountId", "marketplace", "externalConsignmentNumber");
CREATE INDEX "ConsignmentBatch_account_status_created_idx" ON "ConsignmentBatch"("accountId", "status", "createdAt");
CREATE INDEX "ConsignmentBatch_account_hash_idx" ON "ConsignmentBatch"("accountId", "sourceFileSha256");
CREATE UNIQUE INDEX "ConsignmentLine_batch_row_key" ON "ConsignmentLine"("consignmentBatchId", "rowNumber");
CREATE INDEX "ConsignmentLine_account_match_idx" ON "ConsignmentLine"("accountId", "matchStatus");
CREATE INDEX "ConsignmentLine_batch_route_idx" ON "ConsignmentLine"("consignmentBatchId", "processRoute");
CREATE INDEX "ConsignmentLine_listing_idx" ON "ConsignmentLine"("marketplaceListingId");
CREATE INDEX "ConsignmentImportFile_batch_type_idx" ON "ConsignmentImportFile"("consignmentBatchId", "fileType");
CREATE INDEX "ConsignmentImportFile_sha_idx" ON "ConsignmentImportFile"("sha256");
CREATE INDEX "ConsignmentImportIssue_batch_severity_resolved_idx" ON "ConsignmentImportIssue"("consignmentBatchId", "severity", "resolved");
CREATE INDEX "ConsignmentImportIssue_line_idx" ON "ConsignmentImportIssue"("consignmentLineId");
CREATE INDEX "ConsignmentImportIssue_type_created_idx" ON "ConsignmentImportIssue"("issueType", "createdAt");
CREATE UNIQUE INDEX "WorkTask_orderId_stage_key" ON "WorkTask"("orderId", "stage");
CREATE UNIQUE INDEX "WorkTask_orderId_sequenceNumber_key" ON "WorkTask"("orderId", "sequenceNumber");
CREATE UNIQUE INDEX "WorkTask_consignmentLineId_stage_key" ON "WorkTask"("consignmentLineId", "stage");
CREATE UNIQUE INDEX "WorkTask_consignmentLineId_sequenceNumber_key" ON "WorkTask"("consignmentLineId", "sequenceNumber");
