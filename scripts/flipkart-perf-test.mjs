import { performance } from "node:perf_hooks";
import {
  parseFlipkartListingRows,
  parseFlipkartOrderRows
} from "../src/lib/marketplaces/flipkart/parser.ts";
import {
  chunkFlipkartListingRows,
  dedupeFlipkartListingRows,
  flipkartListingMasterData
} from "../src/lib/marketplaces/flipkart/listing-master.ts";
import { dedupeFlipkartOrderRows, flipkartOrderMappingIssue } from "../src/lib/marketplaces/flipkart/review.ts";

const LISTING_ROWS = 30000;
const ORDER_ROWS = 1000;
const UNIQUE_SKUS = 300;
const BATCH_SIZE = 500;

function skuAt(index) {
  return `FK-SKU-${String(index % UNIQUE_SKUS).padStart(5, "0")}`;
}

function listingSkuAt(index) {
  return `FK-SKU-${String(index).padStart(5, "0")}`;
}

function listingRawRows() {
  return Array.from({ length: LISTING_ROWS }, (_, index) => {
    const missingImage = index % 211 === 0;
    const sku = index > 0 && index % 997 === 0 ? listingSkuAt(index - 1) : listingSkuAt(index);

    return {
      "Product Title": `Fake Product ${index}`,
      "Seller SKU Id": sku,
      "Sub-category": "Fake Category",
      "Flipkart Serial Number": `FSN${String(index).padStart(8, "0")}`,
      "Listing ID": `LISTING-${String(index).padStart(8, "0")}`,
      "Listing Status": index % 23 === 0 ? "Inactive" : "Active",
      MRP: "999",
      "Your Selling Price": "499",
      "Live Title": `Fake Product ${index}`,
      "Live Brand": "Fake Brand",
      "Live Category": "Fake Category",
      "Image 1 1366 URL": missingImage ? "" : `https://example.test/images/${index}-1366.jpg`,
      "Image URL 1": missingImage ? "" : `https://example.test/images/${index}.jpg`
    };
  });
}

function orderRawRows() {
  return Array.from({ length: ORDER_ROWS }, (_, index) => ({
    "Ordered On": "07/06/26",
    "Shipment ID": index % 251 === 0 ? "" : `SHIP-${String(index).padStart(8, "0")}`,
    "ORDER ITEM ID": index % 137 === 0 ? `ITEM-${String(index - 1).padStart(8, "0")}` : `ITEM-${String(index).padStart(8, "0")}`,
    "Order Id": `ORDER-${String(index).padStart(8, "0")}`,
    FSN: `FSN${String(index).padStart(8, "0")}`,
    SKU: index % 89 === 0 ? `MISSING-SKU-${index}` : skuAt(index),
    Product: `Fake Product ${index}`,
    Quantity: String((index % 3) + 1),
    "Buyer name": "Test Buyer",
    "Ship to name": "Test Receiver",
    "Address Line 1": "MASKED ADDRESS",
    City: "Test City",
    State: "Test State",
    "PIN Code": "000000",
    "Tracking ID": `FMPC${String(Math.floor(index / 2)).padStart(10, "0")}`
  }));
}

function timed(label, fn) {
  const started = performance.now();
  const result = fn();
  const elapsedMs = Math.round(performance.now() - started);
  return { label, result, elapsedMs };
}

const listingRows = listingRawRows();
const orderRows = orderRawRows();

const listingParse = timed("listing parse", () => parseFlipkartListingRows(listingRows, "performance-listings.fake.xlsx"));
const listingPlan = timed("listing planning", () => {
  const deduped = dedupeFlipkartListingRows(listingParse.result.listings);
  const drafts = deduped.importableListings.map((listing) => ({
    listing,
    data: flipkartListingMasterData(listing)
  }));

  return {
    duplicateRows: deduped.duplicateIssues.length,
    importableRows: drafts.length,
    chunks: chunkFlipkartListingRows(drafts, BATCH_SIZE).length,
    missingImageRows: drafts.filter((draft) => !draft.data.mainImageUrl).length
  };
});

const orderParse = timed("order parse", () => parseFlipkartOrderRows(orderRows, "performance-orders.fake.xlsx"));
const orderPlan = timed("order planning", () => {
  const deduped = dedupeFlipkartOrderRows(orderParse.result.orders);
  const listingSkus = new Set(listingParse.result.listings.map((listing) => listing.sku));
  const listingImageBySku = new Map(listingParse.result.listings.map((listing) => [listing.sku, listing.mainImageUrl]));
  const mappingWarnings = deduped.importableOrders.filter((order) =>
    flipkartOrderMappingIssue(order, {
      listingFound: listingSkus.has(order.sku),
      hasMainImage: Boolean(listingImageBySku.get(order.sku))
    })
  );

  return {
    duplicateRows: deduped.duplicateIssues.length,
    importableRows: deduped.importableOrders.length,
    chunks: chunkFlipkartListingRows(deduped.importableOrders, BATCH_SIZE).length,
    mappingWarnings: mappingWarnings.length
  };
});

const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

console.log("Flipkart performance test");
console.log(`listingRows=${LISTING_ROWS}`);
console.log(`orderRows=${ORDER_ROWS}`);
console.log(`uniqueSkus=${UNIQUE_SKUS}`);
console.log(`batchSize=${BATCH_SIZE}`);
console.log(`${listingParse.label}Ms=${listingParse.elapsedMs}`);
console.log(`${listingPlan.label.replace(" ", "")}Ms=${listingPlan.elapsedMs}`);
console.log(`listingImportableRows=${listingPlan.result.importableRows}`);
console.log(`listingDuplicateRows=${listingPlan.result.duplicateRows}`);
console.log(`listingMissingImageRows=${listingPlan.result.missingImageRows}`);
console.log(`listingChunks=${listingPlan.result.chunks}`);
console.log(`${orderParse.label}Ms=${orderParse.elapsedMs}`);
console.log(`${orderPlan.label.replace(" ", "")}Ms=${orderPlan.elapsedMs}`);
console.log(`orderImportableRows=${orderPlan.result.importableRows}`);
console.log(`orderDuplicateRows=${orderPlan.result.duplicateRows}`);
console.log(`orderMappingWarnings=${orderPlan.result.mappingWarnings}`);
console.log(`orderChunks=${orderPlan.result.chunks}`);
console.log(`rssMemoryMb=${memoryMb}`);
