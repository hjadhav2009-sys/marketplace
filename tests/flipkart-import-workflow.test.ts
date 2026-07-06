import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpreadsheetRows } from "../lib/import/files";
import { findAwbSearchMatches } from "../lib/operations/awb-search";
import { selectConfirmPackedOrderIds, type ConfirmPackedScopeOrder } from "../lib/operations/packing";
import { normalizeSkuForMatching } from "../lib/sku";
import {
  buildFlipkartDryRunSummary,
  chunkFlipkartListingRows,
  dedupeFlipkartOrderRows,
  dedupeFlipkartListingRows,
  flipkartInternalOrderKey,
  flipkartListingMasterData,
  flipkartOrderMappingIssue,
  parseFlipkartListingRows,
  parseFlipkartOrderRows,
  planFlipkartListingMasterImport,
  selectFlipkartListingImagesForOrderSkus
} from "../src/lib/marketplaces/flipkart";

const fixtureDir = join(process.cwd(), "tests", "fixtures", "flipkart");
const flipkartImportSource = readFileSync(join(process.cwd(), "src", "lib", "marketplaces", "flipkart", "import.ts"), "utf8");

async function readXlsxFixture(fileName: string) {
  const buffer = readFileSync(join(fixtureDir, fileName));
  const file = new File([new Uint8Array(buffer)], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  return parseSpreadsheetRows(file);
}

async function readFakeOrderCsvRows() {
  const csv = [
    "Ordered On,Shipment ID,ORDER ITEM ID,Order Id,FSN,SKU,Product,Quantity,Buyer name,Ship to name,City,State,PIN Code,Tracking ID",
    "07/06/26,SHIP-CSV-0001,OI-CSV-0001,ORDER-CSV-0001,FSNCSV0001,FK-SKU-CSV-1,Fake CSV Product,2,Test Buyer,Test Receiver,Test City,Test State,000000,FMPC0000000199"
  ].join("\n");
  const file = new File([csv], "flipkart-order-export.fake.csv", {
    type: "text/csv"
  });

  return parseSpreadsheetRows(file);
}

const orderRows = await readXlsxFixture("flipkart-order-export.fake.xlsx");
const listingRows = await readXlsxFixture("flipkart-listing-export.fake.xlsx");
const orderCsvRows = await readFakeOrderCsvRows();
const orderResult = parseFlipkartOrderRows(orderRows, "flipkart-order-export.fake.xlsx");
const orderCsvResult = parseFlipkartOrderRows(orderCsvRows, "flipkart-order-export.fake.csv");
const listingResult = parseFlipkartListingRows(listingRows, "flipkart-listing-export.fake.xlsx");
const deduped = dedupeFlipkartOrderRows(orderResult.orders);

assert.equal(orderRows.length, 6, "Fake order XLSX rows load through spreadsheet parser");
assert.equal(orderCsvRows.length, 1, "Fake order CSV rows load through spreadsheet parser");
assert.equal(orderCsvResult.orders[0]?.orderItemId, "OI-CSV-0001", "Fake order CSV extracts ORDER ITEM ID");
assert.equal(orderCsvResult.orders[0]?.trackingId, "FMPC0000000199", "Fake order CSV extracts Tracking ID");
assert.equal(orderCsvResult.orders[0]?.quantity, 2, "Fake order CSV parses quantity");
assert.equal(listingRows.length, 4, "Fake listing XLSX rows load through spreadsheet parser");
assert.equal(orderResult.orders.length, 5, "Fake order XLSX parses valid and duplicate-key rows");
assert.equal(orderResult.issues.length, 1, "Fake order XLSX holds the row missing ORDER ITEM ID and Shipment ID");
assert.equal(orderResult.issues[0]?.issueType, "MISSING_FLIPKART_DUPLICATE_KEY", "Missing required key creates held issue");
assert.equal(listingResult.listings.length, 4, "Fake listing XLSX parses listing rows");
assert.equal(listingResult.issues.length, 0, "Fake listing XLSX has no missing Seller SKU rows");
assert.equal(
  parseFlipkartListingRows([{ "Product Title": "No Seller SKU", "Image URL 1": "https://example.invalid/no-sku.jpg" }]).issues[0]?.issueType,
  "MISSING_SELLER_SKU_ID",
  "Missing Seller SKU Id creates issue"
);

const aliasOrderResult = parseFlipkartOrderRows([
  {
    " Order Item ID\n": "TESTITEMALIAS0001",
    "Shipment ID ": "TESTSHIPALIAS0001",
    "Sku": "FK-SKU-ALIAS",
    "Product": "Alias Product",
    "Quantity": "1",
    "Tracking Id": "FMPC0000000099",
    "invoice date (MM/DD/YY)": "07/05/26"
  }
]);
assert.equal(aliasOrderResult.orders[0]?.orderItemId, "TESTITEMALIAS0001", "Order Item ID alias with spaces/newline is parsed");
assert.equal(aliasOrderResult.orders[0]?.trackingId, "FMPC0000000099", "Tracking Id alias is parsed");
assert.equal(aliasOrderResult.orders[0]?.invoiceDate, "07/05/26", "Invoice Date case variation is parsed");

const aliasListingResult = parseFlipkartListingRows([
  {
    "\uFEFFSeller SKU ID": "FK-SKU-ALIAS",
    "Product Title": "Alias Listing",
    "Image 1 1366 Url": "https://example.invalid/images/alias-large.jpg",
    "Image URL 1": "https://example.invalid/images/alias-small.jpg"
  }
]);
assert.equal(aliasListingResult.listings[0]?.sellerSkuId, "FK-SKU-ALIAS", "Seller SKU ID alias with BOM is parsed");
assert.equal(aliasListingResult.listings[0]?.mainImageUrl, "https://example.invalid/images/alias-large.jpg", "Image 1 1366 Url alias is parsed with priority");

const imageAliasListingResult = parseFlipkartListingRows([
  {
    "Seller SKU Id": "FK-SKU-IMG-ALIAS-1",
    "Product Title": "Alias Image Product 1",
    "Image 1 1366 Url.": "https://example.invalid/images/alias-large-dot.jpg",
    "Image Url1": "https://example.invalid/images/alias-small-one.jpg"
  },
  {
    "Seller SKU Id": "FK-SKU-IMG-ALIAS-2",
    "Product Title": "Alias Image Product 2",
    "Image 2 1366URL": "https://example.invalid/images/alias-large-two.jpg",
    "Image URL2": "https://example.invalid/images/alias-small-two.jpg"
  }
]);
assert.equal(
  imageAliasListingResult.listings[0]?.mainImageUrl,
  "https://example.invalid/images/alias-large-dot.jpg",
  "Image 1 1366 Url. alias is preferred over Image Url1"
);
assert.equal(
  imageAliasListingResult.listings[1]?.mainImageUrl,
  "https://example.invalid/images/alias-large-two.jpg",
  "Image 2 1366URL alias is parsed before Image URL2"
);

assert.equal(deduped.importableOrders.length, 4, "Duplicate ORDER ITEM ID row is skipped from importable rows");
assert.equal(deduped.duplicateIssues.length, 1, "Duplicate ORDER ITEM ID is detected");
assert.equal(deduped.duplicateIssues[0]?.rowNumber, 5, "Duplicate issue keeps the original Excel row number");

const aliasListing = aliasListingResult.listings[0];

if (!aliasListing) {
  throw new Error("Expected alias listing row");
}

const duplicateListingResult = dedupeFlipkartListingRows([
  aliasListing,
  {
    ...aliasListing,
    rowNumber: 3,
    rawData: { "Seller SKU ID": "FK-SKU-ALIAS", "Product Title": "Duplicate Alias Listing" }
  }
]);
assert.equal(duplicateListingResult.importableListings.length, 1, "Duplicate Seller SKU Id keeps the first listing row");
assert.equal(duplicateListingResult.duplicateIssues[0]?.issueType, "DUPLICATE_SELLER_SKU_ID", "Duplicate Seller SKU Id creates issue");
assert.deepEqual(chunkFlipkartListingRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], "Listing import batching helper chunks rows safely");

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
assert.equal(sku1Listing?.mainImageUrl, "https://example.invalid/images/fk-sku-1-large.jpg", "Listing mainImageUrl follows image priority");
assert.equal(sku4Listing?.imageUrl, undefined, "Fixture includes a listing row with no image URL");
const sku1Master = sku1Listing ? flipkartListingMasterData(sku1Listing) : null;
assert.equal(sku1Master?.mainImageUrl, "https://example.invalid/images/fk-sku-1-large.jpg", "Listing master stores selected main image URL");
assert.equal(sku1Master?.image1366Url1, "https://example.invalid/images/fk-sku-1-large.jpg", "Listing master stores 1366 image columns");
assert.equal(sku1Master?.imageUrl1, "https://example.invalid/images/fk-sku-1-small.jpg", "Listing master stores normal image columns");

if (!sku1Master) {
  throw new Error("Expected FK-SKU-1 listing master data");
}

const listingPlanCreate = planFlipkartListingMasterImport([], [{ sellerSkuId: sku1Master.sellerSkuId, sku: sku1Master.sku, data: sku1Master }]);
assert.equal(listingPlanCreate.created.length, 1, "Listing import creates new SKU");
const listingPlanUnchanged = planFlipkartListingMasterImport([sku1Master], [{ sellerSkuId: sku1Master.sellerSkuId, sku: sku1Master.sku, data: sku1Master }]);
assert.equal(listingPlanUnchanged.unchanged.length, 1, "Listing import counts unchanged row");
const oldSku1Master = { ...sku1Master, productTitle: "Old Fake Title" };
const listingPlanUpdate = planFlipkartListingMasterImport([oldSku1Master], [{ sellerSkuId: sku1Master.sellerSkuId, sku: sku1Master.sku, data: sku1Master }]);
assert.equal(listingPlanUpdate.updated.length, 1, "Listing import updates existing SKU");

const selectedCacheListings = selectFlipkartListingImagesForOrderSkus(
  listingResult.listings.map((listing) => flipkartListingMasterData(listing)),
  ["FK-SKU-1", "FK-SKU-2", "FK-SKU-4"]
);
assert.deepEqual(
  selectedCacheListings.map((listing) => listing.sku).sort(),
  ["FK-SKU-1", "FK-SKU-2"],
  "Only today's order SKUs with images are selected for image cache"
);
assert.match(
  flipkartImportSource,
  /marketplaceListing\.findMany\(\{[\s\S]*sku: \{ in: orderSkus \}/,
  "Order import queries Listing Master only for order SKUs"
);
assert.match(
  flipkartImportSource,
  /marketplaceListing\.createMany\(\{/,
  "Flipkart Listing Master import bulk-creates new listings"
);
assert.match(
  flipkartImportSource,
  /marketplaceListing\.updateMany\(\{/,
  "Flipkart Listing Master import bulk-updates unchanged listing timestamps"
);

const dryRunSummary = buildFlipkartDryRunSummary({
  orderRows,
  listingRows
});
assert.equal(dryRunSummary.listingRowsTotal, 4, "Dry-run counts listing rows");
assert.equal(dryRunSummary.orderRowsTotal, 6, "Dry-run counts order rows");
assert.equal(dryRunSummary.orderRowsValid, 4, "Dry-run counts valid deduped order rows");
assert.equal(dryRunSummary.heldRows, 1, "Dry-run counts held order rows");
assert.equal(dryRunSummary.duplicateRows, 1, "Dry-run counts duplicate order rows");
assert.equal(dryRunSummary.missingListingCount, 1, "Dry-run counts missing listing SKUs");
assert.equal(dryRunSummary.missingImageCount, 1, "Dry-run counts listing rows with missing image for ordered SKUs");
assert.equal(dryRunSummary.multiItemTrackingIds[0]?.trackingId, "FMPC0000000001", "Dry-run reports multi-item Tracking IDs");
assert.equal(dryRunSummary.listingImageDiagnostics.image1366Url1NonEmpty, 2, "Dry-run counts Image 1 1366 URL rows");
assert.equal(dryRunSummary.listingImageDiagnostics.imageUrl1NonEmpty, 3, "Dry-run counts Image URL 1 rows");
assert.equal(dryRunSummary.listingImageDiagnostics.image1366Url2NonEmpty, 0, "Dry-run counts Image 2 1366 URL rows");
assert.equal(dryRunSummary.listingImageDiagnostics.imageUrl2NonEmpty, 0, "Dry-run counts Image URL 2 rows");
assert.equal(dryRunSummary.listingImageDiagnostics.anyImageUrlNonEmpty, 3, "Dry-run counts any normal image URL rows");
assert.equal(dryRunSummary.listingImageDiagnostics.anyImage1366UrlNonEmpty, 2, "Dry-run counts any 1366 image URL rows");
assert.equal(dryRunSummary.listingImageDiagnostics.selectedMainImageUrlNonEmpty, 3, "Dry-run counts selected main image rows");
assert.equal(dryRunSummary.listingImageDiagnostics.validSkuAllImageFieldsBlank, 1, "Dry-run counts valid SKU rows with blank image fields");

const activeImageMappingSkus = new Set(listingResult.listings.filter((listing) => listing.imageUrl).map((listing) => normalizeSkuForMatching(listing.sku)));
const sku3Order = deduped.importableOrders.find((order) => order.sku === "FK-SKU-3");
const sku4Order = deduped.importableOrders.find((order) => order.sku === "FK-SKU-4");
const missingListingIssue = sku3Order
  ? flipkartOrderMappingIssue(sku3Order, {
      listingFound: listingBySku.has(normalizeSkuForMatching(sku3Order.sku)),
      hasMainImage: activeImageMappingSkus.has(normalizeSkuForMatching(sku3Order.sku))
    })
  : null;
const missingImageIssue = sku4Order
  ? flipkartOrderMappingIssue(sku4Order, {
      listingFound: listingBySku.has(normalizeSkuForMatching(sku4Order.sku)),
      hasMainImage: activeImageMappingSkus.has(normalizeSkuForMatching(sku4Order.sku))
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
const trackingMatchesWithListings = trackingMatches.map((match) => ({
  ...match,
  listing: listingBySku.get(normalizeSkuForMatching(match.sku))
}));
assert.equal(trackingMatchesWithListings[0]?.listing?.productTitle?.startsWith("Fake Flipkart Product"), true, "Tracking ID scan returns order data plus listing data");

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
