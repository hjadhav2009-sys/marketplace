ALTER TABLE "ProblemOrder" ADD COLUMN "interruptedStage" "WorkStage";
ALTER TABLE "ProblemOrder" ADD COLUMN "workTaskId" TEXT;
ALTER TABLE "ProblemOrder" ADD COLUMN "taskStatusBefore" "WorkTaskStatus";
ALTER TABLE "ProblemOrder" ADD COLUMN "orderStatusBefore" "OrderStatus";
ALTER TABLE "ProblemOrder" ADD COLUMN "pickStatusBefore" "PickStatus";
ALTER TABLE "ProblemOrder" ADD COLUMN "packStatusBefore" "PackStatus";
ALTER TABLE "ProblemOrder" ADD COLUMN "clientRequestId" TEXT;

CREATE INDEX "ProblemOrder_accountId_interruptedStage_status_idx" ON "ProblemOrder"("accountId", "interruptedStage", "status");
CREATE UNIQUE INDEX "ProblemOrder_accountId_reportedById_clientRequestId_key" ON "ProblemOrder"("accountId", "reportedById", "clientRequestId");
