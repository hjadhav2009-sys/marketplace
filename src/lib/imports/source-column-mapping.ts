import { createHash } from "node:crypto";
import type { CanonicalFieldDefinition, ProductCatalogRegistry } from "./canonical-field-registry";

const normalizeSourceHeader = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[\s_.\-/\\]+/g, " ").replace(/[^\p{L}\p{N}#\[\] ]/gu, "").replace(/\s+/g, " ");

export type SourceColumnRefV2 = {
  version: 2;
  sheetId: string;
  tableId?: string;
  columnIndex: number;
  excelColumn: string;
  rawHumanHeader: string;
  technicalKey?: string;
};

export type CanonicalFieldMappingV1 = Record<string, string>;
export type CanonicalFieldMappingV2 = { version: 2; fields: Record<string, SourceColumnRefV2> };
export type DecodedCanonicalFieldMapping =
  | { version: 1; fields: CanonicalFieldMappingV1 }
  | CanonicalFieldMappingV2;

export type CanonicalDetectionState =
  | "TECHNICAL_KEY"
  | "SAVED_MAPPING"
  | "EXACT_HEADER"
  | "APPROVED_ALIAS"
  | "AMBIGUOUS"
  | "MISSING_REQUIRED"
  | "MISSING_PREVIOUSLY_MAPPED_OPTIONAL"
  | "INTENTIONALLY_UNMAPPED";

export type CanonicalColumnDetection = {
  field: CanonicalFieldDefinition;
  state: CanonicalDetectionState;
  sourceColumn: SourceColumnRefV2 | null;
  candidates: SourceColumnRefV2[];
};

const MAX_SOURCE_COLUMNS = 2_000;
const MAX_MAPPING_FIELDS = 250;
const text = (value: unknown, max: number) => String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export function excelColumnName(zeroBasedIndex: number) {
  if (!Number.isInteger(zeroBasedIndex) || zeroBasedIndex < 0 || zeroBasedIndex >= 16_384) throw new Error("Source column index is invalid.");
  let value = zeroBasedIndex + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function sourceColumnsFromHeaders(input: { sheetId?: string; tableId?: string; humanHeaders: unknown[]; technicalHeaders?: unknown[] }) {
  if (input.humanHeaders.length > MAX_SOURCE_COLUMNS || (input.technicalHeaders?.length ?? 0) > MAX_SOURCE_COLUMNS) throw new Error("Source table has too many columns.");
  const width = Math.max(input.humanHeaders.length, input.technicalHeaders?.length ?? 0);
  const sheetId = text(input.sheetId ?? "Data", 160) || "Data";
  const tableId = text(input.tableId, 160) || undefined;
  return Array.from({ length: width }, (_, columnIndex): SourceColumnRefV2 => {
    const rawHumanHeader = text(input.humanHeaders[columnIndex], 500);
    const technicalKey = text(input.technicalHeaders?.[columnIndex], 1_000) || undefined;
    return { version: 2, sheetId, ...(tableId ? { tableId } : {}), columnIndex, excelColumn: excelColumnName(columnIndex), rawHumanHeader, ...(technicalKey ? { technicalKey } : {}) };
  }).filter((column) => column.rawHumanHeader || column.technicalKey);
}

export function isSourceColumnRefV2(value: unknown): value is SourceColumnRefV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<SourceColumnRefV2>;
  return item.version === 2
    && typeof item.sheetId === "string" && item.sheetId.length > 0 && item.sheetId.length <= 160
    && (item.tableId === undefined || typeof item.tableId === "string" && item.tableId.length <= 160)
    && Number.isInteger(item.columnIndex) && Number(item.columnIndex) >= 0 && Number(item.columnIndex) < 16_384
    && typeof item.excelColumn === "string" && item.excelColumn === excelColumnName(Number(item.columnIndex))
    && typeof item.rawHumanHeader === "string" && item.rawHumanHeader.length <= 500
    && (item.technicalKey === undefined || typeof item.technicalKey === "string" && item.technicalKey.length <= 1_000);
}

export function encodeSourceColumnRef(ref: SourceColumnRefV2) {
  if (!isSourceColumnRefV2(ref)) throw new Error("Source column reference is invalid.");
  return `v2:${Buffer.from(JSON.stringify(ref), "utf8").toString("base64url")}`;
}

export function decodeSourceColumnRef(value: unknown) {
  const encoded = String(value ?? "");
  if (!encoded.startsWith("v2:") || encoded.length > 4_000) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded.slice(3), "base64url").toString("utf8")) as unknown;
    return isSourceColumnRefV2(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function sameSourceColumn(left: SourceColumnRefV2, right: SourceColumnRefV2) {
  return left.sheetId === right.sheetId && (left.tableId ?? "") === (right.tableId ?? "") && left.columnIndex === right.columnIndex
    && left.rawHumanHeader === right.rawHumanHeader && (left.technicalKey ?? "") === (right.technicalKey ?? "");
}

export function sourceColumnLabel(column: SourceColumnRefV2) {
  const location = [column.sheetId, column.tableId].filter(Boolean).join(" / ");
  const header = column.rawHumanHeader || column.technicalKey || "Unnamed column";
  return `${location} · ${column.excelColumn} · ${header}`;
}

export function sourceColumnFingerprint(columns: SourceColumnRefV2[]) {
  if(columns.length>MAX_SOURCE_COLUMNS||columns.some((column)=>!isSourceColumnRefV2(column)))throw new Error("Source columns are invalid.");
  const identities=new Set(columns.map(column=>`${column.sheetId}\u0000${column.tableId??""}\u0000${column.columnIndex}`));
  if(identities.size!==columns.length)throw new Error("Source columns contain duplicate positions.");
  const values = columns.map((column) => [column.sheetId, column.tableId ?? "", column.columnIndex, normalizeSourceHeader(column.rawHumanHeader), normalizeSourceHeader(column.technicalKey)]);
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export function decodeCanonicalFieldMapping(value: unknown): DecodedCanonicalFieldMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Saved field mapping is invalid.");
  const candidate = value as { version?: unknown; fields?: unknown };
  if (candidate.version === 2) {
    if (!candidate.fields || typeof candidate.fields !== "object" || Array.isArray(candidate.fields)) throw new Error("Saved positional field mapping is invalid.");
    const entries = Object.entries(candidate.fields);
    if (entries.length > MAX_MAPPING_FIELDS || entries.some(([key, ref]) => !key || key.length > 120 || !isSourceColumnRefV2(ref))) throw new Error("Saved positional field mapping is invalid.");
    return { version: 2, fields: Object.fromEntries(entries) as Record<string, SourceColumnRefV2> };
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_MAPPING_FIELDS || entries.some(([key, header]) => !key || key.length > 120 || typeof header !== "string" || header.length > 1_000)) throw new Error("Saved field mapping is invalid.");
  return { version: 1, fields: Object.fromEntries(entries) as CanonicalFieldMappingV1 };
}

export function legacyMappingView(mapping: DecodedCanonicalFieldMapping) {
  if (mapping.version === 1) return mapping.fields;
  return Object.fromEntries(Object.entries(mapping.fields).map(([key, ref]) => [key, ref.technicalKey || ref.rawHumanHeader]));
}

function matchingColumns(columns: SourceColumnRefV2[], values: readonly string[], technical = false) {
  const normalized = new Set(values.map(normalizeSourceHeader).filter(Boolean));
  return columns.filter((column) => normalized.has(normalizeSourceHeader(technical ? column.technicalKey : column.rawHumanHeader)));
}

function singleOrAmbiguous(field: CanonicalFieldDefinition, state: CanonicalDetectionState, candidates: SourceColumnRefV2[], ordinal?: number): CanonicalColumnDetection | null {
  if (!candidates.length) return null;
  if (ordinal !== undefined) return candidates.length >= ordinal ? { field, state, sourceColumn: candidates[ordinal - 1], candidates } : null;
  return candidates.length === 1 ? { field, state, sourceColumn: candidates[0], candidates } : { field, state: "AMBIGUOUS", sourceColumn: null, candidates };
}

export function detectCanonicalColumns(input: { registry: ProductCatalogRegistry; sourceColumns: SourceColumnRefV2[]; savedMapping?: DecodedCanonicalFieldMapping | null }) {
  const results: CanonicalColumnDetection[] = [];
  for (const field of input.registry.fields) {
    const technical = input.sourceColumns.filter((column) => Boolean(column.technicalKey) && field.technicalPatterns.some((pattern) => pattern.test(column.technicalKey!)));
    const technicalResult = singleOrAmbiguous(field, "TECHNICAL_KEY", technical);
    if (technicalResult) { results.push(technicalResult); continue; }

    const saved = input.savedMapping?.fields[field.mappingKey];
    if (saved) {
      const savedCandidates = typeof saved === "string"
        ? matchingColumns(input.sourceColumns, [saved], false).concat(matchingColumns(input.sourceColumns, [saved], true)).filter((item, index, all) => all.findIndex((candidate) => sameSourceColumn(candidate, item)) === index)
        : input.sourceColumns.filter((column) => sameSourceColumn(column, saved));
      const savedResult = singleOrAmbiguous(field, "SAVED_MAPPING", savedCandidates);
      if (savedResult) { results.push(savedResult); continue; }
      results.push({ field, state: field.required ? "MISSING_REQUIRED" : "MISSING_PREVIOUSLY_MAPPED_OPTIONAL", sourceColumn: null, candidates: [] });
      continue;
    }

    const repeatedImageOrdinal = field.exactHumanHeaders.includes("Other Image URL") ? field.ordinal : undefined;
    const exactResult = singleOrAmbiguous(field, "EXACT_HEADER", matchingColumns(input.sourceColumns, field.exactHumanHeaders), repeatedImageOrdinal);
    if (exactResult) { results.push(exactResult); continue; }
    const aliasResult = singleOrAmbiguous(field, "APPROVED_ALIAS", matchingColumns(input.sourceColumns, field.approvedAliases));
    if (aliasResult) { results.push(aliasResult); continue; }
    results.push({ field, state: field.required ? "MISSING_REQUIRED" : "INTENTIONALLY_UNMAPPED", sourceColumn: null, candidates: [] });
  }
  return results;
}

export function mappingFromDetections(detections: CanonicalColumnDetection[]): CanonicalFieldMappingV2 {
  return { version: 2, fields: Object.fromEntries(detections.flatMap((detection) => detection.sourceColumn ? [[detection.field.mappingKey, detection.sourceColumn]] : [])) };
}

export function sourceCell(row: readonly unknown[], ref: SourceColumnRefV2) {
  return String(row[ref.columnIndex] ?? "").normalize("NFKC").trim();
}

export function mapPositionalSourceRows(input: { rows: readonly (readonly unknown[])[]; mapping: CanonicalFieldMappingV2; targetHeaders: Record<string, string> }) {
  return input.rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [canonical, ref] of Object.entries(input.mapping.fields)) {
      const target = input.targetHeaders[canonical];
      if (target) mapped[target] = sourceCell(row, ref);
    }
    return mapped;
  });
}
