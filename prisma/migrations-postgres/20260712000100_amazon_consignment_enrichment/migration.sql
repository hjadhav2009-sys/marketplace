ALTER TYPE "ConsignmentLineMatchStatus" ADD VALUE IF NOT EXISTS 'EXACT_FNSKU';
ALTER TYPE "ConsignmentLineMatchStatus" ADD VALUE IF NOT EXISTS 'EXACT_ASIN';
ALTER TYPE "ConsignmentLineMatchStatus" ADD VALUE IF NOT EXISTS 'EXACT_EXTERNAL_ID';
ALTER TYPE "ConsignmentLineMatchStatus" ADD VALUE IF NOT EXISTS 'EXACT_BARCODE';

ALTER TYPE "ConsignmentImportFileType" ADD VALUE IF NOT EXISTS 'AMAZON_SHIPMENT';
ALTER TYPE "ConsignmentImportFileType" ADD VALUE IF NOT EXISTS 'AMAZON_ALL_LISTINGS';
ALTER TYPE "ConsignmentImportFileType" ADD VALUE IF NOT EXISTS 'AMAZON_CATEGORY_CATALOG';
ALTER TYPE "ConsignmentImportFileType" ADD VALUE IF NOT EXISTS 'AMAZON_PRODUCT_CATALOG';
ALTER TYPE "ConsignmentImportFileType" ADD VALUE IF NOT EXISTS 'AMAZON_SUPPORTING';

ALTER TABLE "ConsignmentLine"
  ADD COLUMN "asinSource" TEXT,
  ADD COLUMN "fnskuSource" TEXT,
  ADD COLUMN "externalIdSource" TEXT,
  ADD COLUMN "barcodeSource" TEXT,
  ADD COLUMN "asinSnapshot" TEXT,
  ADD COLUMN "fnskuSnapshot" TEXT,
  ADD COLUMN "externalIdSnapshot" TEXT,
  ADD COLUMN "barcodeSnapshot" TEXT,
  ADD COLUMN "catalogSnapshotJson" TEXT;

CREATE INDEX "ConsignmentLine_accountId_asinSnapshot_idx" ON "ConsignmentLine"("accountId", "asinSnapshot");
CREATE INDEX "ConsignmentLine_accountId_fnskuSnapshot_idx" ON "ConsignmentLine"("accountId", "fnskuSnapshot");
CREATE INDEX "ConsignmentLine_accountId_externalIdSnapshot_idx" ON "ConsignmentLine"("accountId", "externalIdSnapshot");
CREATE INDEX "ConsignmentLine_accountId_sellerSkuSnapshot_idx" ON "ConsignmentLine"("accountId", "sellerSkuSnapshot");
CREATE INDEX "ConsignmentLine_consignmentBatchId_asinSnapshot_idx" ON "ConsignmentLine"("consignmentBatchId", "asinSnapshot");
CREATE INDEX "ConsignmentLine_consignmentBatchId_fnskuSnapshot_idx" ON "ConsignmentLine"("consignmentBatchId", "fnskuSnapshot");
