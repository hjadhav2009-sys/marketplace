export const IMPORT_ISSUE_PAGE_SIZE = 50;
export const IMPORT_ISSUE_PAGE_SIZES = [25, 50, 100] as const;

export type SafeImportIssueContext = {
  sku: string | null;
  shipmentKey: string | null;
  orderItemKey: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = textValue(row[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

export function maskOperationalKey(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 8) {
    return normalized;
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function parseImportIssueRawData(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function safeImportIssueContext(rawData: string | null | undefined): SafeImportIssueContext {
  const row = parseImportIssueRawData(rawData);

  if (!row) {
    return {
      sku: null,
      shipmentKey: null,
      orderItemKey: null
    };
  }

  return {
    sku: firstText(row, ["sku", "SKU", "Seller SKU Id", "Seller SKU ID", "sellerSkuId"]),
    shipmentKey: maskOperationalKey(firstText(row, ["shipmentId", "Shipment ID", "Shipment Id"])),
    orderItemKey: maskOperationalKey(firstText(row, ["orderItemId", "ORDER ITEM ID", "Order Item ID"]))
  };
}

export function importIssuePageWindow(totalRows: number, page: number | string | null | undefined, pageSize = IMPORT_ISSUE_PAGE_SIZE) {
  const safePageSize = IMPORT_ISSUE_PAGE_SIZES.includes(pageSize as (typeof IMPORT_ISSUE_PAGE_SIZES)[number]) ? pageSize : IMPORT_ISSUE_PAGE_SIZE;
  const parsedPage = typeof page === "number" ? page : Number.parseInt(page ?? "1", 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeTotal = Math.max(0, totalRows);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const boundedPage = Math.min(requestedPage, totalPages);
  const skip = (boundedPage - 1) * safePageSize;

  return {
    page: boundedPage,
    pageSize: safePageSize,
    totalPages,
    skip,
    take: safePageSize,
    from: safeTotal === 0 ? 0 : skip + 1,
    to: Math.min(skip + safePageSize, safeTotal)
  };
}
