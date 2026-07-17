CREATE TABLE "WorkGroupProjection" (
  "groupKey" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "sourceBatchId" TEXT NOT NULL,
  "marketplace" TEXT NOT NULL,
  "sellerSku" TEXT NOT NULL,
  "variantHash" TEXT NOT NULL,
  "instructionHash" TEXT NOT NULL,
  "routeHash" TEXT NOT NULL,
  "assignmentKey" TEXT NOT NULL,
  "assignedUserId" TEXT,
  "assignedUserName" TEXT,
  "productTitle" TEXT,
  "productImageUrl" TEXT,
  "operationalIdentifier" TEXT,
  "reference" TEXT NOT NULL,
  "memberCount" INTEGER NOT NULL,
  "requiredQuantity" INTEGER NOT NULL,
  "completedQuantity" INTEGER NOT NULL,
  "completeMemberCount" INTEGER NOT NULL DEFAULT 0,
  "partialMemberCount" INTEGER NOT NULL DEFAULT 0,
  "problemCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "oldestWaitingAt" DATETIME NOT NULL,
  "recommendedNextStage" TEXT,
  "hasExplicitSavedRoute" BOOLEAN NOT NULL DEFAULT false,
  "savedProcessRoute" TEXT,
  "groupVersion" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkGroupProjection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "WorkGroupMember" (
  "groupKey" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  CONSTRAINT "WorkGroupMember_pkey" PRIMARY KEY ("groupKey", "taskId"),
  CONSTRAINT "WorkGroupMember_groupKey_fkey" FOREIGN KEY ("groupKey") REFERENCES "WorkGroupProjection" ("groupKey") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkGroupMember_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkGroupProjection_account_stage_source_status_assignment_oldest_idx" ON "WorkGroupProjection"("accountId", "stage", "sourceType", "status", "assignmentKey", "oldestWaitingAt");
CREATE INDEX "WorkGroupProjection_account_stage_source_version_idx" ON "WorkGroupProjection"("accountId", "stage", "sourceType", "groupVersion");
CREATE INDEX "WorkGroupProjection_assigned_pagination_idx" ON "WorkGroupProjection"("accountId", "stage", "sourceType", "assignedUserId", "oldestWaitingAt", "groupKey");
CREATE INDEX "WorkGroupProjection_account_sku_stage_idx" ON "WorkGroupProjection"("accountId", "sellerSku", "stage");
CREATE UNIQUE INDEX "WorkGroupMember_taskId_key" ON "WorkGroupMember"("taskId");
CREATE INDEX "WorkGroupMember_groupKey_idx" ON "WorkGroupMember"("groupKey");
CREATE INDEX "WorkChangeEvent_accountId_createdAt_idx" ON "WorkChangeEvent"("accountId", "createdAt");
