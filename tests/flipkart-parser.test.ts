import assert from "node:assert/strict";
import {
  chooseFlipkartListingImageUrl,
  flipkartInternalOrderKey,
  flipkartOrderDuplicateKey,
  parseFlipkartListingRows,
  parseFlipkartOrderRows,
  type FlipkartRawRow
} from "../src/lib/marketplaces/flipkart";

const fakeOrderRow: FlipkartRawRow = {
  "Ordered On": "2026-07-01",
  "Shipment ID": "SHIP-FAKE-1",
  "ORDER ITEM ID": "OI-FAKE-1",
  "Order Id": "OD-FAKE-1",
  "HSN CODE": "711719",
  "Order State": "APPROVED",
  "Order Type": "Prepaid",
  FSN: "FSNFAKE123",
  SKU: "FK-SKU-1",
  Product: "Fake Silver Pendant",
  "Invoice No.": "INV-FAKE-1",
  CGST: "1.25",
  IGST: "0",
  SGST: "1.25",
  "Invoice Date (mm/dd/yy)": "07/01/26",
  "Invoice Amount": "499",
  "Selling Price Per Item": "449",
  "Shipping and Handling Charges": "50",
  Quantity: "2",
  "Buyer name": "Masked Buyer",
  "Ship to name": "Masked Receiver",
  City: "Sample City",
  State: "Sample State",
  "PIN Code": "000000",
  "Dispatch After date": "2026-07-02",
  "Dispatch by date": "2026-07-03",
  "Tracking ID": "FMPC0000000000",
  "Package Length (cm)": "12",
  "Package Breadth (cm)": "8",
  "Package Height (cm)": "4",
  "Package Weight (kg)": "0.25"
};

const orderResult = parseFlipkartOrderRows([fakeOrderRow]);
const order = orderResult.orders[0];

assert.equal(orderResult.issues.length, 0, "valid fake Flipkart order row has no issues");
assert.equal(order?.marketplace, "FLIPKART", "Flipkart order marketplace is set");
assert.equal(order?.orderedOn, "2026-07-01", "Ordered On is parsed");
assert.equal(order?.quantity, 2, "Quantity becomes a number");
assert.equal(order?.trackingId, "FMPC0000000000", "Tracking ID is extracted");
assert.equal(order?.orderItemId, "OI-FAKE-1", "ORDER ITEM ID is extracted");
assert.equal(order?.sku, "FK-SKU-1", "SKU is extracted");
assert.equal(order?.fsn, "FSNFAKE123", "FSN is extracted");
assert.equal(order?.packageWeightKg, 0.25, "Package weight is parsed as a number");

const fakeListingRow: FlipkartRawRow = {
  "Product Title": "Fake Silver Pendant Listing",
  "Seller SKU Id": "FK-SKU-1",
  "Sub-category": "Jewellery",
  "Flipkart Serial Number": "FSNFAKE123",
  "Listing ID": "LST-FAKE-1",
  "Listing Status": "Active",
  MRP: "999",
  "Your Selling Price": "499",
  "Live Title": "Live Fake Silver Pendant",
  "Live Brand": "Fake Brand",
  "Live Category": "Jewellery",
  "Live Price": "499",
  Rating: "4.2",
  "Review Count": "12",
  "Generated Direct Product URL": "https://example.invalid/product-page",
  "Canonical Product URL": "https://example.invalid/canonical-product-page",
  "Scrape Status": "OK",
  "Image URL 1": "https://example.invalid/small-1.jpg",
  "Image 1 1366 URL": "https://example.invalid/large-1.jpg",
  "Image URL 2": "https://example.invalid/small-2.jpg",
  "Image 2 1366 URL": "https://example.invalid/large-2.jpg"
};

const listingResult = parseFlipkartListingRows([fakeListingRow]);
const listing = listingResult.listings[0];

assert.equal(listingResult.issues.length, 0, "valid fake Flipkart listing row has no issues");
assert.equal(listing?.sellerSkuId, "FK-SKU-1", "Listing Seller SKU Id is parsed");
assert.equal(listing?.sku, "FK-SKU-1", "Listing Seller SKU Id maps to SKU");
assert.equal(listing?.imageUrl, "https://example.invalid/large-1.jpg", "Image priority prefers Image 1 1366 URL over Image URL 1");
assert.equal(chooseFlipkartListingImageUrl(fakeListingRow), "https://example.invalid/large-1.jpg", "Image priority helper returns the preferred URL");
assert.equal(listing?.productUrl, "https://example.invalid/product-page", "Generated Direct Product URL is kept as product page URL");

const orderItemKey = flipkartOrderDuplicateKey({
  orderItemId: "OI-FAKE-1",
  shipmentId: "SHIP-FAKE-1",
  sku: "FK-SKU-1"
});
assert.deepEqual(orderItemKey, { strategy: "ORDER_ITEM_ID", value: "OI-FAKE-1" }, "Duplicate key chooses ORDER ITEM ID first");
assert.equal(
  flipkartInternalOrderKey({ orderItemId: "OI-FAKE-1", shipmentId: "SHIP-FAKE-1", sku: "FK-SKU-1" }),
  "FLIPKART:ORDER_ITEM:OI-FAKE-1",
  "Internal key uses ORDER ITEM ID first"
);

const shipmentSkuKey = flipkartOrderDuplicateKey({
  shipmentId: "SHIP-FAKE-1",
  sku: "FK-SKU-1"
});
assert.deepEqual(shipmentSkuKey, { strategy: "SHIPMENT_ID_SKU", value: "SHIP-FAKE-1::FK-SKU-1" }, "Duplicate fallback uses Shipment ID + SKU");
assert.equal(
  flipkartInternalOrderKey({ shipmentId: "SHIP-FAKE-1", sku: "FK-SKU-1" }),
  "FLIPKART:SHIPMENT_SKU:SHIP-FAKE-1::FK-SKU-1",
  "Internal fallback key uses Shipment ID + SKU"
);

const missingKeyResult = parseFlipkartOrderRows([
  {
    SKU: "FK-SKU-2",
    Product: "Fake Missing Key Product",
    Quantity: "1",
    "Tracking ID": "FMPC0000000001"
  }
]);
assert.equal(missingKeyResult.orders.length, 0, "Missing duplicate key row is held from import");
assert.equal(
  missingKeyResult.issues[0]?.issueType,
  "MISSING_FLIPKART_DUPLICATE_KEY",
  "Missing required duplicate fields creates a row issue"
);

for (const [label, quantity] of [
  ["blank", ""],
  ["text", "not-a-number"],
  ["zero", "0"],
  ["negative", "-2"],
  ["decimal", "1.9"],
  ["decimal notation", "1.0"],
  ["exponent notation", "1e3"],
  ["malformed grouping", "1,00"]
] as const) {
  const invalidQuantity = parseFlipkartOrderRows([{ ...fakeOrderRow, "ORDER ITEM ID": `OI-QTY-${label}`, Quantity: quantity }]);
  assert.equal(invalidQuantity.orders.length, 0, `${label} Quantity creates no importable Order.`);
  assert.equal(invalidQuantity.issues[0]?.issueType, "INVALID_QUANTITY", `${label} Quantity is a blocking row issue.`);
}

const largeWholeQuantity = parseFlipkartOrderRows([{ ...fakeOrderRow, "ORDER ITEM ID": "OI-QTY-COMMA", Quantity: "1,000" }]);
assert.equal(largeWholeQuantity.orders[0]?.quantity, 1000, "A positive comma-formatted whole Quantity remains valid.");

const missingSkuResult = parseFlipkartListingRows([{ "Product Title": "No SKU", "Image URL 1": "https://example.invalid/image.jpg" }]);
assert.equal(missingSkuResult.listings.length, 0, "Missing Seller SKU listing row is held from mapping import");
assert.equal(missingSkuResult.issues[0]?.issueType, "MISSING_SELLER_SKU_ID", "Missing Seller SKU Id creates a listing row issue");

console.log("Flipkart parser tests passed.");
