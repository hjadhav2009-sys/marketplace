CREATE INDEX "MarketplaceListingIdentifier_type_value_account_idx" ON "MarketplaceListingIdentifier"("identifierType","normalizedValue","accountId");
CREATE INDEX "Order_awb_account_idx" ON "Order"("awb","accountId");
CREATE INDEX "Order_tracking_account_idx" ON "Order"("trackingId","accountId");
CREATE INDEX "Order_orderNo_account_idx" ON "Order"("orderNumber","accountId");
CREATE INDEX "Order_shipment_account_idx" ON "Order"("shipmentId","accountId");
CREATE INDEX "Order_item_account_idx" ON "Order"("orderItemId","accountId");
CREATE INDEX "Order_sku_account_idx" ON "Order"("sku","accountId");
