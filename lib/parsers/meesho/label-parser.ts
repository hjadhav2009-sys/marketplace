import {
  compactWhitespace,
  isValidAwb,
  normalizeAwb,
  normalizeCourier,
  normalizeOrderNo,
  normalizePaymentType,
  normalizeQty,
  normalizeSku,
  normalizeWhitespace,
  scoreAndIssues
} from "./normalize";
import type { MeeshoTextPage, ParsedMeeshoLabelOrder } from "./types";

function linesFromText(text: string) {
  return normalizeWhitespace(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function findLineValue(lines: string[], anchor: string) {
  const normalizedAnchor = anchor.toLowerCase();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = line.toLowerCase();

    if (!lower.includes(normalizedAnchor)) {
      continue;
    }

    const after = line.slice(lower.indexOf(normalizedAnchor) + anchor.length).replace(/^[:\-\s.]+/, "").trim();

    if (after) {
      return after;
    }

    return lines[index + 1]?.trim();
  }

  return undefined;
}

function lineDetails(text: string) {
  const lines = linesFromText(text);
  let cursor = 0;

  return lines.map((line, index) => {
    const start = text.indexOf(line, cursor);
    cursor = start >= 0 ? start + line.length : cursor;
    return { index, line, start: Math.max(start, 0), end: Math.max(start, 0) + line.length };
  });
}

function contextLines(lines: ReturnType<typeof lineDetails>, lineIndex: number, distance = 3) {
  const from = Math.max(0, lineIndex - distance);
  const to = Math.min(lines.length, lineIndex + distance + 1);
  return lines
    .slice(from, to)
    .map((line) => line.line)
    .join(" ");
}

function previousContextLines(lines: ReturnType<typeof lineDetails>, lineIndex: number, distance = 2) {
  const from = Math.max(0, lineIndex - distance);
  return lines
    .slice(from, lineIndex + 1)
    .map((line) => line.line)
    .join(" ");
}

function isExcludedAwbContext(context: string) {
  return /Purchase\s+Order\s+No|Sub\s+Order\s+No|Order\s+No|Invoice\s+No|Invoice\s+Date|Order\s+Date|GSTIN|Pincode|Pin\s+Code|Postal\s+Code/i.test(context);
}

function extractAwb(text: string) {
  const normalizedText = normalizeWhitespace(text);
  const lines = lineDetails(normalizedText);
  const productDetailsIndex = normalizedText.search(/Product\s+Details/i);
  const awbPattern = /\b(?:\d{10,20}|SF[A-Z0-9]{8,}|[A-Z]{2,}[A-Z0-9]{8,})\b/g;
  const candidates: Array<{ awb: string; score: number; index: number }> = [];

  for (const match of normalizedText.matchAll(awbPattern)) {
    if (match.index === undefined) {
      continue;
    }

    const awb = normalizeAwb(match[0]);

    if (!isValidAwb(awb)) {
      continue;
    }

    const lineIndex = lines.find((line) => match.index >= line.start && match.index <= line.end)?.index ?? 0;
    const anchorContext = previousContextLines(lines, lineIndex, 2);
    const nearby = contextLines(lines, lineIndex, 3);
    const beforeNearby = contextLines(lines, lineIndex, 5);

    if (isExcludedAwbContext(anchorContext)) {
      continue;
    }

    let score = 0;

    if (productDetailsIndex < 0 || match.index < productDetailsIndex) {
      score += 40;
    } else {
      score -= 30;
    }

    if (productDetailsIndex > 0 && match.index < productDetailsIndex && productDetailsIndex - match.index < 800) {
      score += 15;
    }

    if (/Delhivery|Shadowfax|Xpress\s*Bees|XpressBees/i.test(nearby)) {
      score += 55;
    }

    if (/Return\s+Code|Tracking|AWB|Courier/i.test(beforeNearby)) {
      score += 45;
    }

    if (/Customer\s+Address/i.test(nearby) && !/Return\s+Code|Delhivery|Shadowfax|Xpress\s*Bees|XpressBees|AWB|Tracking|Courier/i.test(nearby)) {
      score -= 60;
    }

    if (/^\d{6}$/.test(awb) || (/^[A-Z0-9]{15}$/.test(awb) && /GSTIN/i.test(anchorContext))) {
      score -= 100;
    }

    candidates.push({ awb, score, index: match.index });
  }

  return candidates.sort((left, right) => right.score - left.score || left.index - right.index)[0]?.awb;
}

function extractProductRow(text: string) {
  const segment = text.match(/SKU\s+Size\s+Qty\s+Color\s+Order\s+No\.?([\s\S]{0,350})/i)?.[1];

  if (!segment) {
    return {};
  }

  const row = compactWhitespace(segment.replace(/Purchase\s+Order\s+No[\s\S]+$/i, ""));
  const orderMatch = row.match(/(\d[\d\s]{10,}_\d)/);
  const orderNo = normalizeOrderNo(orderMatch?.[1]);

  if (!orderMatch) {
    return {};
  }

  const beforeOrder = row.slice(0, orderMatch.index).trim();
  const tokens = beforeOrder.split(/\s+/).filter(Boolean);
  const sku = normalizeSku(tokens[0]);
  const qtyIndex = tokens.findLastIndex((token) => /^\d+$/.test(token));
  const qty = normalizeQty(qtyIndex >= 0 ? tokens[qtyIndex] : undefined);
  const size = qtyIndex > 1 ? tokens.slice(1, qtyIndex).join(" ") : undefined;
  const color = qtyIndex >= 0 ? tokens.slice(qtyIndex + 1).join(" ") || undefined : undefined;

  return { sku, qty, size, color, orderNo };
}

function extractProductDescription(text: string) {
  const direct = text.match(/Product\s*:\s*([^\n]+)/i)?.[1];

  if (direct) {
    return compactWhitespace(direct);
  }

  const descriptionBlock = text.match(/Description\s+HSN\s+Qty\s+Gross\s+Amount[\s\S]{0,80}\n([\s\S]{20,500}?)(?:\n\s*\d{4,8}\b|Other Charges|Taxable)/i)?.[1];

  if (descriptionBlock) {
    return compactWhitespace(descriptionBlock);
  }

  return undefined;
}

export function parseMeeshoLabelPage(page: MeeshoTextPage): ParsedMeeshoLabelOrder {
  const text = normalizeWhitespace(page.text);
  const lines = linesFromText(text);
  const courier = normalizeCourier(text);
  const awb = extractAwb(text);
  const productRow = extractProductRow(text);
  const paymentType = normalizePaymentType(text);
  const productDescription = extractProductDescription(text);
  const supplierName = findLineValue(lines, "Supplier Name");
  const customerName = findLineValue(lines, "Customer Name") ?? null;
  const purchaseOrderNo = normalizeOrderNo(findLineValue(lines, "Purchase Order No"));
  const invoiceNo = findLineValue(lines, "Invoice No")?.split(/\s+/)[0];
  const orderDate = findLineValue(lines, "Order Date")?.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/)?.[0];
  const invoiceDate = findLineValue(lines, "Invoice Date")?.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/)?.[0];
  const scored = scoreAndIssues({
    awb,
    sku: productRow.sku,
    orderNo: productRow.orderNo,
    qty: productRow.qty,
    courier,
    productDescription,
    paymentType,
    pageNumber: page.pageNumber
  });

  return {
    pageNumber: page.pageNumber,
    sourceType: "LABEL",
    supplierName,
    courier,
    awb,
    sku: productRow.sku,
    qty: productRow.qty,
    color: productRow.color,
    size: productRow.size,
    orderNo: productRow.orderNo,
    purchaseOrderNo: purchaseOrderNo || undefined,
    invoiceNo,
    orderDate,
    invoiceDate,
    paymentType,
    productDescription,
    customerName,
    city: null,
    state: null,
    rawText: text,
    confidence: scored.confidence,
    issues: scored.issues
  };
}

export function parseMeeshoLabelPages(pages: MeeshoTextPage[]) {
  return pages
    .filter((page) => /Customer Address|Product Details|TAX INVOICE/i.test(page.text))
    .map(parseMeeshoLabelPage);
}
