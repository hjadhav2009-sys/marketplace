import type { Account, Order, PaymentType, SkuImageMapping, UploadBatch, User } from "@prisma/client";
import type { RequestMeta } from "@/lib/network";
import { normalizeSkuForMatching } from "@/lib/sku";

export type ParsedOrderImportRow = {
  rowNumber?: number;
  awb?: string | null;
  courier?: string | null;
  sku?: string | null;
  qty?: number | null;
  color?: string | null;
  size?: string | null;
  orderNo?: string | null;
  productDescription?: string | null;
  paymentType?: PaymentType;
  city?: string | null;
  state?: string | null;
  shipmentId?: string | null;
  orderItemId?: string | null;
  trackingId?: string | null;
};

export type OrderImportPlan = {
  created: ParsedOrderImportRow[];
  updated: ParsedOrderImportRow[];
  duplicates: ParsedOrderImportRow[];
  errors: Array<{ row: ParsedOrderImportRow; issueType: string; message: string }>;
  missingImageRows: ParsedOrderImportRow[];
};

type ExistingOrder = Pick<Order, "awb" | "courier" | "sku" | "qty" | "color" | "size" | "orderNo" | "productDescription" | "paymentType"> & Partial<Pick<Order, "shipmentId" | "orderItemId" | "trackingId">>;
type MetadataMapping = Pick<SkuImageMapping, "id" | "sku" | "productName" | "color" | "size">;

function trimValue(value?: string | null) {
  return value?.trim() ?? "";
}

function trimSku(value?: string | null) {
  return normalizeSkuForMatching(value);
}

function hasSafeOrderChanges(existing: ExistingOrder, row: ParsedOrderImportRow) {
  return (
    trimValue(existing.courier) !== trimValue(row.courier) ||
    existing.sku !== trimSku(row.sku) ||
    existing.qty !== (row.qty ?? 1) ||
    trimValue(existing.color) !== trimValue(row.color) ||
    trimValue(existing.size) !== trimValue(row.size) ||
    existing.orderNo !== trimValue(row.orderNo) ||
    trimValue(existing.productDescription) !== trimValue(row.productDescription) ||
    existing.paymentType !== (row.paymentType ?? "UNKNOWN") ||
    (row.shipmentId != null && trimValue(existing.shipmentId) !== trimValue(row.shipmentId)) ||
    (row.orderItemId != null && trimValue(existing.orderItemId) !== trimValue(row.orderItemId)) ||
    (row.trackingId != null && trimValue(existing.trackingId) !== trimValue(row.trackingId))
  );
}

export function planOrderImport(
  existingOrders: ExistingOrder[],
  rows: ParsedOrderImportRow[],
  mappedSkus: Set<string>
): OrderImportPlan {
  const existingByAwb = new Map(existingOrders.map((order) => [order.awb, order]));
  const seenAwbs = new Set<string>();

  return rows.reduce<OrderImportPlan>(
    (plan, row) => {
      const awb = trimValue(row.awb);
      const sku = trimSku(row.sku);

      if (!awb) {
        plan.errors.push({ row, issueType: "MISSING_AWB", message: "AWB is required." });
        return plan;
      }

      if (!sku) {
        plan.errors.push({ row, issueType: "MISSING_SKU", message: "SKU is required." });
        return plan;
      }

      if (seenAwbs.has(awb)) {
        plan.duplicates.push(row);
        return plan;
      }

      seenAwbs.add(awb);

      const existing = existingByAwb.get(awb);

      if (!mappedSkus.has(sku)) {
        plan.missingImageRows.push(row);
      }

      if (!existing) {
        plan.created.push(row);
      } else if (hasSafeOrderChanges(existing, row)) {
        plan.updated.push(row);
      } else {
        plan.duplicates.push(row);
      }

      return plan;
    },
    { created: [], updated: [], duplicates: [], errors: [], missingImageRows: [] }
  );
}

export function buildSkuMetadataAutoFillUpdates(mappings: MetadataMapping[], rows: ParsedOrderImportRow[]) {
  const mappingBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));
  const updates = new Map<string, { id: string; sku: string; productName?: string; color?: string; size?: string }>();

  for (const row of rows) {
    const sku = trimSku(row.sku);
    const mapping = mappingBySku.get(sku);

    if (!mapping) {
      continue;
    }

    const update = updates.get(mapping.id) ?? { id: mapping.id, sku: mapping.sku };
    const productName = trimValue(row.productDescription);
    const color = trimValue(row.color);
    const size = trimValue(row.size);

    if (!mapping.productName && !update.productName && productName) {
      update.productName = productName;
    }

    if (!mapping.color && !update.color && color) {
      update.color = color;
    }

    if (!mapping.size && !update.size && size) {
      update.size = size;
    }

    if (update.productName || update.color || update.size) {
      updates.set(mapping.id, update);
    }
  }

  return Array.from(updates.values());
}

export async function importParsedOrderRows(input: {
  rows: ParsedOrderImportRow[];
  fileName: string;
  account: Account;
  user: User;
  request?: RequestMeta;
  batchId?: string;
  heldRows?: number;
}): Promise<UploadBatch> {
  throw new Error(`${input.account.marketplace} legacy parsed Order imports are review-only and cannot create production data or warehouse work.`);
}
