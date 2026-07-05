export const marketplaceCodes = ["FLIPKART", "MEESHO"] as const;

export type Marketplace = (typeof marketplaceCodes)[number];

export type MarketplacePaymentType = "PREPAID" | "COD" | "UNKNOWN";

export type MarketplaceOrderLine = {
  marketplace: Marketplace;
  orderId?: string;
  shipmentId?: string;
  trackingId?: string;
  awb?: string;
  sku?: string;
  fsn?: string;
  quantity?: number;
  color?: string;
  size?: string;
  courier?: string;
  paymentType?: MarketplacePaymentType;
  productDescription?: string;
  rawData?: Record<string, unknown>;
};

export type MarketplaceParseWarning = {
  code: string;
  message: string;
};

export type MarketplaceParseResult = {
  marketplace: Marketplace;
  fileName: string;
  orders: MarketplaceOrderLine[];
  warnings: MarketplaceParseWarning[];
};

export const enabledMarketplaces = ["FLIPKART"] as const satisfies readonly Marketplace[];

export type EnabledMarketplace = (typeof enabledMarketplaces)[number];

