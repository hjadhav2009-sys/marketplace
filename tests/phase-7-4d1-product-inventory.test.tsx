import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IdentifierType } from "@prisma/client";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { searchProductInventory } from "../src/lib/product-inventory/search";
import { filterSummary, marketplaceIdentities, markingLabel, normalizeProcessingFilter, processingLabel, productInventoryHref } from "../app/owner/product-inventory/presentation";

const read = (file: string) => readFileSync(file, "utf8");
const page = read("app/owner/product-inventory/page.tsx");
const filters = read("app/owner/product-inventory/InventoryFilters.tsx");
const card = read("app/owner/product-inventory/InventoryCard.tsx");
const presentation = read("app/owner/product-inventory/presentation.ts");
const querySource = read("src/lib/product-inventory/search.ts");
const importArchitecture = read("docs/architecture/MARKETPLACE_IMPORT_ARCHITECTURE_V2.md");
const permissionArchitecture = read("docs/architecture/ACCOUNT_PERMISSION_MODEL_V1.md");

assert.match(page, /requireUser\(\["OWNER"\]\)/, "Current OWNER authorization remains server-side.");
assert.match(page, /requireAccount\(user\)/, "The selected seller account remains mandatory.");
assert.match(page, /marketplace: account\.marketplace/, "List and summary reads are marketplace-scoped.");
assert.match(page, /Marketplace product and listing catalog\./);
assert.match(page, /\/owner\/product-inventory\/refresh/);
assert.match(page, /\/owner\/catalog\/missing/);
assert.doesNotMatch(page, /\/owner\/product-inventory\/new/, "Create Listing is not pulled into the D1 primary action group.");
assert.match(page, /Metric/);
assert.match(page, /EmptyState/);
assert.match(page, /buttonStyles/);
assert.match(page, /Page \{currentPage\} of \{pages\}/);
assert.doesNotMatch(page + filters + card, /overflow-x-hidden|animate-|transition-transform|use client/, "D1 adds neither overflow masking nor decorative/client motion.");

for (const name of ["q", "status", "image", "processing"]) assert.match(filters, new RegExp(`name="${name}"`));
assert.match(filters, /<details/);
assert.match(filters, /Search products/);
assert.match(filters, /Apply filters/);
assert.match(card, /ProductImage/);
assert.match(card, /priority=\{priority\}/);
assert.match(presentation, /Seller SKU/);
assert.match(card, /Refreshed/);
assert.match(card, /Details/);
assert.match(querySource, /identifierType: \{ in: \["SELLER_SKU", "FSN", "LISTING_ID", "ASIN", "FNSKU"\]/, "List rows select only primary marketplace identity types.");
assert.match(page, /marketplaceListingAttribute\.findMany[\s\S]*take: result\.listings\.length \* 4/, "Meesho display attributes use a page-bounded secondary query.");
assert.equal(processingLabel("PICK_PACK"), "Direct to Pack");
assert.equal(processingLabel("PICK_MARK_PACK"), "Marking");
assert.equal(processingLabel("PICK_ASSEMBLE_PACK"), "Assembly");
assert.equal(processingLabel("PICK_MARK_ASSEMBLE_PACK"), "Marking + Assembly");
assert.equal(processingLabel(null), "No saved default");
assert.equal(normalizeProcessingFilter("PICK_MARK_PACK"), "PICK_MARK_PACK");
assert.equal(normalizeProcessingFilter("NOT_A_ROUTE"), "all", "Unsupported URL processing values normalize to the unfiltered state.");
assert.equal(markingLabel("PICK_MARK_PACK", true), "Marking configured");
assert.equal(markingLabel("PICK_MARK_PACK", false), "Marking not configured");
assert.equal(markingLabel("PICK_PACK", false), "Marking not required by default");

const flipkart = marketplaceIdentities({ marketplace: "FLIPKART", sellerSkuId: "FK-SKU", sku: "INT", fsn: "FK-FSN", listingId: "FK-LID", identifiers: [], attributes: [] });
assert.deepEqual(flipkart.map((item) => item.label), ["Seller SKU", "FSN", "Listing ID"]);
const amazon = marketplaceIdentities({ marketplace: "AMAZON", sellerSkuId: "AMZ-SKU", sku: "INT", fsn: null, listingId: null, identifiers: [{ identifierType: "ASIN", rawValue: "B000D1" }, { identifierType: "FNSKU", rawValue: "FNSKU-D1" }], attributes: [] });
assert.deepEqual(amazon.map((item) => item.value), ["AMZ-SKU", "B000D1", "FNSKU-D1"]);
const meesho = marketplaceIdentities({ marketplace: "MEESHO", sellerSkuId: "MEE-SKU", sku: "INT", fsn: null, listingId: null, identifiers: [], attributes: [{ technicalKey: "meesho_product_id", valueText: "PRODUCT-D1" }, { technicalKey: "meesho_catalog_id", valueText: "CATALOG-D1" }] });
assert.deepEqual(meesho.map((item) => item.value), ["MEE-SKU", "PRODUCT-D1", "CATALOG-D1"]);

const state = { q: "LONG SKU", status: "active", image: "missing", processing: "PICK_MARK_PACK" };
assert.equal(productInventoryHref(state, 2), "/owner/product-inventory?q=LONG+SKU&status=active&image=missing&processing=PICK_MARK_PACK&page=2");
assert.equal(filterSummary(state), "Active / Missing image / Marking");

for (const phrase of ["Seller Account + Marketplace + Seller SKU", "Quantity Sent", "FNSKU", "Supplier Manifest PDF", "Exports are not import inputs"]) assert.ok(importArchitecture.includes(phrase));
for (const phrase of ["canViewProductInventory", "canImportProductCatalog", "per seller account", "backend"]) assert.ok(permissionArchitecture.includes(phrase));

const { db, cleanup } = createTempWorkflowDb("phase-7-4d1-product-inventory");
try {
  await db.account.createMany({ data: [
    { id: "catalog-a", name: "Catalog A", code: "CAT-A", marketplace: "FLIPKART" },
    { id: "catalog-b", name: "Catalog B", code: "CAT-B", marketplace: "FLIPKART" }
  ] });
  await db.user.create({ data: { id: "owner", username: "d1-owner", passwordHash: "synthetic", name: "D1 Owner", role: "OWNER" } });
  await db.marketplaceListing.createMany({ data: Array.from({ length: 101 }, (_, index) => ({
    id: `listing-${String(index).padStart(3, "0")}`,
    accountId: "catalog-a",
    marketplace: "FLIPKART",
    sellerSkuId: `D1-SKU-${String(index).padStart(3, "0")}`,
    sku: `INTERNAL-${String(index).padStart(3, "0")}`,
    fsn: `D1-FSN-${String(index).padStart(3, "0")}`,
    listingId: `D1-LISTING-${String(index).padStart(3, "0")}`,
    productTitle: index === 50 ? "Distinctive Indigo Warehouse Product" : index < 26 ? `D1-PAGINATION-26 product ${index}` : `Synthetic catalog product ${index}`,
    liveCategory: index === 60 ? "Distinctive Category" : "Synthetic",
    listingStatus: index === 0 ? "INACTIVE" : "ACTIVE",
    mainImageUrl: index === 1 ? "/synthetic-image.png" : null
  })) });
  await db.marketplaceListing.createMany({ data: [
    { id: "wrong-account", accountId: "catalog-b", marketplace: "FLIPKART", sellerSkuId: "D1-SKU-050", sku: "OTHER", productTitle: "Wrong account" },
    { id: "wrong-marketplace", accountId: "catalog-a", marketplace: "AMAZON", sellerSkuId: "AMZ-D1", sku: "AMZ-D1", productTitle: "Wrong marketplace" }
  ] });
  const identifierTypes = Object.values(IdentifierType);
  await db.marketplaceListingIdentifier.createMany({ data: Array.from({ length: 20 }, (_, index) => ({
    id: `identifier-${index}`,
    accountId: "catalog-a",
    marketplaceListingId: "listing-050",
    marketplace: "FLIPKART",
    identifierType: identifierTypes[index % identifierTypes.length],
    rawValue: index === 0 ? "EXACT-BARCODE-D1" : `D1-ID-${index}`,
    normalizedValue: index === 0 ? "EXACT-BARCODE-D1" : `D1-ID-${index}`,
    source: "SYNTHETIC_D1"
  })) });
  await db.marketplaceListingAttribute.createMany({ data: [
    { id: "meesho-product-id", marketplaceListingId: "listing-050", accountId: "catalog-a", marketplace: "FLIPKART", technicalKey: "meesho_product_id", displayLabel: "Product ID", valueJson: '"MEE-PRODUCT-D1"', valueText: "MEE-PRODUCT-D1", sourceAuthority: "SYNTHETIC_D1", manualLocked: false },
    { id: "meesho-catalog-id", marketplaceListingId: "listing-050", accountId: "catalog-a", marketplace: "FLIPKART", technicalKey: "meesho_catalog_id", displayLabel: "Catalog ID", valueJson: '"MEE-CATALOG-D1"', valueText: "MEE-CATALOG-D1", sourceAuthority: "SYNTHETIC_D1", manualLocked: false },
    { id: "meesho-product-id-partial", marketplaceListingId: "listing-051", accountId: "catalog-a", marketplace: "FLIPKART", technicalKey: "meesho_product_id", displayLabel: "Product ID", valueJson: '"PREFIX-MEE-PRODUCT-D1-SUFFIX"', valueText: "PREFIX-MEE-PRODUCT-D1-SUFFIX", sourceAuthority: "SYNTHETIC_D1", manualLocked: false }
  ] });
  await db.productProcessRule.create({ data: { id: "rule", accountId: "catalog-a", marketplaceListingId: "listing-001", route: "PICK_MARK_PACK", active: true, createdByUserId: "owner", updatedByUserId: "owner" } });

  const scoped = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART" });
  assert.equal(scoped.total, 101, "Account and marketplace scope exclude both synthetic neighbours.");
  assert.equal(scoped.listings.length, 25, "Default server pagination remains 25 rows.");
  const twentySix = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "D1-PAGINATION-26" });
  assert.equal(twentySix.total, 26);
  assert.equal(twentySix.listings.length, 25);
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "D1-PAGINATION-26", page: 2 })).listings.length, 1);
  const pageFive = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", page: 5 });
  assert.equal(pageFive.listings.length, 1, "100+ products retain bounded final-page pagination.");
  const oversizedPage = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", page: 999 });
  assert.equal(oversizedPage.page, 5, "An oversized page is clamped before rows are queried.");
  assert.equal(oversizedPage.listings.length, 1, "The clamped page returns the real final-page row instead of a blank result.");
  const exact = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "D1-SKU-050" });
  assert.equal(exact.listings[0]?.id, "listing-050", "Exact Seller SKU wins within the selected scope.");
  const identifier = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "EXACT-BARCODE-D1" });
  assert.equal(identifier.listings[0]?.id, "listing-050");
  assert.ok(identifier.listings[0].identifiers.every((item) => ["SELLER_SKU", "FSN", "LISTING_ID", "ASIN", "FNSKU"].includes(item.identifierType)), "Only list-required identifier types are hydrated.");
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "Indigo Warehouse" })).total, 1);
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "Distinctive Category" })).total, 1);
  const meeshoProductId = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "MEE-PRODUCT-D1" });
  assert.equal(meeshoProductId.total, 2, "Supported Meesho technical IDs participate in exact and contains search.");
  assert.equal(meeshoProductId.exactCount, 1);
  assert.equal(meeshoProductId.listings[0]?.id, "listing-050", "Exact Meesho Product ID ranks ahead of a partial match.");
  const meeshoCatalogId = await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", query: "CATALOG-D1" });
  assert.equal(meeshoCatalogId.listings[0]?.id, "listing-050", "A supported Catalog ID is searchable.");
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", status: "inactive" })).total, 1);
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", image: "available" })).total, 1);
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", route: "PICK_MARK_PACK" })).total, 1);
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", route: "none" })).total, 100);
  assert.equal((await searchProductInventory(db, { accountId: "catalog-a", marketplace: "FLIPKART", route: "NOT_A_ROUTE" })).total, 101, "An invalid processing value cannot reach Prisma as an enum filter.");
} finally {
  await cleanup();
}

assert.match(read("tests/stage4-1-product-search-performance.test.ts"), /count=30_000[\s\S]*p95<=500/, "The mature 30,000-listing exact-search performance gate remains present.");
console.log("Phase 7.4D1 Product Inventory source, scoping, filtering, pagination, and presentation tests passed.");
