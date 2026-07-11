ALTER TABLE "User" ADD COLUMN "canViewConsignments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canImportConsignments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canManageConsignments" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ConsignmentBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL DEFAULT 'FLIPKART',
  "externalConsignmentNumber" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "destinationText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
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
  "activatedAt" DATETIME,
  "activatedByUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ConsignmentBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentBatch_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentBatch_marketplace_check" CHECK ("marketplace" = 'FLIPKART'),
  CONSTRAINT "ConsignmentBatch_quantity_check" CHECK ("totalSourceRows" >= 0 AND "totalValidLines" >= 0 AND "totalRequiredQuantity" >= 0)
);

CREATE TABLE "ConsignmentLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "costPriceReference" REAL,
  "lengthCmReference" REAL,
  "breadthCmReference" REAL,
  "heightCmReference" REAL,
  "weightKgReference" REAL,
  "marketplaceListingId" TEXT,
  "matchStatus" TEXT NOT NULL,
  "matchIdentifierType" TEXT,
  "matchIdentifierValue" TEXT,
  "matchMessage" TEXT,
  "processRoute" TEXT,
  "processRuleId" TEXT,
  "markingAssetId" TEXT,
  "productTitleSnapshot" TEXT,
  "productImageSnapshot" TEXT,
  "sellerSkuSnapshot" TEXT,
  "fsnSnapshot" TEXT,
  "listingIdSnapshot" TEXT,
  "activated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ConsignmentLine_batch_fkey" FOREIGN KEY ("consignmentBatchId") REFERENCES "ConsignmentBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentLine_account_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentLine_listing_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentLine_rule_fkey" FOREIGN KEY ("processRuleId") REFERENCES "ProductProcessRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentLine_asset_fkey" FOREIGN KEY ("markingAssetId") REFERENCES "MarkingAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
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
  "id" TEXT NOT NULL PRIMARY KEY,
  "consignmentBatchId" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "managedRelativePath" TEXT,
  "fileSizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "entryName" TEXT,
  "parsed" BOOLEAN NOT NULL DEFAULT false,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentImportFile_batch_fkey" FOREIGN KEY ("consignmentBatchId") REFERENCES "ConsignmentBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentImportFile_size_check" CHECK ("fileSizeBytes" >= 0 AND "rowCount" >= 0)
);

CREATE TABLE "ConsignmentImportIssue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "consignmentBatchId" TEXT NOT NULL,
  "consignmentLineId" TEXT,
  "rowNumber" INTEGER,
  "issueType" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "safeDataJson" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedByUserId" TEXT,
  "resolvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentImportIssue_batch_fkey" FOREIGN KEY ("consignmentBatchId") REFERENCES "ConsignmentBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentImportIssue_line_fkey" FOREIGN KEY ("consignmentLineId") REFERENCES "ConsignmentLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentImportIssue_user_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentImportIssue_row_check" CHECK ("rowNumber" IS NULL OR "rowNumber" > 0),
  CONSTRAINT "ConsignmentImportIssue_severity_check" CHECK ("severity" IN ('INFO','WARNING','ERROR'))
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkTask" (
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
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_consignmentLineId_fkey" FOREIGN KEY ("consignmentLineId") REFERENCES "ConsignmentLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_source_check" CHECK (
    ("sourceType" = 'ORDER' AND "orderId" IS NOT NULL AND "consignmentLineId" IS NULL) OR
    ("sourceType" = 'CONSIGNMENT' AND "consignmentLineId" IS NOT NULL AND "orderId" IS NULL)
  ),
  CONSTRAINT "WorkTask_quantity_check" CHECK ("requiredQuantity" > 0 AND "completedQuantity" >= 0 AND "completedQuantity" <= "requiredQuantity"),
  CONSTRAINT "WorkTask_sequence_check" CHECK ("sequenceNumber" > 0)
);

INSERT INTO "new_WorkTask" SELECT * FROM "WorkTask"
WHERE (("sourceType" = 'ORDER' AND "orderId" IS NOT NULL AND "consignmentLineId" IS NULL)
  OR ("sourceType" = 'CONSIGNMENT' AND "consignmentLineId" IS NOT NULL AND "orderId" IS NULL))
  AND "requiredQuantity" > 0 AND "completedQuantity" >= 0
  AND "completedQuantity" <= "requiredQuantity" AND "sequenceNumber" > 0;

DROP TABLE "WorkTask";
ALTER TABLE "new_WorkTask" RENAME TO "WorkTask";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
CREATE INDEX "WorkTask_accountId_status_stage_idx" ON "WorkTask"("accountId", "status", "stage");
CREATE INDEX "WorkTask_assignedUserId_status_stage_idx" ON "WorkTask"("assignedUserId", "status", "stage");
CREATE INDEX "WorkTask_orderId_stage_idx" ON "WorkTask"("orderId", "stage");
CREATE INDEX "WorkTask_sourceType_consignmentLineId_idx" ON "WorkTask"("sourceType", "consignmentLineId");
CREATE UNIQUE INDEX "WorkTask_orderId_stage_key" ON "WorkTask"("orderId", "stage");
CREATE UNIQUE INDEX "WorkTask_orderId_sequenceNumber_key" ON "WorkTask"("orderId", "sequenceNumber");
CREATE UNIQUE INDEX "WorkTask_consignmentLineId_stage_key" ON "WorkTask"("consignmentLineId", "stage");
CREATE UNIQUE INDEX "WorkTask_consignmentLineId_sequenceNumber_key" ON "WorkTask"("consignmentLineId", "sequenceNumber");
