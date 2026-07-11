ALTER TYPE "ConsignmentLineMatchStatus" ADD VALUE IF NOT EXISTS 'OWNER_SELECTED';
ALTER TYPE "ConsignmentImportFileType" ADD VALUE IF NOT EXISTS 'SOURCE_UPLOAD';
CREATE TYPE "WorkActionType" AS ENUM ('TASK_CLAIMED','TASK_STARTED','TASK_PROGRESS_SET','TASK_INCREMENTED','TASK_COMPLETED','TASK_PROBLEM_REPORTED','TASK_PROBLEM_RESOLVED','MARKING_FILE_DOWNLOADED','MARKING_PREVIEW_OPENED','TASK_UNASSIGNED','TASK_REASSIGNED');

ALTER TABLE "ConsignmentBatch" ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "completedByUserId" TEXT;
ALTER TABLE "ConsignmentLine" ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "completedByUserId" TEXT;
ALTER TABLE "ConsignmentImportFile" ADD COLUMN "isCurrentSource" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "WorkTask"
 ADD COLUMN "problemReportedAt" TIMESTAMP(3),
 ADD COLUMN "problemReportedByUserId" TEXT,
 ADD COLUMN "problemResolutionNote" TEXT,
 ADD COLUMN "problemResolvedAt" TIMESTAMP(3),
 ADD COLUMN "problemResolvedByUserId" TEXT,
 ADD COLUMN "statusBeforeProblem" "WorkTaskStatus";

ALTER TABLE "ConsignmentBatch" ADD CONSTRAINT "ConsignmentBatch_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignmentLine" ADD CONSTRAINT "ConsignmentLine_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkTask"
 ADD CONSTRAINT "WorkTask_problemReportedByUserId_fkey" FOREIGN KEY ("problemReportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 ADD CONSTRAINT "WorkTask_problemResolvedByUserId_fkey" FOREIGN KEY ("problemResolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 ADD CONSTRAINT "WorkTask_completed_check" CHECK ("status"<>'COMPLETED' OR ("completedAt" IS NOT NULL AND "completedQuantity"="requiredQuantity")),
 ADD CONSTRAINT "WorkTask_problem_check" CHECK ("status"<>'PROBLEM' OR ("problemReason" IS NOT NULL AND length(trim("problemReason"))>0));

CREATE TABLE "WorkActionLog" (
 "id" TEXT NOT NULL,
 "accountId" TEXT NOT NULL,
 "taskId" TEXT NOT NULL,
 "actorUserId" TEXT NOT NULL,
 "action" "WorkActionType" NOT NULL,
 "quantityBefore" INTEGER,
 "quantityAfter" INTEGER,
 "clientRequestId" TEXT,
 "note" TEXT,
 "metadataJson" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkActionLog_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "WorkActionLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "WorkActionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "WorkActionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkActionLog_task_request_key" ON "WorkActionLog"("taskId","clientRequestId");
CREATE INDEX "WorkActionLog_account_created_idx" ON "WorkActionLog"("accountId","createdAt");
CREATE INDEX "WorkActionLog_task_created_idx" ON "WorkActionLog"("taskId","createdAt");
CREATE INDEX "WorkActionLog_actor_created_idx" ON "WorkActionLog"("actorUserId","createdAt");
CREATE INDEX "WorkTask_account_source_stage_status_idx" ON "WorkTask"("accountId","sourceType","stage","status");
CREATE INDEX "WorkTask_account_assignee_stage_status_idx" ON "WorkTask"("accountId","assignedUserId","stage","status");
CREATE INDEX "WorkTask_line_stage_status_idx" ON "WorkTask"("consignmentLineId","stage","status");
CREATE INDEX "ConsignmentLine_batch_completed_idx" ON "ConsignmentLine"("consignmentBatchId","completedAt");
CREATE UNIQUE INDEX "ConsignmentImportFile_one_current_source_key" ON "ConsignmentImportFile"("consignmentBatchId") WHERE "isCurrentSource"=true AND "fileType"='SOURCE_UPLOAD';
