import { extractPdfPages } from "@/lib/pdf/extract-pages";
import { classifyMeeshoPdf } from "./classify";
import { parseMeeshoLabelPages } from "./label-parser";
import { parseMeeshoManifestPages } from "./manifest-parser";
import type {
  CrossCheckIssue,
  MeeshoParseResult,
  MeeshoTextPage,
  ParsedMeeshoLabelOrder,
  ParsedMeeshoManifestOrder,
  ParsedMeeshoPicklistSummaryRow,
  ParseIssue
} from "./types";

function countMissing<T extends { issues: ParseIssue[] }>(rows: T[], issueType: string) {
  return rows.reduce((count, row) => count + (row.issues.some((issue) => issue.issueType === issueType) ? 1 : 0), 0);
}

function duplicateCount(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  return duplicates.size;
}

function duplicateIssues(values: Array<{ awb?: string; pageNumber: number; sku?: string }>, sourceLabel: string) {
  const seen = new Map<string, number>();
  const issues: ParseIssue[] = [];

  for (const row of values) {
    if (!row.awb) {
      continue;
    }

    const firstPage = seen.get(row.awb);

    if (firstPage) {
      issues.push({
        issueType: "DUPLICATE_AWB_INSIDE_FILE",
        message: `AWB ${row.awb} appears more than once in ${sourceLabel} rows on pages ${firstPage} and ${row.pageNumber}.`,
        severity: "WARNING",
        pageNumber: row.pageNumber,
        awb: row.awb,
        sku: row.sku
      });
    } else {
      seen.set(row.awb, row.pageNumber);
    }
  }

  return issues;
}

function duplicateSummaryIssues(rows: ParsedMeeshoPicklistSummaryRow[]) {
  const seen = new Set<string>();
  const issues: ParseIssue[] = [];

  for (const row of rows) {
    const key = [row.sku, row.color, row.size].filter(Boolean).join("|");

    if (!key) {
      continue;
    }

    if (seen.has(key)) {
      issues.push({
        issueType: "DUPLICATE_SKU_SUMMARY_ROW",
        message: `Picklist summary has duplicate SKU/color/size row for ${key}.`,
        severity: "WARNING",
        pageNumber: row.pageNumber,
        sku: row.sku
      });
    }

    seen.add(key);
  }

  return issues;
}

export function crossCheckMeeshoParsedRows(input: {
  labelOrders: ParsedMeeshoLabelOrder[];
  manifestOrders: ParsedMeeshoManifestOrder[];
  picklistSummaryRows: ParsedMeeshoPicklistSummaryRow[];
}): CrossCheckIssue[] {
  const issues: CrossCheckIssue[] = [];
  const labelByAwb = new Map(input.labelOrders.filter((row) => row.awb).map((row) => [row.awb as string, row]));
  const manifestByAwb = new Map(input.manifestOrders.filter((row) => row.awb).map((row) => [row.awb as string, row]));

  for (const label of input.labelOrders) {
    if (!label.awb) {
      continue;
    }

    const manifest = manifestByAwb.get(label.awb);

    if (!manifest && input.manifestOrders.length > 0) {
      issues.push({
        issueType: "LABEL_NOT_IN_MANIFEST",
        message: `Label AWB ${label.awb} was not found in the manifest.`,
        severity: "WARNING",
        awb: label.awb,
        pageNumber: label.pageNumber
      });
      continue;
    }

    if (!manifest) {
      continue;
    }

    if (label.sku && manifest.sku && label.sku !== manifest.sku) {
      issues.push({
        issueType: "SKU_MISMATCH",
        message: `AWB ${label.awb} has SKU ${label.sku} in label and ${manifest.sku} in manifest.`,
        severity: "ERROR",
        awb: label.awb,
        labelValue: label.sku,
        manifestValue: manifest.sku
      });
    }

    if (label.qty && manifest.qty && label.qty !== manifest.qty) {
      issues.push({
        issueType: "QTY_MISMATCH",
        message: `AWB ${label.awb} has qty ${label.qty} in label and ${manifest.qty} in manifest.`,
        severity: "ERROR",
        awb: label.awb,
        labelValue: label.qty,
        manifestValue: manifest.qty
      });
    }

    if (label.courier && manifest.courier && label.courier !== manifest.courier) {
      issues.push({
        issueType: "COURIER_MISMATCH",
        message: `AWB ${label.awb} has courier ${label.courier} in label and ${manifest.courier} in manifest.`,
        severity: "WARNING",
        awb: label.awb,
        labelValue: label.courier,
        manifestValue: manifest.courier
      });
    }
  }

  for (const manifest of input.manifestOrders) {
    if (manifest.awb && input.labelOrders.length > 0 && !labelByAwb.has(manifest.awb)) {
      issues.push({
        issueType: "MANIFEST_NOT_IN_LABELS",
        message: `Manifest AWB ${manifest.awb} was not found in uploaded labels.`,
        severity: "WARNING",
        awb: manifest.awb,
        pageNumber: manifest.pageNumber
      });
    }
  }

  const manifestTotals = new Map<string, number>();

  for (const order of input.manifestOrders) {
    if (!order.sku || !order.qty) {
      continue;
    }

    const key = [order.sku, order.size ?? ""].join("|");
    manifestTotals.set(key, (manifestTotals.get(key) ?? 0) + order.qty);
  }

  const summaryTotals = new Map<string, { total: number; row: ParsedMeeshoPicklistSummaryRow }>();

  for (const row of input.picklistSummaryRows) {
    if (!row.sku || !row.totalQuantity) {
      continue;
    }

    const key = [row.sku, row.size ?? ""].join("|");
    const existing = summaryTotals.get(key);

    summaryTotals.set(key, {
      total: (existing?.total ?? 0) + row.totalQuantity,
      row: existing?.row ?? row
    });
  }

  for (const [key, summary] of summaryTotals) {
    const manifestTotal = manifestTotals.get(key);

    if (manifestTotal !== undefined && manifestTotal !== summary.total) {
      issues.push({
        issueType: "SUMMARY_QTY_MISMATCH",
        message: `Picklist aggregate ${summary.row.sku} total ${summary.total} does not match manifest total ${manifestTotal}.`,
        severity: "WARNING",
        sku: summary.row.sku,
        pageNumber: summary.row.pageNumber,
        labelValue: summary.total,
        manifestValue: manifestTotal
      });
    }
  }

  return issues;
}

export function parseMeeshoTextPages(fileName: string, pages: MeeshoTextPage[]): MeeshoParseResult {
  const detectedType = classifyMeeshoPdf(pages);
  const issues: ParseIssue[] = [];
  const labelOrders = detectedType === "UNKNOWN" ? [] : parseMeeshoLabelPages(pages);
  const manifest = detectedType === "UNKNOWN" ? { manifestOrders: [], picklistSummaryRows: [] } : parseMeeshoManifestPages(pages);
  const allOrders = [...labelOrders, ...manifest.manifestOrders];

  if (detectedType === "UNKNOWN") {
    issues.push({
      issueType: "UNKNOWN_PDF_TYPE",
      message: "Could not detect Meesho label or manifest structure.",
      severity: "ERROR"
    });
  }

  issues.push(...duplicateIssues(labelOrders, "label"));
  issues.push(...duplicateIssues(manifest.manifestOrders, "manifest"));
  issues.push(...duplicateSummaryIssues(manifest.picklistSummaryRows));
  issues.push(
    ...crossCheckMeeshoParsedRows({
      labelOrders,
      manifestOrders: manifest.manifestOrders,
      picklistSummaryRows: manifest.picklistSummaryRows
    })
  );

  return {
    fileName,
    detectedType,
    pageCount: pages.length,
    labelOrders,
    manifestOrders: manifest.manifestOrders,
    picklistSummaryRows: manifest.picklistSummaryRows,
    issues,
    stats: {
      totalPages: pages.length,
      parsedOrders: allOrders.length,
      parsedSummaryRows: manifest.picklistSummaryRows.length,
      missingAwb: countMissing(allOrders, "MISSING_AWB"),
      missingSku: countMissing(allOrders, "MISSING_SKU"),
      lowConfidenceRows: countMissing(allOrders, "LOW_CONFIDENCE") + countMissing(manifest.picklistSummaryRows, "LOW_CONFIDENCE"),
      duplicateAwbInsideFile: duplicateCount(labelOrders.map((row) => row.awb)) + duplicateCount(manifest.manifestOrders.map((row) => row.awb)),
      duplicateSkuSummaryRows: duplicateSummaryIssues(manifest.picklistSummaryRows).length
    }
  };
}

export async function parseMeeshoPdfBuffer(buffer: Buffer, fileName: string) {
  const pages = await extractPdfPages(buffer);
  return parseMeeshoTextPages(fileName, pages);
}

export type {
  MeeshoParseResult,
  ParsedMeeshoLabelOrder,
  ParsedMeeshoManifestOrder,
  ParsedMeeshoPicklistSummaryRow,
  ParseIssue
} from "./types";
