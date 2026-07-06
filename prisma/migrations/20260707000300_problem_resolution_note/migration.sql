ALTER TABLE "ProblemOrder" ADD COLUMN "resolutionNote" TEXT;

CREATE INDEX "ProblemOrder_accountId_status_createdAt_idx" ON "ProblemOrder"("accountId", "status", "createdAt");
