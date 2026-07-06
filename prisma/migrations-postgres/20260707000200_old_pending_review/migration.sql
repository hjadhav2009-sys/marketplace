ALTER TABLE "Order" ADD COLUMN "oldPendingReviewStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Order" ADD COLUMN "oldPendingReviewedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "oldPendingReviewNote" TEXT;

CREATE INDEX "Order_accountId_oldPendingReviewStatus_idx" ON "Order"("accountId", "oldPendingReviewStatus");
CREATE INDEX "Order_accountId_importedAt_packStatus_idx" ON "Order"("accountId", "importedAt", "packStatus");
