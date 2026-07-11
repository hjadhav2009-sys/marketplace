ALTER TABLE "ConsignmentBatch" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "ConsignmentBatch" ADD COLUMN "completedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignmentLine" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "ConsignmentLine" ADD COLUMN "completedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignmentImportFile" ADD COLUMN "isCurrentSource" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConsignmentImportFile" ADD COLUMN "supersededAt" DATETIME;

INSERT OR IGNORE INTO "ConsignmentImportFile" (
  "id","consignmentBatchId","fileType","originalFileName","managedRelativePath","fileSizeBytes","sha256","parsed","isCurrentSource","rowCount","notes","createdAt"
)
SELECT 'cif_source_' || "id","id",'SOURCE_UPLOAD',"sourceFileName","sourceUploadRelativePath",0,"sourceFileSha256",false,true,0,'Backfilled retained source upload',CURRENT_TIMESTAMP
FROM "ConsignmentBatch" WHERE "sourceUploadRelativePath" IS NOT NULL;

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
  "problemReportedAt" DATETIME,
  "problemReportedByUserId" TEXT,
  "problemResolutionNote" TEXT,
  "problemResolvedAt" DATETIME,
  "problemResolvedByUserId" TEXT,
  "statusBeforeProblem" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_consignmentLineId_fkey" FOREIGN KEY ("consignmentLineId") REFERENCES "ConsignmentLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_problemReportedByUserId_fkey" FOREIGN KEY ("problemReportedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_problemResolvedByUserId_fkey" FOREIGN KEY ("problemResolvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_source_check" CHECK (
    ("sourceType"='ORDER' AND "orderId" IS NOT NULL AND "consignmentLineId" IS NULL) OR
    ("sourceType"='CONSIGNMENT' AND "consignmentLineId" IS NOT NULL AND "orderId" IS NULL)
  ),
  CONSTRAINT "WorkTask_quantity_check" CHECK ("requiredQuantity">0 AND "completedQuantity">=0 AND "completedQuantity"<="requiredQuantity"),
  CONSTRAINT "WorkTask_sequence_check" CHECK ("sequenceNumber">0),
  CONSTRAINT "WorkTask_completed_check" CHECK ("status"<>'COMPLETED' OR ("completedAt" IS NOT NULL AND "completedQuantity"="requiredQuantity")),
  CONSTRAINT "WorkTask_problem_check" CHECK ("status"<>'PROBLEM' OR ("problemReason" IS NOT NULL AND length(trim("problemReason"))>0))
);
INSERT INTO "new_WorkTask" (
"id","accountId","sourceType","orderId","consignmentLineId","stage","sequenceNumber","requiredQuantity","completedQuantity","status","assignedUserId","startedByUserId","completedByUserId","startedAt","completedAt","problemReason","metadataJson","createdAt","updatedAt"
)
SELECT "id","accountId","sourceType","orderId","consignmentLineId","stage","sequenceNumber","requiredQuantity","completedQuantity","status","assignedUserId","startedByUserId","completedByUserId","startedAt","completedAt","problemReason","metadataJson","createdAt","updatedAt" FROM "WorkTask"
WHERE "requiredQuantity">0 AND "completedQuantity">=0 AND "completedQuantity"<="requiredQuantity" AND "sequenceNumber">0
AND ("status"<>'COMPLETED' OR ("completedAt" IS NOT NULL AND "completedQuantity"="requiredQuantity"))
AND ("status"<>'PROBLEM' OR ("problemReason" IS NOT NULL AND length(trim("problemReason"))>0));
DROP TABLE "WorkTask";
ALTER TABLE "new_WorkTask" RENAME TO "WorkTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE TABLE "WorkActionLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "quantityBefore" INTEGER,
  "quantityAfter" INTEGER,
  "clientRequestId" TEXT,
  "note" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkActionLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkActionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkActionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkTask_orderId_stage_key" ON "WorkTask"("orderId","stage");
CREATE UNIQUE INDEX "WorkTask_orderId_sequenceNumber_key" ON "WorkTask"("orderId","sequenceNumber");
CREATE UNIQUE INDEX "WorkTask_consignmentLineId_stage_key" ON "WorkTask"("consignmentLineId","stage");
CREATE UNIQUE INDEX "WorkTask_consignmentLineId_sequenceNumber_key" ON "WorkTask"("consignmentLineId","sequenceNumber");
CREATE INDEX "WorkTask_accountId_status_stage_idx" ON "WorkTask"("accountId","status","stage");
CREATE INDEX "WorkTask_assignedUserId_status_stage_idx" ON "WorkTask"("assignedUserId","status","stage");
CREATE INDEX "WorkTask_orderId_stage_idx" ON "WorkTask"("orderId","stage");
CREATE INDEX "WorkTask_sourceType_consignmentLineId_idx" ON "WorkTask"("sourceType","consignmentLineId");
CREATE INDEX "WorkTask_account_source_stage_status_idx" ON "WorkTask"("accountId","sourceType","stage","status");
CREATE INDEX "WorkTask_account_assignee_stage_status_idx" ON "WorkTask"("accountId","assignedUserId","stage","status");
CREATE INDEX "WorkTask_line_stage_status_idx" ON "WorkTask"("consignmentLineId","stage","status");
CREATE UNIQUE INDEX "WorkActionLog_task_request_key" ON "WorkActionLog"("taskId","clientRequestId");
CREATE INDEX "WorkActionLog_account_created_idx" ON "WorkActionLog"("accountId","createdAt");
CREATE INDEX "WorkActionLog_task_created_idx" ON "WorkActionLog"("taskId","createdAt");
CREATE INDEX "WorkActionLog_actor_created_idx" ON "WorkActionLog"("actorUserId","createdAt");
CREATE INDEX "ConsignmentLine_batch_completed_idx" ON "ConsignmentLine"("consignmentBatchId","completedAt");
CREATE UNIQUE INDEX "ConsignmentImportFile_one_current_source_key" ON "ConsignmentImportFile"("consignmentBatchId") WHERE "isCurrentSource"=true AND "fileType"='SOURCE_UPLOAD';
