import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { loadProductDetail, parseManualLocks, productImageUrls, PRODUCT_DETAIL_ATTRIBUTE_PAGE_SIZE } from "../lib/product-inventory-details";
import { loadMissingListings, MISSING_LISTINGS_PAGE_SIZE } from "../lib/missing-listing-read";

const read = (path: string) => readFileSync(path, "utf8");
const detailAdapter = read("app/owner/product-inventory/[listingId]/page.tsx");
const detailView = read("components/ProductInventoryDetails.tsx");
const editAdapter = read("app/owner/product-inventory/[listingId]/edit/page.tsx");
const editForm = read("components/ProfessionalListingForm.tsx");
const missingAdapter = read("app/owner/catalog/missing/page.tsx");
const missingView = read("components/MissingListingsWorkspace.tsx");
const resolutionAdapter = read("app/owner/catalog/missing/[issueId]/page.tsx");
const resolutionView = read("components/MissingListingResolutionWorkspace.tsx");
const boundedForm = read("components/BoundedMarketplaceListingForm.tsx");
const actions = read("app/owner/catalog/missing/actions.ts");

assert.equal(PRODUCT_DETAIL_ATTRIBUTE_PAGE_SIZE, 40);
assert.equal(MISSING_LISTINGS_PAGE_SIZE, 25);
assert.match(detailAdapter, /requireUser\(\['OWNER'\]\)/);
assert.match(detailAdapter, /requireAccount\(user\)/);
assert.match(detailView, /Show empty fields/);
assert.match(detailView, /Advanced marketplace attributes/);
assert.match(detailView, /expectedUpdatedAt/);
assert.match(detailView, /saveCatalogFieldLocksAction/);
assert.doesNotMatch(detailView, /randomUUID/, "Detail form markup must not use a render-time random value.");
assert.match(editAdapter, /updateManualListingAction/);
for (const name of ["sellerSku", "productTitle", "brand", "category", "subCategory", "fsn", "listingIdentifier", "listingStatus", "mrp", "sellingPrice", "mainImageUrl", "description", "manualLocked"]) assert.match(editForm, new RegExp(`name=\\"${name}\\"`));
assert.match(editForm, /listing-edit:.*updatedAt\.toISOString/, "The hydrated edit form derives a stable version-specific request ID.");
assert.match(missingAdapter, /MissingListingsWorkspace/);
assert.match(missingView, /All sources/);
assert.match(missingView, /Resolve row/);
assert.match(resolutionAdapter, /MissingListingResolutionWorkspace/);
for (const label of ["Link existing", "Create minimal", "Create full"]) assert.ok(resolutionView.includes(label));
assert.doesNotMatch(resolutionView, /aria-current/, "The local resolution selector must not create a second page-current item beside shell navigation.");
assert.match(resolutionView, /\(selected\)/, "The active resolution method remains explicit to assistive technology.");
assert.match(resolutionView, /searchProductInventory/);
assert.match(resolutionView, /savedCandidateIds/);
assert.doesNotMatch(resolutionView, /randomUUID/, "Resolution form markup must not use a render-time random value.");
assert.match(resolutionView, /stableActionRequestId/);
assert.match(boundedForm, /ADVANCED_PAGE_SIZE = 40/);
assert.match(boundedForm, /slice\(\(page - 1\) \* ADVANCED_PAGE_SIZE, page \* ADVANCED_PAGE_SIZE\)/);
assert.match(boundedForm, /attributeValues/);
assert.doesNotMatch(detailView + editForm + missingView + resolutionView + boundedForm, /overflow-x-hidden|animate-|transition-transform|gradient|backdrop-blur/);
assert.match(actions, /resolveMissingListing\(/, "The mature resolution service remains the only mutation entry point.");
assert.doesNotMatch(actions, /prisma\./, "D2 route actions do not introduce direct mutation queries.");

assert.deepEqual([...parseManualLocks('["productTitle","mrp"]')], ["productTitle", "mrp"]);
assert.deepEqual([...parseManualLocks('{"description":true,"mrp":false}')], ["description"]);
assert.deepEqual(productImageUrls({ imageUrl1: "https://example.test/a.jpg", mainImageUrl: "https://example.test/a.jpg", image1366Url2: "https://example.test/b.jpg" }), ["https://example.test/b.jpg", "https://example.test/a.jpg"]);

const { db, cleanup } = createTempWorkflowDb("phase-7-4d2-details-missing");
try {
  await db.account.createMany({ data: [
    { id: "d2-a", name: "D2 A", code: "D2-A", marketplace: "FLIPKART" },
    { id: "d2-b", name: "D2 B", code: "D2-B", marketplace: "FLIPKART" }
  ] });
  await db.marketplaceListing.createMany({ data: [
    { id: "d2-listing", accountId: "d2-a", marketplace: "FLIPKART", sellerSkuId: "D2-SKU", sku: "D2-SKU", productTitle: "D2 bounded detail", manualLocksJson: '{"productTitle":true}' },
    { id: "d2-neighbour", accountId: "d2-b", marketplace: "FLIPKART", sellerSkuId: "D2-SKU", sku: "D2-SKU", productTitle: "Wrong account" }
  ] });
  await db.marketplaceListingAttribute.createMany({ data: Array.from({ length: 105 }, (_, index) => ({
    id: `d2-attribute-${index}`,
    marketplaceListingId: "d2-listing",
    accountId: "d2-a",
    marketplace: "FLIPKART",
    technicalKey: `technical_${String(index).padStart(3, "0")}`,
    displayLabel: index === 73 ? "Distinctive D2 attribute" : `Attribute ${String(index).padStart(3, "0")}`,
    valueJson: JSON.stringify(`Value ${index}`),
    valueText: `Value ${index}`,
    sourceAuthority: "SYNTHETIC_D2",
    manualLocked: index === 73
  })) });
  const first = await loadProductDetail(db, { accountId: "d2-a", listingId: "d2-listing" });
  assert.equal(first?.attributeTotal, 105);
  assert.equal(first?.attributes.length, 40);
  const last = await loadProductDetail(db, { accountId: "d2-a", listingId: "d2-listing", attributePage: 999 });
  assert.equal(last?.page, 3);
  assert.equal(last?.attributes.length, 25);
  const searched = await loadProductDetail(db, { accountId: "d2-a", listingId: "d2-listing", attributeQuery: "Distinctive D2" });
  assert.equal(searched?.filteredTotal, 1);
  assert.equal(searched?.attributes[0]?.technicalKey, "technical_073");
  assert.equal(await loadProductDetail(db, { accountId: "d2-b", listingId: "d2-listing" }), null, "Detail lookup cannot cross seller accounts.");

  await db.uploadBatch.create({ data: { id: "d2-upload", accountId: "d2-a", fileName: "synthetic.csv" } });
  await db.order.create({ data: { id: "d2-order", accountId: "d2-a", batchId: "d2-upload", marketplace: "FLIPKART", awb: "D2-AWB", sku: "ORDER-SKU", orderNo: "D2-ORDER", qty: 4, productDescription: "Held order product" } });
  await db.importRowIssue.createMany({ data: Array.from({ length: 27 }, (_, index) => ({
    id: `d2-order-issue-${index}`,
    batchId: "d2-upload",
    rowNumber: index + 1,
    issueType: index === 0 ? "AMBIGUOUS_LISTING" : "MISSING_FLIPKART_LISTING_MAPPING",
    message: index === 0 ? "Multiple exact candidates" : "No exact listing",
    safeDataJson: JSON.stringify({ sellerSku: index === 0 ? "AMBIGUOUS-ORDER" : `ORDER-SKU-${index}` }),
    sourceType: "ORDER",
    sourceId: "d2-order"
  })) });
  await db.consignmentBatch.create({ data: { id: "d2-consignment", accountId: "d2-a", marketplace: "FLIPKART", externalConsignmentNumber: "D2-CN", displayName: "D2 Consignment", sourceFileName: "synthetic.csv", sourceFileSha256: "d2-sha" } });
  await db.consignmentLine.create({ data: { id: "d2-line", consignmentBatchId: "d2-consignment", accountId: "d2-a", rowNumber: 1, sellerSkuSource: "CONSIGNMENT-SKU", productNameSource: "Held consignment product", requiredQuantity: 7, matchStatus: "NOT_FOUND" } });
  await db.consignmentImportIssue.create({ data: { id: "d2-consignment-issue", consignmentBatchId: "d2-consignment", consignmentLineId: "d2-line", rowNumber: 1, issueType: "NOT_FOUND", severity: "ERROR", message: "No exact consignment listing" } });
  const all = await loadMissingListings(db, "d2-a", "FLIPKART", { page: 1 });
  assert.equal(all.total, 28);
  assert.equal(all.items.length, 25);
  assert.ok(all.items.every((item) => item.source === "ORDER"), "Deterministic combined pagination reads the bounded Order segment first.");
  const second = await loadMissingListings(db, "d2-a", "FLIPKART", { page: 2 });
  assert.equal(second.items.length, 3);
  assert.equal(second.items.at(-1)?.source, "CONSIGNMENT");
  const consignments = await loadMissingListings(db, "d2-a", "FLIPKART", { source: "consignments" });
  assert.equal(consignments.total, 1);
  assert.equal(consignments.items[0]?.quantity, 7);
  const ambiguous = await loadMissingListings(db, "d2-a", "FLIPKART", { reason: "ambiguous" });
  assert.equal(ambiguous.total, 1);
  assert.equal(ambiguous.items[0]?.sellerSku, "AMBIGUOUS-ORDER");
  assert.equal((await loadMissingListings(db, "d2-b", "FLIPKART", {})).total, 0, "Missing workspace cannot cross seller accounts.");
} finally {
  await cleanup();
}

console.log("Phase 7.4D2 Product Details, Edit Listing, Missing Listings, and bounded form tests passed.");
