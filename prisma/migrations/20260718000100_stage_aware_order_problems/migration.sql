ALTER TABLE "ProblemOrder" ADD COLUMN "interruptedStage" TEXT;
ALTER TABLE "ProblemOrder" ADD COLUMN "workTaskId" TEXT;
ALTER TABLE "ProblemOrder" ADD COLUMN "taskStatusBefore" TEXT;
ALTER TABLE "ProblemOrder" ADD COLUMN "orderStatusBefore" TEXT;
ALTER TABLE "ProblemOrder" ADD COLUMN "pickStatusBefore" TEXT;
ALTER TABLE "ProblemOrder" ADD COLUMN "packStatusBefore" TEXT;
ALTER TABLE "ProblemOrder" ADD COLUMN "clientRequestId" TEXT;

CREATE INDEX "ProblemOrder_accountId_interruptedStage_status_idx" ON "ProblemOrder"("accountId", "interruptedStage", "status");
CREATE UNIQUE INDEX "ProblemOrder_accountId_reportedById_clientRequestId_key" ON "ProblemOrder"("accountId", "reportedById", "clientRequestId");
