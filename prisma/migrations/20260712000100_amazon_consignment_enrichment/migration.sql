PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ConsignmentBatch" (
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
  "completedAt" DATETIME,
  "completedByUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ConsignmentBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentBatch_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentBatch_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentBatch_marketplace_check" CHECK ("marketplace" IN ('FLIPKART','AMAZON')),
  CONSTRAINT "ConsignmentBatch_quantity_check" CHECK ("totalSourceRows" >= 0 AND "totalValidLines" >= 0 AND "totalRequiredQuantity" >= 0)
);

INSERT INTO "new_ConsignmentBatch" SELECT * FROM "ConsignmentBatch";
DROP TABLE "ConsignmentBatch";
ALTER TABLE "new_ConsignmentBatch" RENAME TO "ConsignmentBatch";
CREATE UNIQUE INDEX "ConsignmentBatch_account_marketplace_number_key" ON "ConsignmentBatch"("accountId", "marketplace", "externalConsignmentNumber");
CREATE INDEX "ConsignmentBatch_account_status_created_idx" ON "ConsignmentBatch"("accountId", "status", "createdAt");
CREATE INDEX "ConsignmentBatch_account_hash_idx" ON "ConsignmentBatch"("accountId", "sourceFileSha256");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

ALTER TABLE "ConsignmentLine" ADD COLUMN "asinSource" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "fnskuSource" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "externalIdSource" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "barcodeSource" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "asinSnapshot" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "fnskuSnapshot" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "externalIdSnapshot" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "barcodeSnapshot" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "catalogSnapshotJson" TEXT;

CREATE INDEX "ConsignmentLine_accountId_asinSnapshot_idx" ON "ConsignmentLine"("accountId", "asinSnapshot");
CREATE INDEX "ConsignmentLine_accountId_fnskuSnapshot_idx" ON "ConsignmentLine"("accountId", "fnskuSnapshot");
CREATE INDEX "ConsignmentLine_accountId_externalIdSnapshot_idx" ON "ConsignmentLine"("accountId", "externalIdSnapshot");
CREATE INDEX "ConsignmentLine_accountId_sellerSkuSnapshot_idx" ON "ConsignmentLine"("accountId", "sellerSkuSnapshot");
CREATE INDEX "ConsignmentLine_consignmentBatchId_asinSnapshot_idx" ON "ConsignmentLine"("consignmentBatchId", "asinSnapshot");
CREATE INDEX "ConsignmentLine_consignmentBatchId_fnskuSnapshot_idx" ON "ConsignmentLine"("consignmentBatchId", "fnskuSnapshot");
