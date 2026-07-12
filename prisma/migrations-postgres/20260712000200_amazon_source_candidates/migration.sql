ALTER TABLE "ConsignmentImportFile"
  ADD COLUMN "candidateTablesJson" TEXT,
  ADD COLUMN "selectedTableName" TEXT;

CREATE INDEX "ConsignmentLine_accountId_barcodeSnapshot_idx" ON "ConsignmentLine"("accountId", "barcodeSnapshot");
