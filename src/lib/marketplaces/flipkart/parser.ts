import type { MarketplaceOrderLine, MarketplaceParseResult, MarketplaceParseWarning } from "../common";

export type FlipkartRawRow = Record<string, string | number | null | undefined>;

export type FlipkartParseIssue = {
  rowNumber: number;
  issueType: string;
  message: string;
  rawData: FlipkartRawRow;
};

export type FlipkartDuplicateKey =
  | {
      strategy: "ORDER_ITEM_ID";
      value: string;
    }
  | {
      strategy: "SHIPMENT_ID_SKU";
      value: string;
    };

export type FlipkartOrderLine = MarketplaceOrderLine & {
  marketplace: "FLIPKART";
  rowNumber: number;
  orderedOn?: string;
  shipmentId?: string;
  orderItemId?: string;
  orderId?: string;
  hsnCode?: string;
  orderState?: string;
  orderType?: string;
  fsn?: string;
  sku?: string;
  productTitle?: string;
  invoiceNo?: string;
  cgst?: number;
  igst?: number;
  sgst?: number;
  invoiceDate?: string;
  invoiceAmount?: number;
  sellingPricePerItem?: number;
  shippingCharge?: number;
  quantity?: number;
  buyerName?: string;
  shipToName?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  dispatchAfterDate?: string;
  dispatchByDate?: string;
  trackingId?: string;
  packageLengthCm?: number;
  packageBreadthCm?: number;
  packageHeightCm?: number;
  packageWeightKg?: number;
  duplicateKey?: FlipkartDuplicateKey;
  rawData: FlipkartRawRow;
};

export type FlipkartListingLine = {
  marketplace: "FLIPKART";
  rowNumber: number;
  sellerSkuId?: string;
  sku?: string;
  productTitle?: string;
  subCategory?: string;
  fsn?: string;
  listingId?: string;
  listingStatus?: string;
  mrp?: number;
  sellingPrice?: number;
  liveTitle?: string;
  liveBrand?: string;
  liveCategory?: string;
  livePrice?: number;
  rating?: number;
  reviewCount?: number;
  productUrl?: string;
  canonicalProductUrl?: string;
  scrapeStatus?: string;
  imageUrl?: string;
  rawData: FlipkartRawRow;
};

export type FlipkartOrderParseResult = Omit<MarketplaceParseResult, "marketplace" | "orders"> & {
  marketplace: "FLIPKART";
  orders: FlipkartOrderLine[];
  issues: FlipkartParseIssue[];
};

export type FlipkartListingParseResult = {
  marketplace: "FLIPKART";
  fileName: string;
  listings: FlipkartListingLine[];
  issues: FlipkartParseIssue[];
  warnings: MarketplaceParseWarning[];
};

export type FlipkartParseInput = {
  fileName: string;
  source: "CSV" | "PDF_TEXT" | "UNKNOWN";
  text?: string;
};

export type FlipkartParseResult = MarketplaceParseResult & {
  marketplace: "FLIPKART";
  source: FlipkartParseInput["source"];
};

const placeholderWarning: MarketplaceParseWarning = {
  code: "FLIPKART_PARSER_PLACEHOLDER",
  message: "Flipkart PDF text extraction is not implemented yet. Use Flipkart .xlsx exports for imports."
};

const orderColumns = {
  orderedOn: "Ordered On",
  shipmentId: "Shipment ID",
  orderItemId: "ORDER ITEM ID",
  orderId: "Order Id",
  hsnCode: "HSN CODE",
  orderState: "Order State",
  orderType: "Order Type",
  fsn: "FSN",
  sku: "SKU",
  productTitle: "Product",
  invoiceNo: "Invoice No.",
  cgst: "CGST",
  igst: "IGST",
  sgst: "SGST",
  invoiceDate: "Invoice Date (mm/dd/yy)",
  invoiceAmount: "Invoice Amount",
  sellingPricePerItem: "Selling Price Per Item",
  shippingCharge: "Shipping and Handling Charges",
  quantity: "Quantity",
  buyerName: "Buyer name",
  shipToName: "Ship to name",
  city: "City",
  state: "State",
  pinCode: "PIN Code",
  dispatchAfterDate: "Dispatch After date",
  dispatchByDate: "Dispatch by date",
  trackingId: "Tracking ID",
  packageLengthCm: "Package Length (cm)",
  packageBreadthCm: "Package Breadth (cm)",
  packageHeightCm: "Package Height (kg)",
  packageHeightCmActual: "Package Height (cm)",
  packageWeightKg: "Package Weight (kg)"
} as const;

const listingColumns = {
  sellerSkuId: "Seller SKU Id",
  productTitle: "Product Title",
  subCategory: "Sub-category",
  fsn: "Flipkart Serial Number",
  listingId: "Listing ID",
  listingStatus: "Listing Status",
  mrp: "MRP",
  sellingPrice: "Your Selling Price",
  liveTitle: "Live Title",
  liveBrand: "Live Brand",
  liveCategory: "Live Category",
  livePrice: "Live Price",
  rating: "Rating",
  reviewCount: "Review Count",
  productUrl: "Generated Direct Product URL",
  canonicalProductUrl: "Canonical Product URL",
  scrapeStatus: "Scrape Status"
} as const;

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rowValue(row: FlipkartRawRow, header: string) {
  const wanted = normalizeHeader(header);

  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key) === wanted) {
      return value;
    }
  }

  return undefined;
}

function text(row: FlipkartRawRow, header: string) {
  const value = rowValue(row, header);
  return value === null || value === undefined ? undefined : String(value).trim() || undefined;
}

function numberValue(row: FlipkartRawRow, header: string) {
  const value = text(row, header);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integerValue(row: FlipkartRawRow, header: string) {
  const parsed = numberValue(row, header);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function isHttpUrl(value: string | undefined) {
  if (!value || (!value.startsWith("http://") && !value.startsWith("https://"))) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function flipkartOrderDuplicateKey(order: Pick<FlipkartOrderLine, "orderItemId" | "shipmentId" | "sku">): FlipkartDuplicateKey | null {
  if (order.orderItemId) {
    return {
      strategy: "ORDER_ITEM_ID",
      value: order.orderItemId
    };
  }

  if (order.shipmentId && order.sku) {
    return {
      strategy: "SHIPMENT_ID_SKU",
      value: `${order.shipmentId}::${order.sku}`
    };
  }

  return null;
}

export function flipkartInternalOrderKey(order: Pick<FlipkartOrderLine, "orderItemId" | "shipmentId" | "sku">) {
  const duplicateKey = flipkartOrderDuplicateKey(order);

  if (!duplicateKey) {
    return null;
  }

  return duplicateKey.strategy === "ORDER_ITEM_ID"
    ? `FLIPKART:ORDER_ITEM:${duplicateKey.value}`
    : `FLIPKART:SHIPMENT_SKU:${duplicateKey.value}`;
}

export function chooseFlipkartListingImageUrl(row: FlipkartRawRow) {
  for (let index = 1; index <= 10; index += 1) {
    const largeImage = text(row, `Image ${index} 1366 URL`);

    if (isHttpUrl(largeImage)) {
      return largeImage;
    }

    const image = text(row, `Image URL ${index}`);

    if (isHttpUrl(image)) {
      return image;
    }
  }

  return undefined;
}

export function parseFlipkartOrderRows(rows: FlipkartRawRow[], fileName = "flipkart-orders.xlsx"): FlipkartOrderParseResult {
  const orders: FlipkartOrderLine[] = [];
  const issues: FlipkartParseIssue[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const order: FlipkartOrderLine = {
      marketplace: "FLIPKART",
      rowNumber,
      orderedOn: text(row, orderColumns.orderedOn),
      shipmentId: text(row, orderColumns.shipmentId),
      orderItemId: text(row, orderColumns.orderItemId),
      orderId: text(row, orderColumns.orderId),
      hsnCode: text(row, orderColumns.hsnCode),
      orderState: text(row, orderColumns.orderState),
      orderType: text(row, orderColumns.orderType),
      fsn: text(row, orderColumns.fsn),
      sku: text(row, orderColumns.sku),
      productTitle: text(row, orderColumns.productTitle),
      productDescription: text(row, orderColumns.productTitle),
      invoiceNo: text(row, orderColumns.invoiceNo),
      cgst: numberValue(row, orderColumns.cgst),
      igst: numberValue(row, orderColumns.igst),
      sgst: numberValue(row, orderColumns.sgst),
      invoiceDate: text(row, orderColumns.invoiceDate),
      invoiceAmount: numberValue(row, orderColumns.invoiceAmount),
      sellingPricePerItem: numberValue(row, orderColumns.sellingPricePerItem),
      shippingCharge: numberValue(row, orderColumns.shippingCharge),
      quantity: integerValue(row, orderColumns.quantity) ?? 1,
      buyerName: text(row, orderColumns.buyerName),
      shipToName: text(row, orderColumns.shipToName),
      city: text(row, orderColumns.city),
      state: text(row, orderColumns.state),
      pinCode: text(row, orderColumns.pinCode),
      dispatchAfterDate: text(row, orderColumns.dispatchAfterDate),
      dispatchByDate: text(row, orderColumns.dispatchByDate),
      trackingId: text(row, orderColumns.trackingId),
      awb: text(row, orderColumns.trackingId),
      packageLengthCm: numberValue(row, orderColumns.packageLengthCm),
      packageBreadthCm: numberValue(row, orderColumns.packageBreadthCm),
      packageHeightCm: numberValue(row, orderColumns.packageHeightCmActual),
      packageWeightKg: numberValue(row, orderColumns.packageWeightKg),
      rawData: row
    };
    const duplicateKey = flipkartOrderDuplicateKey(order);

    if (!order.sku) {
      issues.push({
        rowNumber,
        issueType: "MISSING_SKU",
        message: "Flipkart order row is missing SKU.",
        rawData: row
      });
      return;
    }

    if (!duplicateKey) {
      issues.push({
        rowNumber,
        issueType: "MISSING_FLIPKART_DUPLICATE_KEY",
        message: "Flipkart order row needs ORDER ITEM ID or both Shipment ID and SKU.",
        rawData: row
      });
      return;
    }

    orders.push({
      ...order,
      duplicateKey
    });
  });

  return {
    marketplace: "FLIPKART",
    fileName,
    orders,
    issues,
    warnings: []
  };
}

export function parseFlipkartListingRows(rows: FlipkartRawRow[], fileName = "flipkart-listings.xlsx"): FlipkartListingParseResult {
  const listings: FlipkartListingLine[] = [];
  const issues: FlipkartParseIssue[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const sellerSkuId = text(row, listingColumns.sellerSkuId);

    if (!sellerSkuId) {
      issues.push({
        rowNumber,
        issueType: "MISSING_SELLER_SKU_ID",
        message: "Flipkart listing row is missing Seller SKU Id.",
        rawData: row
      });
      return;
    }

    listings.push({
      marketplace: "FLIPKART",
      rowNumber,
      sellerSkuId,
      sku: sellerSkuId,
      productTitle: text(row, listingColumns.productTitle),
      subCategory: text(row, listingColumns.subCategory),
      fsn: text(row, listingColumns.fsn),
      listingId: text(row, listingColumns.listingId),
      listingStatus: text(row, listingColumns.listingStatus),
      mrp: numberValue(row, listingColumns.mrp),
      sellingPrice: numberValue(row, listingColumns.sellingPrice),
      liveTitle: text(row, listingColumns.liveTitle),
      liveBrand: text(row, listingColumns.liveBrand),
      liveCategory: text(row, listingColumns.liveCategory),
      livePrice: numberValue(row, listingColumns.livePrice),
      rating: numberValue(row, listingColumns.rating),
      reviewCount: integerValue(row, listingColumns.reviewCount),
      productUrl: text(row, listingColumns.productUrl),
      canonicalProductUrl: text(row, listingColumns.canonicalProductUrl),
      scrapeStatus: text(row, listingColumns.scrapeStatus),
      imageUrl: chooseFlipkartListingImageUrl(row),
      rawData: row
    });
  });

  return {
    marketplace: "FLIPKART",
    fileName,
    listings,
    issues,
    warnings: []
  };
}

export function parseFlipkartFile(input: FlipkartParseInput): FlipkartParseResult {
  return {
    marketplace: "FLIPKART",
    fileName: input.fileName,
    source: input.source,
    orders: [],
    warnings: [placeholderWarning]
  };
}

export function parseFlipkartCsvText(fileName: string, text: string) {
  return parseFlipkartFile({ fileName, source: "CSV", text });
}

export function parseFlipkartPdfText(fileName: string, text: string) {
  return parseFlipkartFile({ fileName, source: "PDF_TEXT", text });
}
