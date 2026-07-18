CREATE TABLE "WorkflowActionReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "requestKind" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "stage" TEXT,
    "originalGroupKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "resultJson" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowActionReceipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowActionReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "WorkRouteDecisionRejection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "taskId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "stage" TEXT NOT NULL,
    "requestFingerprint" TEXT,
    "rejectionType" TEXT NOT NULL,
    "safeMessage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkRouteDecisionRejection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkRouteDecisionRejection_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkflowActionReceipt_accountId_actorUserId_requestKind_clientRequestId_key" ON "WorkflowActionReceipt"("accountId", "actorUserId", "requestKind", "clientRequestId");
CREATE INDEX "WorkflowActionReceipt_accountId_createdAt_idx" ON "WorkflowActionReceipt"("accountId", "createdAt");
CREATE INDEX "WorkflowActionReceipt_accountId_originalGroupKey_idx" ON "WorkflowActionReceipt"("accountId", "originalGroupKey");
CREATE INDEX "WorkRouteDecisionRejection_accountId_createdAt_idx" ON "WorkRouteDecisionRejection"("accountId", "createdAt");
CREATE INDEX "WorkRouteDecisionRejection_accountId_rejectionType_createdAt_idx" ON "WorkRouteDecisionRejection"("accountId", "rejectionType", "createdAt");
