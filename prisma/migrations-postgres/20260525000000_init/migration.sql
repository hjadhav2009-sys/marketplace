-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'PICKER', 'PACKER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('UPLOADED', 'PARSED', 'REVIEWED', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('ORDER_LABEL', 'SKU_IMAGE');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PREPAID', 'COD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('READY', 'PACKED', 'PROBLEM');

-- CreateEnum
CREATE TYPE "PickStatus" AS ENUM ('READY', 'PICKED', 'PROBLEM');

-- CreateEnum
CREATE TYPE "PackStatus" AS ENUM ('READY', 'PACKED', 'PROBLEM');

-- CreateEnum
CREATE TYPE "ScanOutcome" AS ENUM ('FOUND', 'PACKED', 'PROBLEM', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ImageHealth" AS ENUM ('UNKNOWN', 'MAPPED', 'BROKEN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastUserAgent" TEXT,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDeviceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserDeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuImageMapping" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "productName" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastImportedAt" TIMESTAMP(3),
    "source" TEXT,
    "notes" TEXT,
    "imageHealth" "ImageHealth" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkuImageMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "filename" TEXT NOT NULL,
    "importType" "ImportType" NOT NULL DEFAULT 'ORDER_LABEL',
    "status" "BatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "missingImageRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
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
    "paymentType" "PaymentType" NOT NULL DEFAULT 'UNKNOWN',
    "imageUrl" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pickStatus" "PickStatus" NOT NULL DEFAULT 'READY',
    "packStatus" "PackStatus" NOT NULL DEFAULT 'READY',
    "status" "OrderStatus" NOT NULL DEFAULT 'READY',
    "packedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT,
    "awb" TEXT NOT NULL,
    "outcome" "ScanOutcome" NOT NULL,
    "scannedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ProblemStatus" NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowIssue" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "issueType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRowIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadPreviewRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "awb" TEXT,
    "courier" TEXT,
    "sku" TEXT,
    "qty" INTEGER,
    "color" TEXT,
    "size" TEXT,
    "orderNo" TEXT,
    "productDescription" TEXT,
    "paymentType" "PaymentType" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rawData" TEXT,
    "issues" TEXT,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadPreviewRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

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
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "SkuImageMapping_sku_idx" ON "SkuImageMapping"("sku");

-- CreateIndex
CREATE INDEX "SkuImageMapping_accountId_active_idx" ON "SkuImageMapping"("accountId", "active");

-- CreateIndex
CREATE INDEX "SkuImageMapping_accountId_imageHealth_idx" ON "SkuImageMapping"("accountId", "imageHealth");

-- CreateIndex
CREATE UNIQUE INDEX "SkuImageMapping_accountId_sku_key" ON "SkuImageMapping"("accountId", "sku");

-- CreateIndex
CREATE INDEX "UploadBatch_accountId_createdAt_idx" ON "UploadBatch"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadBatch_accountId_importType_createdAt_idx" ON "UploadBatch"("accountId", "importType", "createdAt");

-- CreateIndex
CREATE INDEX "Order_accountId_sku_idx" ON "Order"("accountId", "sku");

-- CreateIndex
CREATE INDEX "Order_accountId_orderNumber_idx" ON "Order"("accountId", "orderNumber");

-- CreateIndex
CREATE INDEX "Order_accountId_packStatus_idx" ON "Order"("accountId", "packStatus");

-- CreateIndex
CREATE INDEX "Order_accountId_pickStatus_idx" ON "Order"("accountId", "pickStatus");

-- CreateIndex
CREATE INDEX "Order_accountId_status_idx" ON "Order"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accountId_awb_key" ON "Order"("accountId", "awb");

-- CreateIndex
CREATE INDEX "ScanLog_accountId_createdAt_idx" ON "ScanLog"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanLog_awb_idx" ON "ScanLog"("awb");

-- CreateIndex
CREATE INDEX "ProblemOrder_accountId_status_idx" ON "ProblemOrder"("accountId", "status");

-- CreateIndex
CREATE INDEX "ProblemOrder_orderId_idx" ON "ProblemOrder"("orderId");

-- CreateIndex
CREATE INDEX "ImportRowIssue_batchId_issueType_idx" ON "ImportRowIssue"("batchId", "issueType");

-- CreateIndex
CREATE INDEX "UploadPreviewRow_batchId_sourceType_idx" ON "UploadPreviewRow"("batchId", "sourceType");

-- CreateIndex
CREATE INDEX "UploadPreviewRow_batchId_awb_idx" ON "UploadPreviewRow"("batchId", "awb");

-- CreateIndex
CREATE INDEX "UploadPreviewRow_batchId_sku_idx" ON "UploadPreviewRow"("batchId", "sku");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeviceSession" ADD CONSTRAINT "UserDeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuImageMapping" ADD CONSTRAINT "SkuImageMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "UploadBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemOrder" ADD CONSTRAINT "ProblemOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemOrder" ADD CONSTRAINT "ProblemOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemOrder" ADD CONSTRAINT "ProblemOrder_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowIssue" ADD CONSTRAINT "ImportRowIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadPreviewRow" ADD CONSTRAINT "UploadPreviewRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
