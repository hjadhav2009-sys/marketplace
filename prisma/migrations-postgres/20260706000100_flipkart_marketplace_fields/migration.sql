ALTER TABLE "Order" ADD COLUMN "marketplace" TEXT NOT NULL DEFAULT 'MEESHO';
ALTER TABLE "Order" ADD COLUMN "shipmentId" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderItemId" TEXT;
ALTER TABLE "Order" ADD COLUMN "fsn" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingId" TEXT;

CREATE INDEX "Order_accountId_marketplace_idx" ON "Order"("accountId", "marketplace");
CREATE INDEX "Order_accountId_marketplace_orderItemId_idx" ON "Order"("accountId", "marketplace", "orderItemId");
CREATE INDEX "Order_accountId_marketplace_shipmentId_idx" ON "Order"("accountId", "marketplace", "shipmentId");
CREATE INDEX "Order_accountId_marketplace_trackingId_idx" ON "Order"("accountId", "marketplace", "trackingId");

