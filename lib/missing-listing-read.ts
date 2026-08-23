import { Prisma, type PrismaClient } from "@prisma/client";

export const MISSING_LISTINGS_PAGE_SIZE = 25;
export const ORDER_MISSING_ISSUES = ["MISSING_FLIPKART_LISTING_MAPPING", "AMBIGUOUS_LISTING"];
export const CONSIGNMENT_MISSING_ISSUES = ["NOT_FOUND", "EXACT_MULTIPLE", "IDENTIFIER_CONFLICT"];

export type MissingListingSource = "all" | "orders" | "consignments";
export type MissingListingReason = "all" | "missing" | "ambiguous" | "conflict";

export type MissingListingItem = {
  id: string;
  source: "ORDER" | "CONSIGNMENT";
  sourceHref: string;
  resolveHref: string;
  sellerSku: string;
  title: string;
  marketplace: string;
  reason: string;
  reasonLabel: string;
  message: string;
  quantity: number | null;
  sourceReference: string;
  createdAt: Date;
};

function orderIssueTypes(reason: MissingListingReason) {
  if (reason === "missing") return ["MISSING_FLIPKART_LISTING_MAPPING"];
  if (reason === "ambiguous" || reason === "conflict") return ["AMBIGUOUS_LISTING"];
  return ORDER_MISSING_ISSUES;
}

function consignmentIssueTypes(reason: MissingListingReason) {
  if (reason === "missing") return ["NOT_FOUND"];
  if (reason === "ambiguous") return ["EXACT_MULTIPLE"];
  if (reason === "conflict") return ["IDENTIFIER_CONFLICT"];
  return CONSIGNMENT_MISSING_ISSUES;
}

function safeObject(value: string | null) {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeMissingListingFilters(input: {
  source?: string | null;
  reason?: string | null;
  query?: string | null;
  page?: number;
}) {
  const source: MissingListingSource = input.source === "orders" || input.source === "consignments" ? input.source : "all";
  const reason: MissingListingReason = ["missing", "ambiguous", "conflict"].includes(input.reason ?? "")
    ? input.reason as MissingListingReason
    : "all";
  return { source, reason, query: input.query?.normalize("NFKC").trim().slice(0, 160) ?? "", page: Math.max(1, input.page ?? 1) };
}

export async function loadMissingListings(
  client: PrismaClient,
  accountId: string,
  marketplace: string,
  raw: { source?: string | null; reason?: string | null; query?: string | null; page?: number }
) {
  const filters = normalizeMissingListingFilters(raw);
  const includeOrders = filters.source !== "consignments";
  const includeConsignments = filters.source !== "orders";
  const orderWhere: Prisma.ImportRowIssueWhereInput = {
    batch: { accountId },
    sourceType: "ORDER",
    issueType: { in: orderIssueTypes(filters.reason) },
    resolved: false,
    ...(filters.query ? { OR: [{ message: { contains: filters.query } }, { safeDataJson: { contains: filters.query } }] } : {})
  };
  const consignmentWhere: Prisma.ConsignmentImportIssueWhereInput = {
    consignmentBatch: { accountId, marketplace },
    issueType: { in: consignmentIssueTypes(filters.reason) },
    resolved: false,
    consignmentLineId: { not: null },
    ...(filters.query
      ? {
          OR: [
            { message: { contains: filters.query } },
            { safeDataJson: { contains: filters.query } },
            { consignmentLine: { is: { OR: [
              { sellerSkuSource: { contains: filters.query } },
              { fsnSource: { contains: filters.query } },
              { asinSource: { contains: filters.query } },
              { fnskuSource: { contains: filters.query } },
              { externalIdSource: { contains: filters.query } },
              { productNameSource: { contains: filters.query } }
            ] } } }
          ]
        }
      : {})
  };
  const [orderTotal, consignmentTotal] = await Promise.all([
    includeOrders ? client.importRowIssue.count({ where: orderWhere }) : Promise.resolve(0),
    includeConsignments ? client.consignmentImportIssue.count({ where: consignmentWhere }) : Promise.resolve(0)
  ]);
  const total = orderTotal + consignmentTotal;
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / MISSING_LISTINGS_PAGE_SIZE)));
  const offset = (page - 1) * MISSING_LISTINGS_PAGE_SIZE;
  const orderSkip = Math.min(offset, orderTotal);
  const orderTake = Math.min(MISSING_LISTINGS_PAGE_SIZE, Math.max(0, orderTotal - orderSkip));
  const consignmentSkip = Math.max(0, offset - orderTotal);
  const consignmentTake = MISSING_LISTINGS_PAGE_SIZE - orderTake;
  const [orderRows, consignmentRows] = await Promise.all([
    orderTake
      ? client.importRowIssue.findMany({
          where: orderWhere,
          select: { id: true, batchId: true, rowNumber: true, issueType: true, message: true, safeDataJson: true, sourceId: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip: orderSkip,
          take: orderTake
        })
      : Promise.resolve([]),
    consignmentTake
      ? client.consignmentImportIssue.findMany({
          where: consignmentWhere,
          select: {
            id: true,
            issueType: true,
            message: true,
            createdAt: true,
            consignmentBatchId: true,
            consignmentLineId: true,
            consignmentBatch: { select: { displayName: true, externalConsignmentNumber: true, marketplace: true } },
            consignmentLine: { select: { rowNumber: true, sellerSkuSource: true, productNameSource: true, requiredQuantity: true } }
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip: consignmentSkip,
          take: consignmentTake
        })
      : Promise.resolve([])
  ]);
  const orderIds = orderRows.flatMap((row) => row.sourceId ? [row.sourceId] : []);
  const orders = orderIds.length
    ? await client.order.findMany({
        where: { accountId, id: { in: orderIds } },
        select: { id: true, sku: true, productDescription: true, qty: true, orderNo: true, marketplace: true }
      })
    : [];
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const items: MissingListingItem[] = [
    ...orderRows.map((row) => {
      const safe = safeObject(row.safeDataJson);
      const order = row.sourceId ? ordersById.get(row.sourceId) : undefined;
      const sellerSku = stringValue(safe.sellerSku) ?? order?.sku ?? "Seller SKU unavailable";
      return {
        id: row.id,
        source: "ORDER" as const,
        sourceHref: `/owner/uploads/${row.batchId}/review`,
        resolveHref: `/owner/catalog/missing/${row.id}`,
        sellerSku,
        title: order?.productDescription ?? stringValue(safe.productTitle) ?? "Order listing needs owner resolution",
        marketplace: order?.marketplace ?? marketplace,
        reason: row.issueType,
        reasonLabel: row.issueType === "AMBIGUOUS_LISTING" ? "Exact listing required" : "Listing not found",
        message: row.message,
        quantity: order?.qty ?? null,
        sourceReference: order?.orderNo ? `Order ${order.orderNo}` : `Import row ${row.rowNumber ?? "unknown"}`,
        createdAt: row.createdAt
      };
    }),
    ...consignmentRows.flatMap((row) => row.consignmentLine && row.consignmentLineId ? [{
      id: row.id,
      source: "CONSIGNMENT" as const,
      sourceHref: `/owner/consignments/${row.consignmentBatchId}/review`,
      resolveHref: `/owner/consignments/${row.consignmentBatchId}/review?lineId=${row.consignmentLineId}`,
      sellerSku: row.consignmentLine.sellerSkuSource ?? "Seller SKU unavailable",
      title: row.consignmentLine.productNameSource ?? "Consignment listing needs owner resolution",
      marketplace: row.consignmentBatch.marketplace,
      reason: row.issueType,
      reasonLabel: row.issueType === "NOT_FOUND" ? "Listing not found" : row.issueType === "EXACT_MULTIPLE" ? "Exact listing required" : "Identifier conflict",
      message: row.message,
      quantity: row.consignmentLine.requiredQuantity,
      sourceReference: `${row.consignmentBatch.displayName || row.consignmentBatch.externalConsignmentNumber}, row ${row.consignmentLine.rowNumber}`,
      createdAt: row.createdAt
    }] : [])
  ];
  return { ...filters, total, orderTotal, consignmentTotal, page, pageSize: MISSING_LISTINGS_PAGE_SIZE, items };
}
