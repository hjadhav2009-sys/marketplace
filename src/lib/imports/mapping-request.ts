import { isSourceColumnRefV2, sourceColumnsFromHeaders, sourceColumnFingerprint, type SourceColumnRefV2 } from "./source-column-mapping";

export type HeaderMappingRequestV2 = {
  version: 2;
  headers: string[];
  sourceColumns: SourceColumnRefV2[];
  fingerprint: string;
  requiredFields: string[];
  optionalFields: string[];
  usefulFieldCount: number;
  ignoredColumnCount: number;
};

const strings = (value: unknown, maxItems: number, maxLength: number) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").slice(0, maxItems).map((item) => item.normalize("NFKC").trim().slice(0, maxLength))
  : [];

export function parseHeaderMappingRequest(value: unknown): HeaderMappingRequestV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const headers = strings(candidate.headers, 2_000, 1_000);
  if(Array.isArray(candidate.sourceColumns)&&(candidate.sourceColumns.length>2_000||candidate.sourceColumns.some((item)=>!isSourceColumnRefV2(item))))return null;
  const suppliedColumns = Array.isArray(candidate.sourceColumns) ? candidate.sourceColumns : [];
  const sourceColumns = suppliedColumns.length ? suppliedColumns : sourceColumnsFromHeaders({ humanHeaders: headers });
  if (!sourceColumns.length) return null;
  const requiredFields = strings(candidate.requiredFields, 250, 120);
  const optionalFields = strings(candidate.optionalFields, 250, 120);
  const usefulFieldCount = Number.isInteger(candidate.usefulFieldCount) ? Math.max(0, Math.min(Number(candidate.usefulFieldCount), 250)) : requiredFields.length + optionalFields.length;
  return {
    version: 2,
    headers: headers.length ? headers : sourceColumns.map((column) => column.technicalKey || column.rawHumanHeader),
    sourceColumns,
    fingerprint: sourceColumnFingerprint(sourceColumns),
    requiredFields,
    optionalFields,
    usefulFieldCount,
    ignoredColumnCount: Math.max(0, sourceColumns.length - usefulFieldCount),
  };
}

export function parseHeaderMappingProgress(progressJson: string | null | undefined) {
  try {
    return parseHeaderMappingRequest(JSON.parse(progressJson ?? "{}") as unknown);
  } catch {
    return null;
  }
}
