ALTER TABLE "ImportJob" ADD COLUMN "runnerId" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "ImportJob" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "ImportJob" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN "checkpointJson" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "currentEntryId" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "currentChunk" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN "mergeCompletedEntryIdsJson" TEXT;

ALTER TABLE "MarketplaceListing" ADD COLUMN "fieldProvenanceJson" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN "manualLocksJson" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN "imageCacheStaleAt" DATETIME;

CREATE INDEX "ImportJob_status_leaseExpiresAt_idx" ON "ImportJob"("status", "leaseExpiresAt");

CREATE TABLE "WorkProjectionState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'READY',
  "lastAppliedTaskVersion" INTEGER NOT NULL DEFAULT 0,
  "rebuildLeaseOwner" TEXT,
  "rebuildLeaseExpiresAt" DATETIME,
  "errorSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkProjectionState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkProjectionState_accountId_sourceType_stage_key" ON "WorkProjectionState"("accountId", "sourceType", "stage");
CREATE INDEX "WorkProjectionState_state_updatedAt_idx" ON "WorkProjectionState"("state", "updatedAt");
