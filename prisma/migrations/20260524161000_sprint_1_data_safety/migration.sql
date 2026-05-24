-- CreateTable
CREATE TABLE "UserDeviceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserDeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportRowIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "issueType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportRowIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "uploadBatchId" TEXT,
    "awb" TEXT NOT NULL,
    "courier" TEXT,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT,
    "size" TEXT,
    "orderNumber" TEXT NOT NULL,
    "productDescription" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "imageUrl" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pickStatus" TEXT NOT NULL DEFAULT 'READY',
    "packStatus" TEXT NOT NULL DEFAULT 'READY',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "packedAt" DATETIME,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "UploadBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("accountId", "awb", "city", "color", "courier", "createdAt", "id", "orderNumber", "packedAt", "paymentType", "productDescription", "quantity", "sku", "state", "status", "updatedAt", "uploadBatchId") SELECT "accountId", "awb", "city", "color", "courier", "createdAt", "id", "orderNumber", "packedAt", "paymentType", "productDescription", "quantity", "sku", "state", "status", "updatedAt", "uploadBatchId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_accountId_sku_idx" ON "Order"("accountId", "sku");
CREATE INDEX "Order_accountId_orderNumber_idx" ON "Order"("accountId", "orderNumber");
CREATE INDEX "Order_accountId_packStatus_idx" ON "Order"("accountId", "packStatus");
CREATE INDEX "Order_accountId_pickStatus_idx" ON "Order"("accountId", "pickStatus");
CREATE INDEX "Order_accountId_status_idx" ON "Order"("accountId", "status");
CREATE UNIQUE INDEX "Order_accountId_awb_key" ON "Order"("accountId", "awb");
CREATE TABLE "new_SkuImageMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "productName" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastImportedAt" DATETIME,
    "source" TEXT,
    "notes" TEXT,
    "imageHealth" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkuImageMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SkuImageMapping" ("accountId", "color", "createdAt", "id", "imageUrl", "productName", "sku", "updatedAt") SELECT "accountId", "color", "createdAt", "id", "imageUrl", "productName", "sku", "updatedAt" FROM "SkuImageMapping";
DROP TABLE "SkuImageMapping";
ALTER TABLE "new_SkuImageMapping" RENAME TO "SkuImageMapping";
CREATE INDEX "SkuImageMapping_sku_idx" ON "SkuImageMapping"("sku");
CREATE INDEX "SkuImageMapping_accountId_active_idx" ON "SkuImageMapping"("accountId", "active");
CREATE INDEX "SkuImageMapping_accountId_imageHealth_idx" ON "SkuImageMapping"("accountId", "imageHealth");
CREATE UNIQUE INDEX "SkuImageMapping_accountId_sku_key" ON "SkuImageMapping"("accountId", "sku");
CREATE TABLE "new_UploadBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "filename" TEXT NOT NULL,
    "importType" TEXT NOT NULL DEFAULT 'ORDER_LABEL',
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UploadBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UploadBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_UploadBatch" ("accountId", "createdAt", "filename", "id", "notes", "status", "updatedAt", "uploadedById") SELECT "accountId", "createdAt", "filename", "id", "notes", "status", "updatedAt", "uploadedById" FROM "UploadBatch";
DROP TABLE "UploadBatch";
ALTER TABLE "new_UploadBatch" RENAME TO "UploadBatch";
CREATE INDEX "UploadBatch_accountId_createdAt_idx" ON "UploadBatch"("accountId", "createdAt");
CREATE INDEX "UploadBatch_accountId_importType_createdAt_idx" ON "UploadBatch"("accountId", "importType", "createdAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "lastLoginIp" TEXT,
    "lastUserAgent" TEXT,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("accountId", "active", "createdAt", "id", "name", "passwordHash", "role", "updatedAt", "username") SELECT "accountId", "active", "createdAt", "id", "name", "passwordHash", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserDeviceSession_userId_active_idx" ON "UserDeviceSession"("userId", "active");

-- CreateIndex
CREATE INDEX "UserDeviceSession_lastSeenAt_idx" ON "UserDeviceSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AuditLog_accountId_createdAt_idx" ON "AuditLog"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRowIssue_batchId_issueType_idx" ON "ImportRowIssue"("batchId", "issueType");
