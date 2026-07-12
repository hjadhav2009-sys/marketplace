import type { AmazonSheetUsage, AmazonSourceProfile } from "./types";

export type AmazonCandidateTable = {
  tableName: string;
  profile: AmazonSourceProfile;
  sheetUsage: AmazonSheetUsage;
  sheetPriority: number;
  label: string;
  headerRow: number;
  dataRow: number;
  rowCount: number;
  cellCount: number;
};

const PROFILES = new Set<AmazonSourceProfile>(["SHIPMENT", "ALL_LISTINGS", "CATEGORY_CATALOG", "PRODUCT_CATALOG", "SUPPORTING", "UNKNOWN"]);
const USAGES = new Set<AmazonSheetUsage>(["OPERATIONAL", "REFERENCE", "UNKNOWN"]);

export function parseAmazonCandidateTables(value: string | null | undefined, options?: { includeReference?: boolean }) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): AmazonCandidateTable[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.tableName !== "string" || !PROFILES.has(row.profile as AmazonSourceProfile)) return [];
      const sheetUsage = USAGES.has(row.sheetUsage as AmazonSheetUsage) ? row.sheetUsage as AmazonSheetUsage : "UNKNOWN";
      if (sheetUsage === "REFERENCE" && options?.includeReference !== true) return [];
      const rowCount = Math.max(0, Number(row.rowCount) || 0);
      return [{
        tableName: row.tableName.slice(0, 100),
        profile: row.profile as AmazonSourceProfile,
        sheetUsage,
        sheetPriority: Number(row.sheetPriority) || 0,
        label: typeof row.label === "string" ? row.label.slice(0, 220) : `${row.tableName} - ${String(row.profile).replaceAll("_", " ")}`,
        headerRow: Math.max(1, Number(row.headerRow) || 1),
        dataRow: Math.max(1, Number(row.dataRow) || 1),
        rowCount,
        cellCount: Math.max(0, Number(row.cellCount) || rowCount * 50)
      }];
    });
  } catch {
    return [];
  }
}

export function amazonShipmentCandidates(value: string | null | undefined) {
  return parseAmazonCandidateTables(value).filter((candidate) => candidate.profile === "SHIPMENT");
}

export function requireAmazonShipmentCandidate(value: string | null | undefined, tableName: string) {
  const candidate = amazonShipmentCandidates(value).find((item) => item.tableName === tableName);
  if (!candidate) throw new Error("Selected Amazon worksheet is not an operational shipment source.");
  return candidate;
}
