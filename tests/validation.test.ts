import assert from "node:assert/strict";
import { AwbBarcodeScanner } from "../components/AwbBarcodeScanner";
import { isValidAwb, normalizeAwb } from "../lib/awb";
import { canAccessAccount, canRoleAccessPath } from "../lib/authz";
import { formatCsvValue, rowsToCsv } from "../lib/csv";
import { planOrderImport } from "../lib/import/orders";
import { canImportPreviewIssues } from "../lib/import/preview";
import { planSkuMappingImport, type RawImportRow } from "../lib/import/sku-mappings";
import { isAllowedLocalNetworkIp, isIpInCidr, normalizeIp } from "../lib/network";
import { canConfirmPacked } from "../lib/operations/packing";
import { buildPickerSkuGroups } from "../lib/operations/picking";
import { runProductionChecks, summarizeProductionChecks } from "../lib/production-checks";
import { getInitialProductImageState } from "../lib/product-image";
import { cutoffDate, isCleanupConfirmationValid, RETENTION_DAYS } from "../lib/retention";
import { canDeactivateUser, shouldCloseSessionsAfterPasswordReset, validateWorkerPassword } from "../lib/user-management";
import {
  awbSearchSchema,
  loginSchema,
  parsedOrderSchema,
  skuImageMappingSchema,
  uploadBatchSchema
} from "../lib/validators";

const sampleOrder = {
  awb: "1490834915493571",
  courier: "Delhivery",
  sku: "1202919298_6",
  qty: 1,
  color: "Silver",
  orderNo: "290010756104090432_1",
  productDescription: "Sports Jersey Number Personalized Pendant",
  paymentType: "UNKNOWN" as const,
  city: undefined,
  state: undefined
};

assert.equal(parsedOrderSchema.safeParse(sampleOrder).success, true, "seed order should validate");
assert.equal(awbSearchSchema.safeParse({ awb: sampleOrder.awb }).success, true, "seed AWB should validate");
assert.equal(normalizeAwb(" 1490 8349 1549 3571 "), "1490834915493571", "numeric AWB normalizes");
assert.equal(normalizeAwb("sf3423949467fpl"), "SF3423949467FPL", "Shadowfax AWB normalizes");
assert.equal(isValidAwb("bad"), false, "bad AWB is rejected");
assert.equal(uploadBatchSchema.safeParse({ filename: "labels.pdf" }).success, true, "PDF upload should validate");
assert.equal(uploadBatchSchema.safeParse({ filename: "labels.xlsx" }).success, false, "non-PDF upload should fail");
assert.equal(
  skuImageMappingSchema.safeParse({
    sku: sampleOrder.sku,
    imageUrl: "https://images-r.meesho.com/images/products/576264463/z71on.avif",
    productName: sampleOrder.productDescription,
    color: sampleOrder.color,
    active: true
  }).success,
  true,
  "SKU image mapping should validate"
);
assert.equal(loginSchema.safeParse({ username: "owner", password: "demo1234" }).success, true, "seed login should validate");
assert.equal(loginSchema.safeParse({ username: "", password: "short" }).success, false, "bad login should fail");

const skuImportRows: RawImportRow[] = [
  {
    SKU: "NEW_SKU",
    image: "https://images-r.meesho.com/images/products/1/sample.avif",
    name: "New Product"
  },
  {
    supplier_sku: "EXISTING_CHANGED",
    product_image_url: "https://images-r.meesho.com/images/products/2/new.avif"
  },
  {
    sku_code: "EXISTING_SAME",
    imageUrl: "https://images-r.meesho.com/images/products/3/same.avif"
  },
  {
    sku: "BAD_URL",
    image_url: "ftp://example.com/image.jpg"
  }
];

const skuPlan = planSkuMappingImport(
  [
    {
      sku: "EXISTING_CHANGED",
      imageUrl: "https://images-r.meesho.com/images/products/2/old.avif",
      productName: null,
      notes: null,
      active: true
    },
    {
      sku: "EXISTING_SAME",
      imageUrl: "https://images-r.meesho.com/images/products/3/same.avif",
      productName: null,
      notes: null,
      active: true
    }
  ],
  skuImportRows
);

assert.equal(skuPlan.created.length, 1, "SKU import creates new mapping");
assert.equal(skuPlan.updated.length, 1, "SKU import updates changed mapping");
assert.equal(skuPlan.unchanged.length, 1, "SKU import skips unchanged mapping");
assert.equal(skuPlan.errors[0]?.issueType, "INVALID_IMAGE_URL", "SKU import rejects invalid URL");

const orderPlan = planOrderImport(
  [
    {
      awb: "DUP_SAME",
      courier: "Delhivery",
      sku: "SKU1",
      qty: 1,
      color: "Silver",
      size: null,
      orderNo: "ORDER1",
      productDescription: "Pendant",
      paymentType: "UNKNOWN"
    },
    {
      awb: "DUP_CHANGED",
      courier: "Delhivery",
      sku: "SKU2",
      qty: 1,
      color: "Gold",
      size: null,
      orderNo: "ORDER2",
      productDescription: "Pendant",
      paymentType: "UNKNOWN"
    }
  ],
  [
    { awb: "NEW_AWB", sku: "SKU1", qty: 1, orderNo: "ORDER3" },
    { awb: "DUP_SAME", courier: "Delhivery", sku: "SKU1", qty: 1, color: "Silver", orderNo: "ORDER1", productDescription: "Pendant" },
    { awb: "DUP_CHANGED", courier: "Delhivery", sku: "SKU2", qty: 2, color: "Gold", orderNo: "ORDER2", productDescription: "Pendant" },
    { awb: "", sku: "SKU1", qty: 1, orderNo: "ORDER4" }
  ],
  new Set(["SKU1", "SKU2"])
);

assert.equal(orderPlan.created.length, 1, "Order import creates new AWB");
assert.equal(orderPlan.duplicates.length, 1, "Order import skips unchanged duplicate AWB");
assert.equal(orderPlan.updated.length, 1, "Order import updates changed duplicate safely");
assert.equal(orderPlan.errors[0]?.issueType, "MISSING_AWB", "Order import rejects missing AWB");
assert.equal(orderPlan.missingImageRows.length, 0, "Mapped SKUs are not marked as missing image");

const missingImagePlan = planOrderImport([], [{ awb: "NO_IMAGE", sku: "UNMAPPED", qty: 1, orderNo: "ORDER5" }], new Set());
assert.equal(missingImagePlan.created.length, 1, "Missing image rows still import as orders");
assert.equal(missingImagePlan.missingImageRows.length, 1, "Missing image rows are counted for review");
assert.equal(canImportPreviewIssues([{ issueType: "LOW_CONFIDENCE" }]), false, "Low confidence preview rows do not import by default");
assert.equal(canImportPreviewIssues([{ issueType: "MISSING_IMAGE_MAPPING" }]), true, "Missing image mapping does not block preview import");

assert.equal(canRoleAccessPath("OWNER", "/reports"), true, "Owner can access reports");
assert.equal(canRoleAccessPath("OWNER", "/owner/system"), true, "Owner can access system health");
assert.equal(canRoleAccessPath("OWNER", "/owner/cleanup"), true, "Owner can access cleanup");
assert.equal(canRoleAccessPath("PICKER", "/packing"), false, "Picker cannot access packing");
assert.equal(canRoleAccessPath("PACKER", "/owner/users"), false, "Packer cannot access owner pages");
assert.equal(canRoleAccessPath("PACKER", "/problems"), true, "Packer can access problems");
assert.equal(canAccessAccount({ role: "PICKER", accountId: "a1" }, "a1"), true, "Assigned user can access account");
assert.equal(canAccessAccount({ role: "PICKER", accountId: "a1" }, "a2"), false, "Assigned user cannot access other account");
assert.equal(canRoleAccessPath("PICKER", "/change-password"), true, "Workers can change password");

assert.equal(canConfirmPacked({ packStatus: "READY" }), true, "Ready order can be packed");
assert.equal(canConfirmPacked({ packStatus: "PACKED" }), false, "Packed order is idempotently skipped");

const pickerGroups = buildPickerSkuGroups(
  [
    {
      id: "o1",
      awb: "A12345678",
      sku: "SKU1",
      qty: 1,
      color: "Silver",
      size: "Free Size",
      courier: "Delhivery",
      orderNo: "ORDER1",
      pickStatus: "READY",
      packStatus: "READY"
    },
    {
      id: "o2",
      awb: "A12345679",
      sku: "SKU1",
      qty: 2,
      color: "Gold",
      size: "Free Size",
      courier: "Delhivery",
      orderNo: "ORDER2",
      pickStatus: "PICKED",
      packStatus: "READY"
    }
  ],
  [{ id: "m1", sku: "SKU1", imageUrl: "https://example.com/image.jpg", productName: "Pendant" }]
);

assert.equal(pickerGroups.length, 2, "Picker grouping separates SKU by color and size");
assert.equal(pickerGroups.find((group) => group.color === "Silver")?.totalQuantity, 1, "Picker group sums quantity");
assert.equal(pickerGroups.find((group) => group.color === "Gold")?.status, "PICKED", "Picked group status is derived");

assert.equal(validateWorkerPassword("demo1234").valid, false, "Demo password is rejected");
assert.equal(validateWorkerPassword("better123").valid, true, "Usable worker password passes");
assert.equal(canDeactivateUser("u1", "u1"), false, "Owner cannot deactivate self");
assert.equal(canDeactivateUser("u1", "u2"), true, "Owner can deactivate another user");
assert.equal(shouldCloseSessionsAfterPasswordReset("owner", "worker"), true, "Owner reset closes worker sessions");
assert.equal(shouldCloseSessionsAfterPasswordReset("owner", "owner"), false, "Owner self password change keeps current sessions");

assert.equal(normalizeIp("::ffff:192.168.1.10"), "192.168.1.10", "IPv4-mapped IPs normalize");
assert.equal(isIpInCidr("192.168.1.10", "192.168.0.0/16"), true, "Local CIDR allows Wi-Fi IP");
assert.equal(isAllowedLocalNetworkIp("8.8.8.8", "192.168.0.0/16"), false, "External IP is blocked by local-only ranges");
assert.equal(isAllowedLocalNetworkIp("127.0.0.1", "192.168.0.0/16"), true, "Localhost is always allowed");

assert.equal(getInitialProductImageState(null), "missing", "Product image fallback handles missing URL");
assert.equal(typeof AwbBarcodeScanner, "function", "Scanner component compiles");

assert.equal(formatCsvValue('A "quoted", value'), '"A ""quoted"", value"', "CSV values are safely escaped");
assert.equal(rowsToCsv(["sku", "qty"], [["SKU1", 2]]), "sku,qty\nSKU1,2", "CSV rows format");

assert.equal(RETENTION_DAYS.previewRows, 30, "Preview row retention is 30 days");
assert.equal(RETENTION_DAYS.importIssues, 60, "Import issue retention is 60 days");
assert.equal(RETENTION_DAYS.scanLogs, 90, "Scan log retention is 90 days");
assert.equal(RETENTION_DAYS.auditLogs, 180, "Audit log retention is 180 days");
assert.equal(cutoffDate(30, new Date("2026-05-25T00:00:00.000Z")).toISOString(), "2026-04-25T00:00:00.000Z", "Cleanup cutoff subtracts days");
assert.equal(isCleanupConfirmationValid("CLEANUP"), true, "Cleanup confirmation accepts exact token");
assert.equal(isCleanupConfirmationValid("delete"), false, "Cleanup confirmation rejects wrong token");

const productionChecks = runProductionChecks({
  nodeEnv: "production",
  sessionSecret: "dev-only-change-me",
  nextPublicAppUrl: "",
  databaseUrl: "file:./dev.db",
  localNetworkOnly: "true",
  demoUsers: [{ username: "owner", active: true, passwordHash: "not-demo" }],
  skuMappingCount: 0,
  oldPreviewRowCount: 6000,
  oldImportIssueCount: 0,
  oldScanLogCount: 0
});
assert.equal(summarizeProductionChecks(productionChecks), "NEEDS_ACTION", "Production checks detect unsafe settings");
assert.equal(
  productionChecks.some((check) => check.key === "database-url" && check.status === "NEEDS_ACTION"),
  true,
  "Production checks require PostgreSQL in production"
);

console.log("Validation tests passed.");
