CREATE TABLE "WorkRouteDecision" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "taskId" TEXT,
  "sourceType" "WorkSourceType" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sellerSku" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "savedRoute" "ProcessRoute",
  "savedNextStage" "WorkStage",
  "selectedNextStage" "WorkStage",
  "decisionType" TEXT NOT NULL,
  "reason" TEXT,
  "workerNote" TEXT,
  "missingInstructionStage" "WorkStage",
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkRouteDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkRouteDecision_accountId_createdAt_idx" ON "WorkRouteDecision"("accountId","createdAt");
CREATE INDEX "WorkRouteDecision_accountId_decisionType_createdAt_idx" ON "WorkRouteDecision"("accountId","decisionType","createdAt");
CREATE INDEX "WorkRouteDecision_accountId_sellerSku_createdAt_idx" ON "WorkRouteDecision"("accountId","sellerSku","createdAt");
CREATE INDEX "WorkRouteDecision_missingInstructionStage_createdAt_idx" ON "WorkRouteDecision"("missingInstructionStage","createdAt");
ALTER TABLE "WorkRouteDecision" ADD CONSTRAINT "WorkRouteDecision_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkRouteDecision" ADD CONSTRAINT "WorkRouteDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
