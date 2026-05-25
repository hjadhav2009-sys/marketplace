import {
  compactWhitespace,
  isValidAwb,
  normalizeAwb,
  normalizeCourier,
  normalizeOrderNo,
  normalizeQty,
  normalizeSku,
  normalizeWhitespace,
  scoreAndIssues
} from "./normalize";
import type { MeeshoTextPage, ParsedMeeshoManifestOrder, ParsedMeeshoPicklistSummaryRow, ParseIssue } from "./types";

const sizePattern = "(?:Free\\s+Size|XS|S|M|L|XL|XXL|XXXL|\\d+[A-Za-z]*)";
const awbCandidatePattern = /\b(?:\d{10,20}|SF[A-Z0-9]{8,}|[A-Z]{2,}[A-Z0-9]{8,})\b/g;
const awbCandidateTestPattern = /\b(?:\d{10,20}|SF[A-Z0-9]{8,}|[A-Z]{2,}[A-Z0-9]{8,})\b/;

type ManifestRowBlock = {
  rawRowText: string;
  courier?: string;
};

function cleanLines(text: string) {
  return normalizeWhitespace(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\(\d+\)$/.test(line))
    .filter((line) => !/^S\.?\s*No\.?/i.test(line))
    .filter((line) => !/^Supplier\s+Name\s*:/i.test(line))
    .filter((line) => !/^Date\s*:/i.test(line));
}

function findCourier(text: string) {
  const match = text.match(/Courier\s*:?\s*(Delhivery|Shadowfax|Xpress\s*Bees|XpressBees)/i);
  return normalizeCourier(match?.[1] ?? text);
}

function findSupplier(text: string) {
  return text.match(/Supplier\s+Name\s*:?\s*([^\n]+)/i)?.[1]?.trim();
}

function parseSummaryRow(pageNumber: number, rawRowText: string, supplierName?: string): ParsedMeeshoPicklistSummaryRow | null {
  const row = compactWhitespace(rawRowText);
  const match = row.match(new RegExp(`^(.+?)\\s+([A-Za-z]+)\\s+(${sizePattern})\\s+(\\d+)\\s*$`, "i"));

  if (!match) {
    return null;
  }

  const sku = normalizeSku(match[1]);
  const color = match[2];
  const size = compactWhitespace(match[3]);
  const totalQuantity = normalizeQty(match[4]);
  const issues: ParseIssue[] = [];
  let confidence = 0;

  if (sku) {
    confidence += 35;
  } else {
    issues.push({ issueType: "MISSING_SKU", message: "Summary SKU was not found.", severity: "ERROR", pageNumber });
  }

  if (color) {
    confidence += 15;
  }

  if (size) {
    confidence += 20;
  }

  if (totalQuantity) {
    confidence += 30;
  } else {
    issues.push({ issueType: "MISSING_QTY", message: "Summary total quantity was not found.", severity: "ERROR", pageNumber });
  }

  if (confidence < 70) {
    issues.push({ issueType: "LOW_CONFIDENCE", message: `Parser confidence is ${confidence}.`, severity: "WARNING", pageNumber });
  }

  return {
    pageNumber,
    sourceType: "PICKLIST_SUMMARY",
    supplierName,
    sku,
    color,
    size,
    totalQuantity,
    rawRowText: row,
    confidence,
    issues
  };
}

export function parsePicklistSummaryPages(pages: MeeshoTextPage[]) {
  const rows: ParsedMeeshoPicklistSummaryRow[] = [];

  for (const page of pages) {
    if (!/Picklist/i.test(page.text) || !/Total\s+Quantity/i.test(page.text)) {
      continue;
    }

    const supplierName = findSupplier(page.text);
    const lines = cleanLines(page.text).filter((line) => !/Picklist|SKU\s+Color\s+Size\s+Total/i.test(line));

    for (const line of lines) {
      const parsed = parseSummaryRow(page.pageNumber, line, supplierName);

      if (parsed) {
        rows.push(parsed);
      }
    }
  }

  return rows;
}

function rowBlocksFromPage(page: MeeshoTextPage, initialCourier?: string) {
  const lines = cleanLines(page.text);
  const blocks: ManifestRowBlock[] = [];
  let current: string[] = [];
  let activeCourier = initialCourier;

  function flushCurrent() {
    if (current.length === 0) {
      return;
    }

    blocks.push({
      rawRowText: current.join(" "),
      courier: activeCourier
    });
    current = [];
  }

  for (const line of lines) {
    if (/^Courier\s*:/i.test(line)) {
      flushCurrent();
      activeCourier = findCourier(line);
      continue;
    }

    if (/^Packed$/i.test(line) || /^Picklist$/i.test(line)) {
      continue;
    }

    const serialStart = /^\d{1,4}(?:\s+\S|$)/.test(line) && (!/^\d+$/.test(line) || current.length === 0);

    if (serialStart) {
      flushCurrent();
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  flushCurrent();

  return { blocks, lastCourier: activeCourier };
}

function parseOrderBlock(pageNumber: number, rawRowText: string, courier?: string, supplierName?: string): ParsedMeeshoManifestOrder {
  const raw = compactWhitespace(rawRowText);
  const withoutSerial = raw.replace(/^\d+\s+/, "");
  const issues: ParseIssue[] = [];
  let awb: string | undefined;
  let orderNo = "";
  let sku = "";
  let qty: number | undefined;
  let size: string | undefined;
  let fallback:
    | {
        awb: string;
        orderNo: string;
        sku: string;
        qty?: number;
        size?: string;
      }
    | undefined;

  for (const match of withoutSerial.matchAll(awbCandidatePattern)) {
    const candidateAwb = normalizeAwb(match[0]);

    if (!isValidAwb(candidateAwb) || match.index === undefined) {
      continue;
    }

    const beforeAwb = withoutSerial.slice(0, match.index);
    const afterAwb = withoutSerial.slice(match.index + match[0].length);
    const candidateOrderNo = normalizeOrderNo(beforeAwb);
    const detailMatch = compactWhitespace(afterAwb).match(new RegExp(`^(.+?)\\s+(\\d+)\\s+(${sizePattern})(?:\\s+(?:Yes|No|Y|N|Packed))?$`, "i"));

    if (detailMatch) {
      const candidate = {
        awb: candidateAwb,
        orderNo: candidateOrderNo,
        sku: normalizeSku(detailMatch[1]),
        qty: normalizeQty(detailMatch[2]),
        size: compactWhitespace(detailMatch[3])
      };

      if (candidateOrderNo) {
        fallback = candidate;
        break;
      }

      fallback ??= candidate;
    }
  }

  if (fallback) {
    awb = fallback.awb;
    orderNo = fallback.orderNo;
    sku = fallback.sku;
    qty = fallback.qty;
    size = fallback.size;
  } else {
    issues.push({ issueType: "UNKNOWN_LAYOUT_ROW", message: "Could not confidently split AWB, SKU, quantity, and size.", severity: "WARNING", pageNumber });
  }

  const scored = scoreAndIssues({
    awb,
    sku,
    orderNo,
    qty,
    courier,
    size,
    pageNumber,
    manifest: true
  });

  return {
    pageNumber,
    sourceType: "MANIFEST_ORDER",
    supplierName,
    courier,
    awb,
    sku,
    qty,
    size,
    orderNo,
    rawRowText: raw,
    confidence: scored.confidence,
    issues: [...issues, ...scored.issues]
  };
}

export function parseCourierOrderPages(pages: MeeshoTextPage[]) {
  const orders: ParsedMeeshoManifestOrder[] = [];
  let currentCourier: string | undefined;
  let currentSupplier: string | undefined;

  for (const page of pages) {
    const pageHasCourierTable = /Courier\s*:|Sub\s+Order\s+No|AWB\s+SKU|S\.?\s*No/i.test(page.text);

    if (/Courier\s*:/i.test(page.text)) {
      currentSupplier = findSupplier(page.text) ?? currentSupplier;
    }

    const { blocks, lastCourier } = rowBlocksFromPage(page, currentCourier);
    currentCourier = lastCourier ?? currentCourier;

    if (!currentCourier && blocks.every((block) => !block.courier)) {
      continue;
    }

    for (const block of blocks) {
      if (!pageHasCourierTable && !awbCandidateTestPattern.test(block.rawRowText)) {
        continue;
      }

      orders.push(parseOrderBlock(page.pageNumber, block.rawRowText, block.courier ?? currentCourier, currentSupplier));
    }
  }

  return orders;
}

export function parseMeeshoManifestPages(pages: MeeshoTextPage[]) {
  return {
    manifestOrders: parseCourierOrderPages(pages),
    picklistSummaryRows: parsePicklistSummaryPages(pages)
  };
}
