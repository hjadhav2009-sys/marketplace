import type { ConsignmentImportFileType, ConsignmentIssueSeverity } from "@prisma/client";

export type ConsignmentParserIssue = {
  rowNumber?: number;
  issueType: string;
  severity: ConsignmentIssueSeverity;
  message: string;
  safeData?: Record<string, string | number | null>;
};

export type ParsedConsignmentLine = {
  rowNumber: number;
  productNameSource: string | null;
  sellerSkuSource: string | null;
  fsnSource: string | null;
  brandSource: string | null;
  sizeSource: string | null;
  colorSource: string | null;
  modelIdSource: string | null;
  requiredQuantity: number;
  costPriceReference: number | null;
  lengthCmReference: number | null;
  breadthCmReference: number | null;
  heightCmReference: number | null;
  weightKgReference: number | null;
};

export type ParsedConsignmentCsv = {
  headers: string[];
  sourceRows: number;
  lines: ParsedConsignmentLine[];
  issues: ConsignmentParserIssue[];
};

const HEADER_ALIASES = {
  productName: ["product name"],
  fsn: ["fsn"],
  sku: ["sku id", "sku", "seller sku"],
  quantity: ["quantity sent", "quantity", "qty sent"],
  brand: ["brand"],
  size: ["size"],
  color: ["color"],
  modelId: ["model id"],
  costPrice: ["cost price"],
  length: ["length(in cms)", "length in cms"],
  breadth: ["breadth(in cms)", "breadth in cms"],
  height: ["height(in cms)", "height in cms"],
  weight: ["weight(in kgs)", "weight in kgs"]
} as const;

function clean(value: unknown, max = 240) {
  const text = String(value ?? "").normalize("NFKC").replace(/\u0000/g, "").trim();
  return text ? text.slice(0, max) : null;
}

export function normalizeConsignmentHeader(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function headerIndex(headers: string[], aliases: readonly string[]) {
  const normalized = headers.map(normalizeConsignmentHeader);
  return aliases.map(normalizeConsignmentHeader).map((alias) => normalized.indexOf(alias)).find((index) => index >= 0) ?? -1;
}

export function isConsignmentDetailsHeaders(headers: string[]) {
  return headerIndex(headers, HEADER_ALIASES.productName) >= 0 &&
    headerIndex(headers, HEADER_ALIASES.fsn) >= 0 &&
    headerIndex(headers, HEADER_ALIASES.sku) >= 0 &&
    headerIndex(headers, HEADER_ALIASES.quantity) >= 0;
}

export function parseCsvRecords(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const text = content.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value.");
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function referenceNumber(value: string | undefined) {
  const raw = clean(value, 80);
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positiveWholeQuantity(value: string | undefined) {
  const raw = clean(value, 80);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseFlipkartConsignmentCsv(content: string): ParsedConsignmentCsv {
  const records = parseCsvRecords(content);
  const headers = records[0] ?? [];
  if (!isConsignmentDetailsHeaders(headers)) throw new Error("File headers do not match Flipkart Consignment Details.");
  const indexes = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, headerIndex(headers, aliases)])) as Record<keyof typeof HEADER_ALIASES, number>;
  const issues: ConsignmentParserIssue[] = [];
  const parsed: ParsedConsignmentLine[] = [];
  for (let index = 1; index < records.length; index += 1) {
    const row = records[index];
    if (row.every((cell) => !cell.trim())) continue;
    const rowNumber = index + 1;
    const quantity = positiveWholeQuantity(row[indexes.quantity]);
    const sellerSkuSource = clean(row[indexes.sku], 160);
    const fsnSource = clean(row[indexes.fsn], 160);
    if (!quantity) {
      issues.push({ rowNumber, issueType: "INVALID_QUANTITY", severity: "ERROR", message: "Quantity Sent must be a positive whole number.", safeData: { sku: sellerSkuSource, fsn: fsnSource } });
      continue;
    }
    if (!sellerSkuSource && !fsnSource) {
      issues.push({ rowNumber, issueType: "MISSING_IDENTIFIER", severity: "ERROR", message: "SKU Id or FSN is required.", safeData: {} });
      continue;
    }
    parsed.push({
      rowNumber,
      productNameSource: clean(row[indexes.productName], 500),
      sellerSkuSource,
      fsnSource,
      brandSource: clean(row[indexes.brand]),
      sizeSource: clean(row[indexes.size]),
      colorSource: clean(row[indexes.color]),
      modelIdSource: clean(row[indexes.modelId], 160),
      requiredQuantity: quantity,
      costPriceReference: referenceNumber(row[indexes.costPrice]),
      lengthCmReference: referenceNumber(row[indexes.length]),
      breadthCmReference: referenceNumber(row[indexes.breadth]),
      heightCmReference: referenceNumber(row[indexes.height]),
      weightKgReference: referenceNumber(row[indexes.weight])
    });
  }

  const grouped = new Map<string, ParsedConsignmentLine[]>();
  for (const line of parsed) {
    const key = [line.sellerSkuSource?.toUpperCase() ?? "", line.fsnSource?.toUpperCase() ?? ""].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), line]);
  }
  const lines: ParsedConsignmentLine[] = [];
  for (const duplicates of grouped.values()) {
    if (duplicates.length === 1) { lines.push(duplicates[0]); continue; }
    const [first] = duplicates;
    const identity = (line: ParsedConsignmentLine) => JSON.stringify([line.productNameSource, line.brandSource, line.sizeSource, line.colorSource, line.modelIdSource]);
    if (duplicates.every((line) => identity(line) === identity(first))) {
      lines.push({ ...first, requiredQuantity: duplicates.reduce((sum, line) => sum + line.requiredQuantity, 0) });
      issues.push({ rowNumber: first.rowNumber, issueType: "DUPLICATE_AGGREGATED", severity: "WARNING", message: "Repeated SKU and FSN rows were aggregated because identity fields agree.", safeData: { rowCount: duplicates.length } });
    } else {
      lines.push(...duplicates);
      for (const line of duplicates) issues.push({ rowNumber: line.rowNumber, issueType: "DUPLICATE_IDENTITY_CONFLICT", severity: "ERROR", message: "Repeated SKU and FSN rows have conflicting identity fields.", safeData: { sku: line.sellerSkuSource, fsn: line.fsnSource } });
    }
  }
  return { headers, sourceRows: parsed.length + issues.filter((issue) => issue.issueType === "INVALID_QUANTITY" || issue.issueType === "MISSING_IDENTIFIER").length, lines, issues };
}

export function classifyConsignmentTextFile(fileName: string, content: string): ConsignmentImportFileType {
  const lower = fileName.normalize("NFKC").toLowerCase();
  if (lower.endsWith(".csv")) {
    const headers = parseCsvRecords(content)[0] ?? [];
    if (isConsignmentDetailsHeaders(headers)) return "CONSIGNMENT_DETAILS";
    const normalized = headers.map(normalizeConsignmentHeader);
    if (lower.includes("quality_check") || normalized.some((header) => header.includes("quality check") || header === "qc parameter")) return "QUALITY_CHECK_REFERENCE";
    if (lower === "labels.csv" || normalized.some((header) => header.includes("label requirement"))) return "LABEL_REQUIREMENTS";
    return "UNKNOWN_SUPPORTING";
  }
  if (lower.endsWith(".txt") && (lower === "readme.txt" || content.slice(0, 200).toLowerCase().includes("readme"))) return "README";
  return "UNKNOWN_SUPPORTING";
}
