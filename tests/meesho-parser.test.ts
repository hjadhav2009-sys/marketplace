import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crossCheckMeeshoParsedRows, parseMeeshoTextPages } from "../lib/parsers/meesho";
import { normalizeSku } from "../lib/parsers/meesho/normalize";
import type { MeeshoTextPage } from "../lib/parsers/meesho/types";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "meesho");

function fixture(name: string) {
  return readFileSync(join(fixtureDir, name), "utf8");
}

function parseText(fileName: string, pages: MeeshoTextPage[]) {
  return parseMeeshoTextPages(fileName, pages);
}

const labelResult = parseText("Sub_Order_Labels_sample.pdf", [{ pageNumber: 1, text: fixture("label-page-1.txt") }]);
const labelOrder = labelResult.labelOrders[0];

assert.equal(labelResult.detectedType, "LABEL_PDF", "Label PDF is classified");
assert.equal(labelOrder?.awb, "1490834915493571", "Label extracts Delhivery AWB");
assert.equal(labelOrder?.courier, "Delhivery", "Label extracts courier");
assert.equal(labelOrder?.sku, "1202919298_6", "Label extracts SKU");
assert.equal(labelOrder?.qty, 1, "Label extracts quantity");
assert.equal(labelOrder?.color, "Silver", "Label extracts color");
assert.equal(labelOrder?.size, "Free Size", "Label extracts size");
assert.equal(labelOrder?.orderNo, "290010756104090432_1", "Label extracts order number");

function labelText(productRow: string) {
  return `TAX INVOICE
Supplier Name : Sullery
Customer Address
Name Example
Return Code
Delhivery
1490834915493571
Product Details
SKU Size Qty Color Order No.
${productRow}
Purchase Order No.
290424589610289984`;
}

const ampersandSkuLabel = parseText("Sub_Order_Labels_ampersand_sku.pdf", [
  { pageNumber: 1, text: labelText("SUL-BR-PB-GR & WH-CR03 Free Size 1 Green 290424589610289984_1") }
]).labelOrders[0];
assert.equal(ampersandSkuLabel?.sku, "SUL-BR-PB-GR & WH-CR03", "Label preserves SKU with spaces and ampersand");
assert.equal(ampersandSkuLabel?.size, "Free Size", "Label parses Free Size as one value for ampersand SKU");
assert.equal(ampersandSkuLabel?.qty, 1, "Label parses quantity before color for ampersand SKU");
assert.equal(ampersandSkuLabel?.color, "Green", "Label parses color before order number for ampersand SKU");

const spacedHyphenSkuLabel = parseText("Sub_Order_Labels_spaced_hyphen_sku.pdf", [
  { pageNumber: 1, text: labelText("Sullery Earing - 29 Free Size 1 Silver 290172654185515840_1") }
]).labelOrders[0];
assert.equal(spacedHyphenSkuLabel?.sku, "Sullery Earing - 29", "Label preserves SKU with spaces and hyphen");
assert.equal(spacedHyphenSkuLabel?.size, "Free Size", "Label parses Free Size for spaced hyphen SKU");
assert.equal(spacedHyphenSkuLabel?.qty, 1, "Label parses quantity for spaced hyphen SKU");
assert.equal(spacedHyphenSkuLabel?.color, "Silver", "Label parses color for spaced hyphen SKU");

const simpleHyphenSkuLabel = parseText("Sub_Order_Labels_simple_hyphen_sku.pdf", [
  { pageNumber: 1, text: labelText("Sullery-BR-SS-BL-Radhe25 Free Size 1 Gold 290462311420818241_2") }
]).labelOrders[0];
assert.equal(simpleHyphenSkuLabel?.sku, "Sullery-BR-SS-BL-Radhe25", "Label preserves compact hyphen SKU");
assert.equal(simpleHyphenSkuLabel?.orderNo, "290462311420818241_2", "Label accepts _2 order numbers");

const wrappedAllahSkuLabel = parseText("Sub_Order_Labels_wrapped_allah_sku.pdf", [
  { pageNumber: 1, text: labelText("Sullery-BR-ME-BL\nAllah34 Free Size 1 Gold 290462311420818241_2") }
]).labelOrders[0];
assert.equal(wrappedAllahSkuLabel?.sku, "Sullery-BR-ME-BL-Allah34", "Label rejoins wrapped Allah SKU with a hyphen");

const wrappedBalajiSkuLabel = parseText("Sub_Order_Labels_wrapped_balaji_sku.pdf", [
  { pageNumber: 1, text: labelText("Sullery-BR-SS-BL\nBalaji27 Free Size 1 Gold 290462311420818241_2") }
]).labelOrders[0];
assert.equal(wrappedBalajiSkuLabel?.sku, "Sullery-BR-SS-BL-Balaji27", "Label rejoins wrapped Balaji SKU with a hyphen");

const orderNumberBeforeAwb = parseText("Sub_Order_Labels_order_before_awb.pdf", [
  {
    pageNumber: 1,
    text: `TAX INVOICE
Supplier Name : Sullery
Purchase Order No.
290010756104090432
Invoice No.
zhjsh272529
Customer Address
Name Example
560068
Return Code
Delhivery
1490834915493571
Product Details
SKU Size Qty Color Order No.
1202919298_6 Free Size 1 Silver 290010756104090432_1`
  }
]).labelOrders[0];
assert.equal(orderNumberBeforeAwb?.awb, "1490834915493571", "Label prefers courier/return-code AWB even when order number appears first");

const shadowfaxLabel = parseText("Sub_Order_Labels_shadowfax.pdf", [{ pageNumber: 1, text: fixture("label-page-shadowfax.txt") }]).labelOrders[0];
assert.equal(shadowfaxLabel?.awb, "SF3423949467FPL", "Label extracts Shadowfax AWB");
assert.equal(shadowfaxLabel?.sku, "176308762", "Label extracts Shadowfax SKU");

const picklistResult = parseText("Supplier_Manifest_picklist.pdf", [{ pageNumber: 1, text: fixture("manifest-picklist-page-1.txt") }]);
assert.equal(picklistResult.detectedType, "MANIFEST_PDF", "Picklist PDF is classified as manifest");
assert.equal(picklistResult.picklistSummaryRows.find((row) => row.sku === "176308762")?.totalQuantity, 10, "Picklist extracts 176308762 total");
assert.equal(picklistResult.picklistSummaryRows.find((row) => row.sku === "1202919298_6")?.color, "Silver", "Picklist extracts 1202919298_6 color");
assert.equal(picklistResult.picklistSummaryRows.find((row) => row.sku === "1202919298_6")?.size, "Free Size", "Picklist extracts size");
assert.equal(picklistResult.picklistSummaryRows.find((row) => row.sku === "1202919298_6")?.totalQuantity, 1, "Picklist extracts 1202919298_6 total");

const delhiveryManifest = parseText("Supplier_Manifest_delhivery.pdf", [{ pageNumber: 1, text: fixture("manifest-delhivery-page-1.txt") }]);
const delhiveryOrder = delhiveryManifest.manifestOrders[0];
assert.equal(delhiveryOrder?.orderNo, "290010756104090432_1", "Manifest reconstructs wrapped sub order number");
assert.equal(delhiveryOrder?.awb, "1490834915493571", "Manifest extracts Delhivery AWB");
assert.equal(delhiveryOrder?.sku, "1202919298_6", "Manifest extracts Delhivery SKU");

const shadowfaxManifest = parseText("Supplier_Manifest_shadowfax.pdf", [{ pageNumber: 1, text: fixture("manifest-shadowfax-page-1.txt") }]);
assert.equal(shadowfaxManifest.manifestOrders[0]?.awb, "SF3423949467FPL", "Manifest extracts alphanumeric Shadowfax AWB");

const xpressBeesManifest = parseText("Supplier_Manifest_xpressbees.pdf", [{ pageNumber: 1, text: fixture("manifest-xpressbees-page-1.txt") }]);
assert.equal(xpressBeesManifest.manifestOrders[0]?.awb, "13409696927756", "Manifest extracts Xpress Bees numeric AWB");

assert.equal(normalizeSku("SUL-BR-PB-GR & WH-CR03"), "SUL-BR-PB-GR & WH-CR03", "SKU normalization preserves ampersands");
assert.equal(normalizeSku("Sullery Earing - 29"), "Sullery Earing - 29", "SKU normalization preserves spaces inside SKU names");
assert.equal(normalizeSku("SUL-PN-BC-SS-BL￾Allah40"), "SUL-PN-BC-SS-BL-Allah40", "Hidden SKU separator normalizes to hyphen");
assert.equal(normalizeSku("SUL-BR-SS-BL￾Shyam44"), "SUL-BR-SS-BL-Shyam44", "Second hidden SKU separator normalizes to hyphen");
assert.equal(delhiveryManifest.manifestOrders[1]?.sku, "SUL-PN-BC-SS-BL-Allah40", "Manifest normalizes hidden SKU separator");
assert.equal(shadowfaxManifest.manifestOrders[1]?.sku, "SUL-BR-SS-BL-Shyam44", "Manifest normalizes hidden SKU separator in Shadowfax row");

const duplicateResult = parseText("Sub_Order_Labels_duplicate.pdf", [
  { pageNumber: 1, text: fixture("label-page-1.txt") },
  { pageNumber: 2, text: fixture("label-page-1.txt") }
]);
assert.equal(duplicateResult.stats.duplicateAwbInsideFile, 1, "Duplicate AWB inside one parsed file is counted");
assert.equal(
  duplicateResult.issues.some((issue) => issue.issueType === "DUPLICATE_AWB_INSIDE_FILE"),
  true,
  "Duplicate AWB inside one parsed file is flagged"
);

const crossSourceSameAwbResult = parseText("Sub_Order_Labels_and_Manifest_same_awb.pdf", [
  { pageNumber: 1, text: fixture("label-page-1.txt") },
  { pageNumber: 2, text: fixture("manifest-delhivery-page-1.txt") }
]);
assert.equal(crossSourceSameAwbResult.stats.duplicateAwbInsideFile, 0, "Label plus manifest match is not counted as an inside-file duplicate");
assert.equal(
  crossSourceSameAwbResult.issues.some((issue) => issue.issueType === "DUPLICATE_AWB_INSIDE_FILE"),
  false,
  "Cross-source AWB match is used for cross-check, not duplicate warning"
);

const lowConfidenceResult = parseText("Sub_Order_Labels_low_confidence.pdf", [
  {
    pageNumber: 1,
    text: "TAX INVOICE\nCustomer Address\nProduct Details\nSKU Size Qty Color Order No.\nDelhivery"
  }
]);
assert.equal(lowConfidenceResult.labelOrders[0]?.issues.some((issue) => issue.issueType === "LOW_CONFIDENCE"), true, "Low confidence rows are flagged");
assert.equal(lowConfidenceResult.labelOrders[0]?.issues.some((issue) => issue.issueType === "MISSING_AWB"), true, "Missing AWB is not silently imported");

const scannedLikeResult = parseText("Scanned_like.pdf", [
  { pageNumber: 1, text: "" },
  { pageNumber: 2, text: "   " },
  { pageNumber: 3, text: "x" }
]);
assert.equal(scannedLikeResult.diagnostics.pagesWithText, 0, "Empty scanned-like pages are not counted as text pages");
assert.equal(scannedLikeResult.diagnostics.pagesWithoutText, 3, "Empty scanned-like pages are counted");
assert.equal(scannedLikeResult.diagnostics.scannedPdfLikely, true, "Scanned-like PDFs are detected");
assert.equal(
  scannedLikeResult.diagnostics.parserWarnings.includes("Scanned/image PDF; OCR required."),
  true,
  "Scanned-like PDFs show the OCR-required warning"
);

const mixedTextDiagnostics = parseText("Mixed_text.pdf", [
  { pageNumber: 1, text: fixture("label-page-1.txt") },
  { pageNumber: 2, text: "" }
]);
assert.equal(mixedTextDiagnostics.diagnostics.pagesWithText, 1, "Diagnostics count pages with text");
assert.equal(mixedTextDiagnostics.diagnostics.pagesWithoutText, 1, "Diagnostics count pages without text");

const unknownLayoutResult = parseText("Unknown_layout.pdf", [
  {
    pageNumber: 1,
    text: "Warehouse packing report\nThis page has selectable text but no Meesho label or courier table markers."
  }
]);
assert.equal(unknownLayoutResult.detectedType, "UNKNOWN", "Unknown text layout is classified as unknown");
assert.equal(unknownLayoutResult.diagnostics.unknownLayoutPages, 1, "Unknown layout pages are counted");
assert.equal(
  unknownLayoutResult.issues.some((issue) => issue.issueType === "UNKNOWN_LAYOUT_PAGE"),
  true,
  "Unknown layout pages are flagged"
);
assert.equal(
  unknownLayoutResult.diagnostics.parserWarnings.includes("Unknown layout or unsupported Meesho format."),
  true,
  "Unknown text layouts show a clear unsupported-format warning"
);

const orderNumberOnlyLabel = parseText("Sub_Order_Labels_order_number_only.pdf", [
  {
    pageNumber: 1,
    text: `TAX INVOICE
Supplier Name : Sullery
Purchase Order No.
290010756104090432
Invoice No.
INV123456
GSTIN 29ABCDE1234F1Z5
Customer Address
560068
Product Details
SKU Size Qty Color Order No.
1202919298_6 Free Size 1 Silver 290010756104090432_1`
  }
]).labelOrders[0];
assert.equal(orderNumberOnlyLabel?.awb, undefined, "Label parser does not use order numbers, invoice numbers, GSTIN, or PIN codes as AWB");

const wrappedManifest = parseText("Supplier_Manifest_wrapped.pdf", [
  {
    pageNumber: 1,
    text: `Courier : Delhivery
Supplier Name : Sullery
S. No. Sub Order No. AWB SKU Qty. Size Packed
1 290010756104
090432_1 1490834915493571 SUL-PN-BC-SS-BL
Allah40 1 Free Size No`
  }
]);
assert.equal(wrappedManifest.manifestOrders[0]?.orderNo, "290010756104090432_1", "Manifest tolerates wrapped sub order number");
assert.equal(wrappedManifest.manifestOrders[0]?.sku, "SUL-PN-BC-SS-BL-Allah40", "Manifest tolerates wrapped SKU");
assert.equal(
  wrappedManifest.manifestOrders[0]?.issues.some((issue) => issue.issueType === "SKU_NORMALIZED"),
  true,
  "Manifest warns when a parsed SKU is normalized"
);

const wrappedSulleryManifest = parseText("Supplier_Manifest_wrapped_sullery_sku.pdf", [
  {
    pageNumber: 1,
    text: `Courier : Delhivery
Supplier Name : Sullery
S. No. Sub Order No. AWB SKU Qty. Size Packed
1 290462311420818241_2 1490834915493571 Sullery-BR-ME-BL
Allah34 1 Free Size No
2 290462311420818242_1 1490834915493572 SUL-BR-PB-GR & WH-CR03 1 Free Size No`
  }
]);
assert.equal(wrappedSulleryManifest.manifestOrders[0]?.sku, "Sullery-BR-ME-BL-Allah34", "Manifest rejoins wrapped Sullery SKU");
assert.equal(wrappedSulleryManifest.manifestOrders[1]?.sku, "SUL-BR-PB-GR & WH-CR03", "Manifest preserves SKU spaces and ampersand");

const unknownManifestRow = parseText("Supplier_Manifest_unknown_row.pdf", [
  {
    pageNumber: 1,
    text: `Courier : Delhivery
Supplier Name : Sullery
S. No. Sub Order No. AWB SKU Qty. Size Packed
1 unreadable row without enough columns`
  }
]);
assert.equal(
  unknownManifestRow.manifestOrders[0]?.issues.some((issue) => issue.issueType === "UNKNOWN_LAYOUT_ROW"),
  true,
  "Unknown manifest row blocks are marked for review"
);

const mismatchManifest = parseText("Supplier_Manifest_mismatch.pdf", [
  {
    pageNumber: 1,
    text: "Courier : Delhivery\nSupplier Name : Sullery\nS. No. Sub Order No. AWB SKU Qty. Size Packed\n1 290010756104090432_1 1490834915493571 DIFFERENT_SKU 1 Free Size No"
  }
]);
const crossCheckIssues = crossCheckMeeshoParsedRows({
  labelOrders: labelResult.labelOrders,
  manifestOrders: mismatchManifest.manifestOrders,
  picklistSummaryRows: []
});
assert.equal(crossCheckIssues.some((issue) => issue.issueType === "SKU_MISMATCH"), true, "Cross-check detects SKU mismatch for same AWB");

const summaryColorSplitIssues = crossCheckMeeshoParsedRows({
  labelOrders: [],
  manifestOrders: [
    {
      pageNumber: 1,
      sourceType: "MANIFEST_ORDER",
      courier: "Delhivery",
      awb: "1490834915493571",
      sku: "SAME_SKU",
      qty: 2,
      size: "Free Size",
      orderNo: "ORDER1",
      rawRowText: "1 ORDER1 1490834915493571 SAME_SKU 2 Free Size No",
      confidence: 100,
      issues: []
    }
  ],
  picklistSummaryRows: [
    {
      pageNumber: 1,
      sourceType: "PICKLIST_SUMMARY",
      sku: "SAME_SKU",
      color: "Silver",
      size: "Free Size",
      totalQuantity: 1,
      rawRowText: "SAME_SKU Silver Free Size 1",
      confidence: 100,
      issues: []
    },
    {
      pageNumber: 1,
      sourceType: "PICKLIST_SUMMARY",
      sku: "SAME_SKU",
      color: "Black",
      size: "Free Size",
      totalQuantity: 1,
      rawRowText: "SAME_SKU Black Free Size 1",
      confidence: 100,
      issues: []
    }
  ]
});
assert.equal(
  summaryColorSplitIssues.some((issue) => issue.issueType === "SUMMARY_QTY_MISMATCH"),
  false,
  "Summary aggregate by SKU and size avoids false mismatch when manifest has no color"
);

console.log("Meesho parser tests passed.");
