CREATE TABLE "WorkRouteDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "taskId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sellerSku" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "savedRoute" TEXT,
  "savedNextStage" TEXT,
  "selectedNextStage" TEXT,
  "decisionType" TEXT NOT NULL,
  "reason" TEXT,
  "workerNote" TEXT,
  "missingInstructionStage" TEXT,
  "actorUserId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkRouteDecision_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkRouteDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkRouteDecision_accountId_createdAt_idx" ON "WorkRouteDecision"("accountId","createdAt");
CREATE INDEX "WorkRouteDecision_accountId_decisionType_createdAt_idx" ON "WorkRouteDecision"("accountId","decisionType","createdAt");
CREATE INDEX "WorkRouteDecision_accountId_sellerSku_createdAt_idx" ON "WorkRouteDecision"("accountId","sellerSku","createdAt");
CREATE INDEX "WorkRouteDecision_missingInstructionStage_createdAt_idx" ON "WorkRouteDecision"("missingInstructionStage","createdAt");
