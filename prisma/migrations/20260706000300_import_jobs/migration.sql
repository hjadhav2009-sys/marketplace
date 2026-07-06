CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "marketplace" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "batchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "unchangedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "missingListingRows" INTEGER NOT NULL DEFAULT 0,
    "missingImageRows" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ImportJob_accountId_status_createdAt_idx" ON "ImportJob"("accountId", "status", "createdAt");
CREATE INDEX "ImportJob_accountId_importType_createdAt_idx" ON "ImportJob"("accountId", "importType", "createdAt");
CREATE INDEX "ImportJob_accountId_marketplace_importType_idx" ON "ImportJob"("accountId", "marketplace", "importType");
CREATE INDEX "ImportJob_batchId_idx" ON "ImportJob"("batchId");
