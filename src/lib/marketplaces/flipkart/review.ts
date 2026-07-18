import { canonicalSkuIdentity } from "@/lib/sku";
import { flipkartInternalOrderKey, type FlipkartOrderLine, type FlipkartParseIssue, type FlipkartRawRow } from "./parser";

export const FLIPKART_DUPLICATE_ROW = "DUPLICATE_FLIPKART_ROW";
export const FLIPKART_DUPLICATE_IDENTITY_CONFLICT = "DUPLICATE_IDENTITY_CONFLICT";
export const FLIPKART_MISSING_LISTING_MAPPING = "MISSING_FLIPKART_LISTING_MAPPING";
export const FLIPKART_LISTING_IMAGE_MISSING = "FLIPKART_LISTING_IMAGE_MISSING";

export type FlipkartOrderDedupeResult = {
  importableOrders: FlipkartOrderLine[];
  duplicateIssues: FlipkartParseIssue[];
  repeatedSourceRows: number;
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
  const groups = new Map<string, FlipkartOrderLine[]>();
  for (const order of orders) {
    const key = flipkartInternalOrderKey(order);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }

  const operationalFingerprint = (order: FlipkartOrderLine) => JSON.stringify({
    orderItemId: order.orderItemId ?? null,
    shipmentId: order.shipmentId ?? null,
    orderId: order.orderId ?? null,
    sellerSku: canonicalSkuIdentity(order.sku),
    quantity: order.quantity ?? 1,
    trackingId: order.trackingId ?? null
  });
  const importableOrders: FlipkartOrderLine[] = [];
  let repeatedSourceRows = 0;

  for (const rows of groups.values()) {
    const fingerprints = new Set(rows.map(operationalFingerprint));
    if (fingerprints.size === 1) {
      const canonical=rows.reduce((best,row)=>(row.productTitle?.trim().length??0)>(best.productTitle?.trim().length??0)?row:best,rows[0]);
      importableOrders.push(canonical);
      repeatedSourceRows += rows.length - 1;
      continue;
    }

    duplicateIssues.push({
      rowNumber: rows[0].rowNumber,
      issueType: FLIPKART_DUPLICATE_IDENTITY_CONFLICT,
      severity: "BLOCKING_ERROR",
      message: "Conflicting rows use the same Flipkart order identity; no Order or work was created for this identity.",
      rawData: {},
      safeData: {
        rowNumbers: rows.map((row) => row.rowNumber),
        sellerSku: canonicalSkuIdentity(rows[0].sku),
        orderItemId: rows[0].orderItemId ?? null,
        shipmentId: rows[0].shipmentId ?? null,
        issueCode: FLIPKART_DUPLICATE_IDENTITY_CONFLICT
      }
    });
  }

  return {
    importableOrders,
    duplicateIssues,
    repeatedSourceRows
  };
}

export function flipkartOrderMappingIssue(
  order: FlipkartOrderLine,
  mapping: {
    listingFound?: boolean;
    hasMainImage?: boolean;
    hasActiveImageMapping?: boolean;
    listingFoundWithMissingImage?: boolean;
  }
): FlipkartParseIssue | null {
  const hasImage = mapping.hasMainImage ?? mapping.hasActiveImageMapping;
  const listingFound = mapping.listingFound ?? (hasImage || Boolean(mapping.listingFoundWithMissingImage));

  if (hasImage) {
    return null;
  }

  const sku = canonicalSkuIdentity(order.sku);

  if (!sku) {
    return null;
  }

  if (listingFound) {
    return {
      rowNumber: order.rowNumber,
      issueType: FLIPKART_LISTING_IMAGE_MISSING,
      severity: "WARNING",
      message: `Listing found but image missing for SKU: ${sku}`,
      rawData: order.rawData ?? {}
    };
  }

  return {
    rowNumber: order.rowNumber,
    issueType: FLIPKART_MISSING_LISTING_MAPPING,
    severity: "BLOCKING_ERROR",
    message: `Missing Flipkart listing mapping for SKU: ${sku}`,
    rawData: order.rawData ?? {}
  };
}
