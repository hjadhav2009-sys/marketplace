import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpreadsheetRows } from "../lib/import/files";
import { findAwbSearchMatches } from "../lib/operations/awb-search";
import { selectConfirmPackedOrderIds, type ConfirmPackedScopeOrder } from "../lib/operations/packing";
import { normalizeSkuForMatching } from "../lib/sku";
import {
  dedupeFlipkartOrderRows,
  flipkartInternalOrderKey,
  flipkartOrderMappingIssue,
  parseFlipkartListingRows,
  parseFlipkartOrderRows
} from "../src/lib/marketplaces/flipkart";

const fixtureDir = join(process.cwd(), "tests", "fixtures", "flipkart");

async function readXlsxFixture(fileName: string) {
  const buffer = readFileSync(join(fixtureDir, fileName));
  const file = new File([new Uint8Array(buffer)], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  return parseSpreadsheetRows(file);
}

const orderRows = await readXlsxFixture("flipkart-order-export.fake.xlsx");
const listingRows = await readXlsxFixture("flipkart-listing-export.fake.xlsx");
const orderResult = parseFlipkartOrderRows(orderRows, "flipkart-order-export.fake.xlsx");
const listingResult = parseFlipkartListingRows(listingRows, "flipkart-listing-export.fake.xlsx");
const deduped = dedupeFlipkartOrderRows(orderResult.orders);

assert.equal(orderRows.length, 6, "Fake order XLSX rows load through spreadsheet parser");
assert.equal(listingRows.length, 4, "Fake listing XLSX rows load through spreadsheet parser");
assert.equal(orderResult.orders.length, 5, "Fake order XLSX parses valid and duplicate-key rows");
assert.equal(orderResult.issues.length, 1, "Fake order XLSX holds the row missing ORDER ITEM ID and Shipment ID");
assert.equal(orderResult.issues[0]?.issueType, "MISSING_FLIPKART_DUPLICATE_KEY", "Missing required key creates held issue");
assert.equal(listingResult.listings.length, 4, "Fake listing XLSX parses listing rows");
assert.equal(listingResult.issues.length, 0, "Fake listing XLSX has no missing Seller SKU rows");

assert.equal(deduped.importableOrders.length, 4, "Duplicate ORDER ITEM ID row is skipped from importable rows");
assert.equal(deduped.duplicateIssues.length, 1, "Duplicate ORDER ITEM ID is detected");
assert.equal(deduped.duplicateIssues[0]?.rowNumber, 5, "Duplicate issue keeps the original Excel row number");

const fallbackOrder = deduped.importableOrders.find((order) => order.sku === "FK-SKU-4");
assert.equal(fallbackOrder?.duplicateKey?.strategy, "SHIPMENT_ID_SKU", "Fallback duplicate key uses Shipment ID + SKU");
assert.equal(
  flipkartInternalOrderKey(fallbackOrder ?? {}),
  "FLIPKART:SHIPMENT_SKU:SHIP-FAKE-0004::FK-SKU-4",
  "Fallback duplicate key creates stable internal order key"
);

const listingBySku = new Map(listingResult.listings.map((listing) => [normalizeSkuForMatching(listing.sku), listing]));
const sku1Listing = listingBySku.get("FK-SKU-1");
const sku4Listing = listingBySku.get("FK-SKU-4");
assert.equal(sku1Listing?.sellerSkuId, "FK-SKU-1", "SKU joins to listing Seller SKU Id");
assert.equal(sku1Listing?.imageUrl, "https://example.invalid/images/fk-sku-1-large.jpg", "Listing image priority uses Image 1 1366 URL first");
assert.equal(sku4Listing?.imageUrl, undefined, "Fixture includes a listing row with no image URL");

const activeImageMappingSkus = new Set(listingResult.listings.filter((listing) => listing.imageUrl).map((listing) => normalizeSkuForMatching(listing.sku)));
const listingMissingImageSkus = new Set(listingResult.listings.filter((listing) => !listing.imageUrl).map((listing) => normalizeSkuForMatching(listing.sku)));
const sku3Order = deduped.importableOrders.find((order) => order.sku === "FK-SKU-3");
const sku4Order = deduped.importableOrders.find((order) => order.sku === "FK-SKU-4");
const missingListingIssue = sku3Order
  ? flipkartOrderMappingIssue(sku3Order, {
      hasActiveImageMapping: activeImageMappingSkus.has(normalizeSkuForMatching(sku3Order.sku)),
      listingFoundWithMissingImage: listingMissingImageSkus.has(normalizeSkuForMatching(sku3Order.sku))
    })
  : null;
const missingImageIssue = sku4Order
  ? flipkartOrderMappingIssue(sku4Order, {
      hasActiveImageMapping: activeImageMappingSkus.has(normalizeSkuForMatching(sku4Order.sku)),
      listingFoundWithMissingImage: listingMissingImageSkus.has(normalizeSkuForMatching(sku4Order.sku))
    })
  : null;

assert.equal(missingListingIssue?.issueType, "MISSING_FLIPKART_LISTING_MAPPING", "Missing SKU listing creates warning");
assert.equal(missingListingIssue?.message, "Missing Flipkart listing mapping for SKU: FK-SKU-3", "Missing listing warning message is explicit");
assert.equal(missingImageIssue?.issueType, "FLIPKART_LISTING_IMAGE_MISSING", "Listing exists but image missing creates warning");
assert.equal(missingImageIssue?.message, "Listing found but image missing for SKU: FK-SKU-4", "Missing image warning message is explicit");

const candidates = deduped.importableOrders.map((order, index) => ({
  id: `order-${index + 1}`,
  accountId: "account-1",
  awb: flipkartInternalOrderKey(order) ?? `fallback-${index}`,
  trackingId: order.trackingId,
  sku: order.sku ?? "",
  qty: order.quantity ?? 1,
  color: null,
  courier: null,
  packStatus: "READY" as const
}));
const trackingMatches = findAwbSearchMatches({
  candidates,
  accountId: "account-1",
  query: "FMPC0000000001",
  limit: 10
});

assert.equal(trackingMatches.length, 2, "Tracking ID search returns multiple shipment items");
assert.deepEqual(
  trackingMatches.map((match) => match.matchedField),
  ["TRACKING_ID", "TRACKING_ID"],
  "Tracking ID search marks the matched field"
);

const packingTarget: ConfirmPackedScopeOrder = {
  id: "ready-1",
  accountId: "account-1",
  marketplace: "FLIPKART",
  trackingId: "FMPC0000000001",
  packStatus: "READY"
};
const packingCandidates: ConfirmPackedScopeOrder[] = [
  packingTarget,
  {
    id: "ready-2",
    accountId: "account-1",
    marketplace: "FLIPKART",
    trackingId: "FMPC0000000001",
    packStatus: "READY"
  },
  {
    id: "already-packed",
    accountId: "account-1",
    marketplace: "FLIPKART",
    trackingId: "FMPC0000000001",
    packStatus: "PACKED"
  },
  {
    id: "problem",
    accountId: "account-1",
    marketplace: "FLIPKART",
    trackingId: "FMPC0000000001",
    packStatus: "PROBLEM"
  },
  {
    id: "other-tracking",
    accountId: "account-1",
    marketplace: "FLIPKART",
    trackingId: "FMPC0000000002",
    packStatus: "READY"
  }
];

assert.deepEqual(
  selectConfirmPackedOrderIds(packingTarget, packingCandidates).sort(),
  ["ready-1", "ready-2"],
  "Confirm packing selects only ready items for the scanned Tracking ID"
);

console.log("Flipkart import workflow tests passed.");
