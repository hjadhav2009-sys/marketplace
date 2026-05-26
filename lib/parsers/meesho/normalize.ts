import { normalizeSkuForMatching } from "@/lib/sku";
import type { MeeshoPaymentType, ParseIssue } from "./types";

const hiddenSeparatorPattern = /[\uFFFE\uFFFD\u200B-\u200F\u202A-\u202E]/g;
const mojibakeHiddenSeparatorPattern = /\u00EF\u00BF[\u00BD\u00BE]/g;
const controlPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function removeControlChars(value: string) {
  return value.replace(mojibakeHiddenSeparatorPattern, "-").replace(hiddenSeparatorPattern, "-").replace(controlPattern, " ").replace(/\r/g, "\n");
}

export function normalizeWhitespace(value: string) {
  return removeControlChars(value).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function compactWhitespace(value: string) {
  return normalizeWhitespace(value).replace(/\s+/g, " ").trim();
}

export function normalizeSku(value: string | null | undefined) {
  return normalizeSkuForMatching(value);
}

export function skuNormalizationIssue(value: string | null | undefined, normalizedSku: string, pageNumber: number): ParseIssue | null {
  const raw = removeControlChars(value ?? "").trim();

  if (!raw || raw === normalizedSku) {
    return null;
  }

  return {
    issueType: "SKU_NORMALIZED",
    message: `SKU normalized from "${raw}" to "${normalizedSku}".`,
    severity: "WARNING",
    pageNumber,
    sku: normalizedSku
  };
}

export function normalizeAwb(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return removeControlChars(value).replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function normalizeOrderNo(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return removeControlChars(value).replace(/\s+/g, "").replace(/[^A-Za-z0-9_]/g, "");
}

export function normalizeQty(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  const text = String(value ?? "").trim();
  const match = text.match(/\b([1-9]\d{0,3})\b/);
  return match ? Number(match[1]) : undefined;
}

export function normalizeCourier(value: string | null | undefined) {
  const text = compactWhitespace(value ?? "").toLowerCase();

  if (text.includes("delhivery")) {
    return "Delhivery";
  }

  if (text.includes("shadowfax")) {
    return "Shadowfax";
  }

  if (text.includes("xpress bees") || text.includes("xpressbees")) {
    return "Xpress Bees";
  }

  return value ? compactWhitespace(value) : undefined;
}

export function normalizePaymentType(value: string | null | undefined): MeeshoPaymentType {
  const text = compactWhitespace(value ?? "").toLowerCase();

  if (text.includes("prepaid") || text.includes("do not collect cash")) {
    return "PREPAID";
  }

  if (text.includes("cod") || text.includes("collect cash") || text.includes("payable amount")) {
    return "COD";
  }

  return "UNKNOWN";
}

export function isValidAwb(value: string | null | undefined) {
  const awb = normalizeAwb(value);

  if (!awb || awb.length < 8 || awb.includes("_")) {
    return false;
  }

  if (/^\d{6}$/.test(awb)) {
    return false;
  }

  if (/^\d{10,20}$/.test(awb)) {
    return true;
  }

  if (/^SF[A-Z0-9]{8,}$/.test(awb)) {
    return true;
  }

  return /^[A-Z]{2,}[A-Z0-9]{8,}$/.test(awb) && /\d/.test(awb);
}

export function scoreAndIssues(input: {
  awb?: string;
  sku?: string;
  orderNo?: string;
  qty?: number;
  courier?: string;
  productDescription?: string;
  paymentType?: MeeshoPaymentType;
  size?: string;
  pageNumber?: number;
  manifest?: boolean;
}) {
  const issues = [];
  let confidence = 0;

  if (input.awb) {
    confidence += 30;
  } else {
    issues.push({ issueType: "MISSING_AWB", message: "AWB was not found.", severity: "ERROR" as const, pageNumber: input.pageNumber });
  }

  if (input.sku) {
    confidence += 25;
  } else {
    issues.push({ issueType: "MISSING_SKU", message: "SKU was not found.", severity: "ERROR" as const, pageNumber: input.pageNumber });
  }

  if (input.orderNo) {
    confidence += 20;
  } else {
    issues.push({ issueType: "MISSING_ORDER_NO", message: "Order number was not found.", severity: "WARNING" as const, pageNumber: input.pageNumber });
  }

  if (input.qty) {
    confidence += 10;
  } else {
    issues.push({ issueType: "MISSING_QTY", message: "Quantity was not found.", severity: "ERROR" as const, pageNumber: input.pageNumber });
  }

  if (input.courier) {
    confidence += input.manifest ? 10 : 5;
  } else {
    issues.push({ issueType: "MISSING_COURIER", message: "Courier was not found.", severity: "WARNING" as const, pageNumber: input.pageNumber });
  }

  if (input.manifest && input.size) {
    confidence += 5;
  }

  if (!input.manifest && input.productDescription) {
    confidence += 5;
  }

  if (!input.manifest && input.paymentType && input.paymentType !== "UNKNOWN") {
    confidence += 5;
  }

  if (confidence < 70) {
    issues.push({ issueType: "LOW_CONFIDENCE", message: `Parser confidence is ${confidence}.`, severity: "WARNING" as const, pageNumber: input.pageNumber });
  }

  return { confidence, issues };
}
