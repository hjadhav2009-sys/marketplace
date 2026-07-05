import ExcelJS from "exceljs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

const orderHeaders = [
  "Ordered On",
  "Shipment ID",
  "ORDER ITEM ID",
  "Order Id",
  "HSN CODE",
  "Order State",
  "Order Type",
  "FSN",
  "SKU",
  "Product",
  "Invoice No.",
  "CGST",
  "IGST",
  "SGST",
  "Invoice Date (mm/dd/yy)",
  "Invoice Amount",
  "Selling Price Per Item",
  "Shipping and Handling Charges",
  "Quantity",
  "Price inc. FKMP Contribution & Subsidy",
  "Buyer name",
  "Ship to name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "PIN Code",
  "Dispatch After date",
  "Dispatch by date",
  "Form requirement",
  "Tracking ID",
  "Package Length (cm)",
  "Package Breadth (cm)",
  "Package Height (cm)",
  "Package Weight (kg)",
  "Ready to Make",
  "With Attachment"
];

const listingHeaders = [
  "Product Title",
  "Seller SKU Id",
  "Processing errors (if any)",
  "Sub-category",
  "Flipkart Serial Number",
  "Listing ID",
  "Listing Status",
  "Inactive Reason",
  "MRP",
  "Bank Settlement",
  "Your Selling Price",
  "Minimum Order Quantity",
  "Benchmark Price",
  "Fulfillment By",
  "System Stock count",
  "Your Stock Count",
  "Recommended Stock",
  "Procurement SLA",
  "Procurement Type",
  "Package Length - Length of the package in cms",
  "Package Breadth - Breadth of the package in cms",
  "Package Height - Height of the package in cms",
  "Package Weight - Weight of the package in Kgs",
  "Local Delivery Charge to Customer (per qty)",
  "Zonal Delivery Charge to Customer (per qty)",
  "National Delivery Charge to Customer (per qty)",
  "Harmonized System Nomenclature - HSN",
  "Tax Code",
  "Luxury Cess Tax Rate",
  "Country of Origin ISO code",
  "Manufacturer Details",
  "Importer Details",
  "Packer Details",
  "Date of Manufacture in dd/MM/yyyy",
  "Shelf Life in Months",
  "Ignore warnings",
  "Listing Archival",
  "SEO Slug",
  "Generated Direct Product URL",
  "Generated SEO Approx URL",
  "Source Link Method",
  "Live Title",
  "Live Brand",
  "Live Category",
  "Live Price",
  "Live MRP",
  "Live Seller",
  "Rating",
  "Review Count",
  "Product Highlights",
  "Description",
  "All Specifications",
  "Image URL 1",
  "Image URL 2",
  "Image URL 3",
  "Image URL 4",
  "Image URL 5",
  "Image URL 6",
  "Image URL 7",
  "Image URL 8",
  "Image URL 9",
  "Image URL 10",
  "Canonical Product URL",
  "Scrape Status",
  "Image 1 1366 URL",
  "Image 2 1366 URL",
  "Image 3 1366 URL",
  "Image 4 1366 URL",
  "Image 5 1366 URL",
  "Image 6 1366 URL",
  "Image 7 1366 URL",
  "Image 8 1366 URL",
  "Image 9 1366 URL",
  "Image 10 1366 URL",
  "Scrape Error"
];

function row(headers, data) {
  return headers.map((header) => data[header] ?? "");
}

function baseOrder(overrides) {
  return {
    "Ordered On": "2026-07-01",
    "Shipment ID": "SHIP-FAKE-0001",
    "ORDER ITEM ID": "OI-FAKE-0001",
    "Order Id": "OD-FAKE-0001",
    "HSN CODE": "711719",
    "Order State": "APPROVED",
    "Order Type": "Prepaid",
    "FSN": "FSNFAKE0001",
    "SKU": "FK-SKU-1",
    "Product": "Fake Flipkart Product 1",
    "Invoice No.": "INV-FAKE-0001",
    "CGST": "1.25",
    "IGST": "0",
    "SGST": "1.25",
    "Invoice Date (mm/dd/yy)": "07/01/26",
    "Invoice Amount": "499",
    "Selling Price Per Item": "449",
    "Shipping and Handling Charges": "50",
    "Quantity": "1",
    "Price inc. FKMP Contribution & Subsidy": "499",
    "Buyer name": "Test Buyer",
    "Ship to name": "Test Receiver",
    "Address Line 1": "MASKED ADDRESS",
    "Address Line 2": "MASKED ADDRESS",
    "City": "Test City",
    "State": "Test State",
    "PIN Code": "000000",
    "Dispatch After date": "2026-07-02",
    "Dispatch by date": "2026-07-03",
    "Form requirement": "No",
    "Tracking ID": "FMPC0000000001",
    "Package Length (cm)": "12",
    "Package Breadth (cm)": "8",
    "Package Height (cm)": "4",
    "Package Weight (kg)": "0.25",
    "Ready to Make": "Yes",
    "With Attachment": "No",
    ...overrides
  };
}

function baseListing(overrides) {
  return {
    "Product Title": "Fake Flipkart Product 1",
    "Seller SKU Id": "FK-SKU-1",
    "Processing errors (if any)": "",
    "Sub-category": "Fake Category",
    "Flipkart Serial Number": "FSNFAKE0001",
    "Listing ID": "LST-FAKE-0001",
    "Listing Status": "Active",
    "Inactive Reason": "",
    "MRP": "999",
    "Bank Settlement": "450",
    "Your Selling Price": "499",
    "Minimum Order Quantity": "1",
    "Benchmark Price": "499",
    "Fulfillment By": "Seller",
    "System Stock count": "10",
    "Your Stock Count": "10",
    "Recommended Stock": "5",
    "Procurement SLA": "1",
    "Procurement Type": "Regular",
    "Package Length - Length of the package in cms": "12",
    "Package Breadth - Breadth of the package in cms": "8",
    "Package Height - Height of the package in cms": "4",
    "Package Weight - Weight of the package in Kgs": "0.25",
    "Local Delivery Charge to Customer (per qty)": "0",
    "Zonal Delivery Charge to Customer (per qty)": "0",
    "National Delivery Charge to Customer (per qty)": "0",
    "Harmonized System Nomenclature - HSN": "711719",
    "Tax Code": "GST_3",
    "Luxury Cess Tax Rate": "0",
    "Country of Origin ISO code": "IN",
    "Manufacturer Details": "Fake Manufacturer",
    "Importer Details": "Fake Importer",
    "Packer Details": "Fake Packer",
    "Date of Manufacture in dd/MM/yyyy": "01/07/2026",
    "Shelf Life in Months": "24",
    "Ignore warnings": "No",
    "Listing Archival": "No",
    "SEO Slug": "fake-flipkart-product",
    "Generated Direct Product URL": "https://example.invalid/products/fk-sku-1",
    "Generated SEO Approx URL": "https://example.invalid/seo/fk-sku-1",
    "Source Link Method": "Fixture",
    "Live Title": "Live Fake Flipkart Product 1",
    "Live Brand": "Fake Brand",
    "Live Category": "Fake Category",
    "Live Price": "499",
    "Live MRP": "999",
    "Live Seller": "Fake Seller",
    "Rating": "4.5",
    "Review Count": "10",
    "Product Highlights": "Fake highlights",
    "Description": "Fake description",
    "All Specifications": "Fake specs",
    "Image URL 1": "https://example.invalid/images/fk-sku-1-small.jpg",
    "Canonical Product URL": "https://example.invalid/canonical/fk-sku-1",
    "Scrape Status": "OK",
    "Image 1 1366 URL": "https://example.invalid/images/fk-sku-1-large.jpg",
    "Scrape Error": "",
    ...overrides
  };
}

async function writeWorkbook(fileName, headers, records) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");
  worksheet.addRow(headers);
  records.forEach((record) => worksheet.addRow(row(headers, record)));
  worksheet.columns.forEach((column) => {
    column.width = 24;
  });
  await workbook.xlsx.writeFile(join(fixtureDir, fileName));
}

await writeWorkbook("flipkart-order-export.fake.xlsx", orderHeaders, [
  baseOrder({ "ORDER ITEM ID": "OI-FAKE-0001", "SKU": "FK-SKU-1", "Product": "Fake Flipkart Product 1", "Tracking ID": "FMPC0000000001" }),
  baseOrder({
    "ORDER ITEM ID": "OI-FAKE-0002",
    "SKU": "FK-SKU-2",
    "Product": "Fake Flipkart Product 2",
    "FSN": "FSNFAKE0002",
    "Tracking ID": "FMPC0000000001"
  }),
  baseOrder({
    "Shipment ID": "SHIP-FAKE-0002",
    "ORDER ITEM ID": "OI-FAKE-0003",
    "Order Id": "OD-FAKE-0003",
    "SKU": "FK-SKU-3",
    "Product": "Fake Flipkart Product 3",
    "FSN": "FSNFAKE0003",
    "Tracking ID": "FMPC0000000002"
  }),
  baseOrder({
    "ORDER ITEM ID": "OI-FAKE-0002",
    "Order Id": "OD-FAKE-DUP",
    "SKU": "FK-SKU-2",
    "Product": "Fake Duplicate Product 2",
    "Tracking ID": "FMPC0000000001"
  }),
  baseOrder({
    "Shipment ID": "SHIP-FAKE-0004",
    "ORDER ITEM ID": "",
    "Order Id": "OD-FAKE-0004",
    "SKU": "FK-SKU-4",
    "Product": "Fake Fallback Product 4",
    "FSN": "FSNFAKE0004",
    "Tracking ID": "FMPC0000000004"
  }),
  baseOrder({
    "Shipment ID": "",
    "ORDER ITEM ID": "",
    "Order Id": "OD-FAKE-HELD",
    "SKU": "FK-SKU-5",
    "Product": "Fake Held Product 5",
    "FSN": "FSNFAKE0005",
    "Tracking ID": "FMPC0000000005"
  })
]);

await writeWorkbook("flipkart-listing-export.fake.xlsx", listingHeaders, [
  baseListing({ "Seller SKU Id": "FK-SKU-1", "Product Title": "Fake Flipkart Product 1" }),
  baseListing({
    "Seller SKU Id": "FK-SKU-2",
    "Product Title": "Fake Flipkart Product 2",
    "Flipkart Serial Number": "FSNFAKE0002",
    "Image URL 1": "https://example.invalid/images/fk-sku-2-small.jpg",
    "Image 1 1366 URL": ""
  }),
  baseListing({
    "Seller SKU Id": "FK-SKU-4",
    "Product Title": "Fake Fallback Product 4",
    "Flipkart Serial Number": "FSNFAKE0004",
    "Image URL 1": "",
    "Image 1 1366 URL": "",
    "Scrape Status": "IMAGE_MISSING"
  }),
  baseListing({
    "Seller SKU Id": "FK-SKU-999",
    "Product Title": "Fake Listing Not In Orders",
    "Flipkart Serial Number": "FSNFAKE0999",
    "Generated Direct Product URL": "https://example.invalid/products/fk-sku-999",
    "Image URL 1": "https://example.invalid/images/fk-sku-999-small.jpg",
    "Image 1 1366 URL": "https://example.invalid/images/fk-sku-999-large.jpg"
  })
]);
