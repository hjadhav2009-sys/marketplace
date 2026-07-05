export const marketplaceCodes = ["FLIPKART", "MEESHO"] as const;

export type Marketplace = (typeof marketplaceCodes)[number];

export type MarketplacePaymentType = "PREPAID" | "COD" | "UNKNOWN";

export type MarketplaceOrderLine = {
  marketplace: Marketplace;
  orderedOn?: string;
  orderId?: string;
  orderItemId?: string;
  shipmentId?: string;
  hsnCode?: string;
  orderState?: string;
  orderType?: string;
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
  productTitle?: string;
  invoiceNo?: string;
  cgst?: number;
  igst?: number;
  sgst?: number;
  invoiceDate?: string;
  invoiceAmount?: number;
  sellingPricePerItem?: number;
  shippingCharge?: number;
  buyerName?: string;
  shipToName?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  dispatchAfterDate?: string;
  dispatchByDate?: string;
  packageLengthCm?: number;
  packageBreadthCm?: number;
  packageHeightCm?: number;
  packageWeightKg?: number;
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
