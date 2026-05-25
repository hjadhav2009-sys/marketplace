import type { Account, Order, PaymentType, SkuImageMapping, User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
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
};

export type OrderImportPlan = {
  created: ParsedOrderImportRow[];
  updated: ParsedOrderImportRow[];
  duplicates: ParsedOrderImportRow[];
  errors: Array<{ row: ParsedOrderImportRow; issueType: string; message: string }>;
  missingImageRows: ParsedOrderImportRow[];
};

type ExistingOrder = Pick<Order, "awb" | "courier" | "sku" | "qty" | "color" | "size" | "orderNo" | "productDescription" | "paymentType">;
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
    existing.paymentType !== (row.paymentType ?? "UNKNOWN")
  );
}

function withImportStats(
  notes: string | null,
  stats: {
    attemptedRows: number;
    createdRows: number;
    updatedRows: number;
    duplicateRows: number;
    missingImageRows: number;
    skippedRows: number;
    errorRows: number;
    metadataAutoFilled?: number;
  }
) {
  let parsed: Record<string, unknown> = {};

  if (notes) {
    try {
      const value = JSON.parse(notes);
      parsed = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }
  }

  return JSON.stringify({
    ...parsed,
    importStats: {
      ...stats,
      confirmedAt: new Date().toISOString()
    }
  });
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
}) {
  const batch = input.batchId
    ? await prisma.uploadBatch.update({
        where: { id: input.batchId },
        data: {
          status: "PARSED"
        }
      })
    : await prisma.uploadBatch.create({
        data: {
          accountId: input.account.id,
          createdByUserId: input.user.id,
          fileName: input.fileName,
          importType: "ORDER_LABEL",
          status: "PARSED",
          totalRows: input.rows.length
        }
      });

  const awbs = input.rows.map((row) => trimValue(row.awb)).filter(Boolean);
  const skus = input.rows.map((row) => trimSku(row.sku)).filter(Boolean);
  const [existingOrders, mappings] = await Promise.all([
    prisma.order.findMany({
      where: {
        accountId: input.account.id,
        awb: { in: awbs }
      }
    }),
    prisma.skuImageMapping.findMany({
      where: {
        accountId: input.account.id,
        sku: { in: skus },
        active: true
      },
      select: {
        id: true,
        sku: true,
        imageUrl: true,
        productName: true,
        color: true,
        size: true
      }
    })
  ]);

  const mappingBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));
  const plan = planOrderImport(existingOrders, input.rows, new Set(mappingBySku.keys()));
  const metadataAutoFillUpdates = buildSkuMetadataAutoFillUpdates(mappings, input.rows);

  for (const error of plan.errors) {
    await prisma.importRowIssue.create({
      data: {
        batchId: batch.id,
        rowNumber: error.row.rowNumber,
        issueType: error.issueType,
        message: error.message,
        rawData: JSON.stringify(error.row)
      }
    });
  }

  for (const row of plan.missingImageRows) {
    await prisma.importRowIssue.create({
      data: {
        batchId: batch.id,
        rowNumber: row.rowNumber,
        issueType: "MISSING_IMAGE_MAPPING",
        message: `No active image mapping found for SKU ${trimSku(row.sku)}.`,
        rawData: JSON.stringify(row)
      }
    });
  }

  for (const row of plan.created) {
    const sku = trimSku(row.sku);
    await prisma.order.create({
      data: {
        accountId: input.account.id,
        batchId: batch.id,
        awb: trimValue(row.awb),
        courier: trimValue(row.courier) || null,
        sku,
        qty: row.qty ?? 1,
        color: trimValue(row.color) || null,
        size: trimValue(row.size) || null,
        orderNo: trimValue(row.orderNo) || trimValue(row.awb),
        productDescription: trimValue(row.productDescription) || null,
        paymentType: row.paymentType ?? "UNKNOWN",
        city: trimValue(row.city) || null,
        state: trimValue(row.state) || null,
        imageUrl: mappingBySku.get(sku)?.imageUrl ?? null
      }
    });
  }

  for (const row of plan.updated) {
    const sku = trimSku(row.sku);
    await prisma.order.updateMany({
      where: {
        accountId: input.account.id,
        awb: trimValue(row.awb)
      },
      data: {
        batchId: batch.id,
        courier: trimValue(row.courier) || null,
        sku,
        qty: row.qty ?? 1,
        color: trimValue(row.color) || null,
        size: trimValue(row.size) || null,
        orderNo: trimValue(row.orderNo) || trimValue(row.awb),
        productDescription: trimValue(row.productDescription) || null,
        paymentType: row.paymentType ?? "UNKNOWN",
        imageUrl: mappingBySku.get(sku)?.imageUrl ?? null
      }
    });
  }

  for (const row of plan.duplicates) {
    await prisma.importRowIssue.create({
      data: {
        batchId: batch.id,
        rowNumber: row.rowNumber,
        issueType: "DUPLICATE_SKIPPED",
        message: `AWB ${trimValue(row.awb)} already exists with no safe changes.`,
        rawData: JSON.stringify(row)
      }
    });
  }

  for (const update of metadataAutoFillUpdates) {
    await prisma.skuImageMapping.update({
      where: { id: update.id },
      data: {
        productName: update.productName,
        color: update.color,
        size: update.size
      }
    });
  }

  const importStats = {
    attemptedRows: input.rows.length + (input.heldRows ?? 0),
    createdRows: plan.created.length,
    updatedRows: plan.updated.length,
    duplicateRows: plan.duplicates.length,
    missingImageRows: plan.missingImageRows.length,
    skippedRows: plan.duplicates.length + (input.heldRows ?? 0),
    errorRows: plan.errors.length,
    metadataAutoFilled: metadataAutoFillUpdates.length
  };
  const updatedBatch = input.batchId
    ? await prisma.uploadBatch.update({
        where: { id: batch.id },
        data: {
          status: plan.errors.length > 0 ? "REVIEWED" : "IMPORTED",
          createdRows: plan.created.length,
          updatedRows: plan.updated.length,
          duplicateRows: plan.duplicates.length,
          missingImageRows: plan.missingImageRows.length,
          skippedRows: importStats.skippedRows,
          errorRows: plan.errors.length,
          notes: withImportStats(batch.notes, importStats)
        }
      })
    : await prisma.uploadBatch.update({
        where: { id: batch.id },
        data: {
          status: plan.errors.length > 0 ? "REVIEWED" : "IMPORTED",
          createdRows: plan.created.length,
          updatedRows: plan.updated.length,
          duplicateRows: plan.duplicates.length,
          missingImageRows: plan.missingImageRows.length,
          skippedRows: plan.duplicates.length,
          errorRows: plan.errors.length,
          notes: withImportStats(batch.notes, importStats)
        }
      });

  await recordAuditLog({
    userId: input.user.id,
    accountId: input.account.id,
    action: "BATCH_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows: plan.created.length,
      updatedRows: plan.updated.length,
      duplicateRows: plan.duplicates.length,
      missingImageRows: plan.missingImageRows.length,
      errorRows: plan.errors.length,
      metadataAutoFilled: metadataAutoFillUpdates.length
    },
    request: input.request
  });

  return updatedBatch;
}
