import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outputDir = path.join(process.cwd(), "local-test-data", "performance");
const listingPath = path.join(outputDir, "flipkart-listing-30000.fake.xlsx");
const orderPath = path.join(outputDir, "flipkart-order-1000.fake.xlsx");

const listingHeaders = [
  "Product Title",
  "Seller SKU Id",
  "Sub-category",
  "Flipkart Serial Number",
  "Listing ID",
  "Listing Status",
  "MRP",
  "Your Selling Price",
  "Live Title",
  "Live Brand",
  "Live Category",
  "Image 1 1366 URL",
  "Image URL 1"
];

const orderHeaders = [
  "Ordered On",
  "Shipment ID",
  "ORDER ITEM ID",
  "Order Id",
  "FSN",
  "SKU",
  "Product",
  "Quantity",
  "Buyer name",
  "Ship to name",
  "Address Line 1",
  "City",
  "State",
  "PIN Code",
  "Tracking ID"
];

async function writeWorkbook(filePath, headers, rowCount, rowFactory) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useSharedStrings: false,
    useStyles: false
  });
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers).commit();

  for (let index = 0; index < rowCount; index += 1) {
    const row = rowFactory(index);
    sheet.addRow(headers.map((header) => row[header] ?? "")).commit();
  }

  await workbook.commit();
}

function skuAt(index) {
  return `FK-SKU-${String(index % 300).padStart(5, "0")}`;
}

function listingSkuAt(index) {
  return `FK-SKU-${String(index).padStart(5, "0")}`;
}

await mkdir(outputDir, { recursive: true });

await writeWorkbook(listingPath, listingHeaders, 30000, (index) => {
  const duplicateSku = index > 0 && index % 997 === 0 ? listingSkuAt(index - 1) : listingSkuAt(index);
  const missingImage = index % 211 === 0;

  return {
    "Product Title": `Fake Product ${index}`,
    "Seller SKU Id": duplicateSku,
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

await writeWorkbook(orderPath, orderHeaders, 1000, (index) => {
  const trackingGroup = Math.floor(index / 2);

  return {
    "Ordered On": "07/06/26",
    "Shipment ID": `SHIP-${String(index).padStart(8, "0")}`,
    "ORDER ITEM ID": index % 137 === 0 ? `ITEM-${String(index - 1).padStart(8, "0")}` : `ITEM-${String(index).padStart(8, "0")}`,
    "Order Id": `ORDER-${String(index).padStart(8, "0")}`,
    FSN: `FSN${String(index).padStart(8, "0")}`,
    SKU: skuAt(index),
    Product: `Fake Product ${index}`,
    Quantity: String((index % 3) + 1),
    "Buyer name": "Test Buyer",
    "Ship to name": "Test Receiver",
    "Address Line 1": "MASKED ADDRESS",
    City: "Test City",
    State: "Test State",
    "PIN Code": "000000",
    "Tracking ID": `FMPC${String(trackingGroup).padStart(10, "0")}`
  };
});

console.log(`Wrote ${listingPath}`);
console.log(`Wrote ${orderPath}`);
