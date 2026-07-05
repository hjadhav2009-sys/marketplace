import { normalizeSkuForMatching } from "@/lib/sku";
import { flipkartInternalOrderKey, type FlipkartOrderLine, type FlipkartParseIssue, type FlipkartRawRow } from "./parser";

export const FLIPKART_DUPLICATE_ROW = "DUPLICATE_FLIPKART_ROW";
export const FLIPKART_MISSING_LISTING_MAPPING = "MISSING_FLIPKART_LISTING_MAPPING";
export const FLIPKART_LISTING_IMAGE_MISSING = "FLIPKART_LISTING_IMAGE_MISSING";

export type FlipkartOrderDedupeResult = {
  importableOrders: FlipkartOrderLine[];
  duplicateIssues: FlipkartParseIssue[];
};

export type FlipkartIssueRawContext = {
  sku?: string;
  shipmentId?: string;
  orderItemId?: string;
  trackingId?: string;
  product?: string;
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function flipkartRawText(row: FlipkartRawRow | Record<string, unknown> | null | undefined, header: string) {
  if (!row) {
    return undefined;
  }

  const wanted = normalizeHeader(header);

  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key) === wanted) {
      const text = value === null || value === undefined ? "" : String(value).trim();
      return text || undefined;
    }
  }

  return undefined;
}

export function flipkartIssueRawContext(row: FlipkartRawRow | Record<string, unknown> | null | undefined): FlipkartIssueRawContext {
  return {
    sku: flipkartRawText(row, "SKU") ?? flipkartRawText(row, "Seller SKU Id"),
    shipmentId: flipkartRawText(row, "Shipment ID"),
    orderItemId: flipkartRawText(row, "ORDER ITEM ID"),
    trackingId: flipkartRawText(row, "Tracking ID"),
    product: flipkartRawText(row, "Product") ?? flipkartRawText(row, "Product Title") ?? flipkartRawText(row, "Live Title")
  };
}

export function dedupeFlipkartOrderRows(orders: FlipkartOrderLine[]): FlipkartOrderDedupeResult {
  const duplicateIssues: FlipkartParseIssue[] = [];
  const seenKeys = new Set<string>();
  const importableOrders = orders.filter((order) => {
    const key = flipkartInternalOrderKey(order);

    if (!key) {
      return false;
    }

    if (seenKeys.has(key)) {
      duplicateIssues.push({
        rowNumber: order.rowNumber,
        issueType: FLIPKART_DUPLICATE_ROW,
        message: `Duplicate Flipkart row skipped for ${key}.`,
        rawData: order.rawData ?? {}
      });
      return false;
    }

    seenKeys.add(key);
    return true;
  });

  return {
    importableOrders,
    duplicateIssues
  };
}

export function flipkartOrderMappingIssue(
  order: FlipkartOrderLine,
  mapping: {
    hasActiveImageMapping: boolean;
    listingFoundWithMissingImage: boolean;
  }
): FlipkartParseIssue | null {
  if (mapping.hasActiveImageMapping) {
    return null;
  }

  const sku = normalizeSkuForMatching(order.sku);

  if (!sku) {
    return null;
  }

  if (mapping.listingFoundWithMissingImage) {
    return {
      rowNumber: order.rowNumber,
      issueType: FLIPKART_LISTING_IMAGE_MISSING,
      message: `Listing found but image missing for SKU: ${sku}`,
      rawData: order.rawData ?? {}
    };
  }

  return {
    rowNumber: order.rowNumber,
    issueType: FLIPKART_MISSING_LISTING_MAPPING,
    message: `Missing Flipkart listing mapping for SKU: ${sku}`,
    rawData: order.rawData ?? {}
  };
}
