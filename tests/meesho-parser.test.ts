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
