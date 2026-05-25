import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AwbBarcodeScanner } from "../components/AwbBarcodeScanner";
import { isValidAwb, normalizeAwb } from "../lib/awb";
import { canAccessAccount, canRoleAccessPath } from "../lib/authz";
import { formatCsvValue, rowsToCsv } from "../lib/csv";
import { planOrderImport } from "../lib/import/orders";
import { canImportPreviewIssues, isOrderPreviewSourceType, reviewProblemIssues } from "../lib/import/preview";
import { planAccountSkuMappingImport, planSkuMappingImport, type RawImportRow } from "../lib/import/sku-mappings";
import { isAllowedLocalNetworkIp, isIpInCidr, normalizeIp } from "../lib/network";
import { findAwbSearchMatches } from "../lib/operations/awb-search";
import { canConfirmPacked } from "../lib/operations/packing";
import { buildPickerSkuGroups } from "../lib/operations/picking";
import { hashPassword } from "../lib/password";
import { runProductionChecks, summarizeProductionChecks } from "../lib/production-checks";
import {
  getInitialProductImageState,
  imageHealthLabel,
  normalizeSkuMappingImageFilter,
  picklistSummaryProductNameLabel,
  productImageStateText,
  skuMappingMatchesImageFilter
} from "../lib/product-image";
import { cutoffDate, isCleanupConfirmationValid, RETENTION_DAYS } from "../lib/retention";
import { canUseFirstRunSetup, validateFirstRunSetupPassword } from "../lib/setup";
import { normalizeSkuForMatching } from "../lib/sku";
import { canDeactivateUser, shouldCloseSessionsAfterPasswordReset, validateWorkerPassword } from "../lib/user-management";
import {
  awbSearchSchema,
  loginSchema,
  parsedOrderSchema,
  skuImageMappingSchema,
  uploadBatchSchema
} from "../lib/validators";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
const awbCandidates = [
  {
    id: "o1",
    accountId: "a1",
    awb: "1490834915493571",
    sku: "SKU1",
    qty: 1,
    color: "Silver",
    courier: "Delhivery",
    packStatus: "READY" as const
  },
  {
    id: "o2",
    accountId: "a1",
    awb: "9999999915493571",
    sku: "SKU2",
    qty: 1,
    color: "Gold",
    courier: "Shadowfax",
    packStatus: "READY" as const
  },
  {
    id: "o3",
    accountId: "a2",
    awb: "8888888815493571",
    sku: "SKU3",
    qty: 1,
    color: "Black",
    courier: "Xpress Bees",
    packStatus: "READY" as const
  },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `m${index}`,
    accountId: "a1",
    awb: `ABC15493${String(index).padStart(4, "0")}`,
    sku: `SKU${index}`,
    qty: 1,
    color: null,
    courier: null,
    packStatus: "READY" as const
  }))
];
assert.equal(findAwbSearchMatches({ candidates: awbCandidates, accountId: "a1", query: "1490834915493571" })[0]?.matchType, "EXACT", "AWB search ranks exact match first");
assert.equal(findAwbSearchMatches({ candidates: awbCandidates, accountId: "a1", query: "93571" }).length, 2, "AWB search supports last 5 suffix match");
assert.equal(findAwbSearchMatches({ candidates: awbCandidates, accountId: "a1", query: "15493571" }).length, 2, "AWB search supports last 8 suffix match");
assert.equal(findAwbSearchMatches({ candidates: awbCandidates, accountId: "a2", query: "93571" }).length, 1, "AWB search is account scoped");
assert.equal(findAwbSearchMatches({ candidates: awbCandidates, accountId: "a1", query: "15493" }).length, 10, "AWB search limits multiple matches");
assert.equal(findAwbSearchMatches({ candidates: awbCandidates, accountId: "a1", query: "00000" }).length, 0, "AWB search returns no results cleanly");
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
      color: null,
      notes: null,
      active: true
    },
    {
      sku: "EXISTING_SAME",
      imageUrl: "https://images-r.meesho.com/images/products/3/same.avif",
      productName: null,
      color: null,
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

const minimalSkuPlan = planSkuMappingImport(
  [
    {
      sku: "KEEP_METADATA",
      imageUrl: "https://images-r.meesho.com/images/products/4/same.avif",
      productName: "Existing name",
      color: "Blue",
      notes: "Existing note",
      active: false
    }
  ],
  [{ sku: "KEEP_METADATA", image_url: "https://images-r.meesho.com/images/products/4/same.avif" }]
);
assert.equal(minimalSkuPlan.unchanged.length, 1, "Same URL without optional metadata columns is unchanged");

const accountWisePlan = planAccountSkuMappingImport(
  [
    {
      accountId: "a1",
      sku: "SHARED_SKU",
      imageUrl: "https://images-r.meesho.com/images/products/a1/old.avif",
      productName: "Old A1",
      color: "Silver",
      notes: null,
      active: true
    },
    {
      accountId: "a2",
      sku: "SHARED_SKU",
      imageUrl: "https://images-r.meesho.com/images/products/a2/same.avif",
      productName: "Same A2",
      color: "Gold",
      notes: "keep",
      active: true
    }
  ],
  [
    {
      account: "Sullery",
      sku: "SHARED_SKU",
      image_url: "https://images-r.meesho.com/images/products/a1/new.avif",
      product_name: "New A1",
      color: "Silver"
    },
    {
      account_code: "ME2",
      sku: "SHARED_SKU",
      image_url: "https://images-r.meesho.com/images/products/a2/same.avif",
      product_name: "Same A2",
      color: "Gold",
      notes: "keep"
    },
    {
      sku: "NEW_SELECTED",
      image_url: "https://images-r.meesho.com/images/products/a1/new-selected.avif"
    }
  ],
  [
    { id: "a1", name: "Sullery", code: "ME1" },
    { id: "a2", name: "Second", code: "ME2" }
  ],
  { id: "a1", name: "Sullery", code: "ME1" },
  true
);
assert.equal(accountWisePlan.updated[0]?.accountId, "a1", "Account-wise import matches account by name");
assert.equal(accountWisePlan.unchanged[0]?.accountId, "a2", "Account-wise import matches account by code");
assert.equal(accountWisePlan.created[0]?.accountId, "a1", "Empty account cells use selected account");

const selectedOnlyPlan = planAccountSkuMappingImport(
  [],
  [{ account: "Second", sku: "SELECTED_ONLY", image_url: "https://images-r.meesho.com/images/products/a1/selected.avif" }],
  [
    { id: "a1", name: "Sullery", code: "ME1" },
    { id: "a2", name: "Second", code: "ME2" }
  ],
  { id: "a1", name: "Sullery", code: "ME1" },
  false
);
assert.equal(selectedOnlyPlan.created[0]?.accountId, "a1", "Selected-account import ignores account column unless all-account mode is enabled");

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
assert.equal(isOrderPreviewSourceType("PICKLIST_SUMMARY"), false, "Picklist summary rows are not order preview rows");
assert.equal(reviewProblemIssues([]).length, 0, "Picklist summary rows without AWB do not create missing-AWB problems by default");
assert.equal(reviewProblemIssues([{ issueType: "UNKNOWN_LAYOUT_ROW" }]).length, 1, "Unknown layout rows show in review problems");

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
assert.equal(pickerGroups[0]?.imageUrl, "https://example.com/image.jpg", "Picker group uses mapping image when order image is null");

const pickerGroupsWithOrderImage = buildPickerSkuGroups(
  [
    {
      id: "o3",
      awb: "A12345680",
      sku: "SKU2",
      qty: 1,
      color: null,
      size: null,
      courier: "Delhivery",
      orderNo: "ORDER3",
      productDescription: "Old image product",
      imageUrl: "https://example.com/old-order-image.jpg",
      pickStatus: "READY",
      packStatus: "READY"
    }
  ],
  [{ id: "m2", sku: "SKU2", imageUrl: "https://example.com/current-mapping-image.jpg", productName: "Current mapped product" }]
);
assert.equal(pickerGroupsWithOrderImage[0]?.imageUrl, "https://example.com/current-mapping-image.jpg", "Picker group prefers current mapping image when available");
assert.equal(normalizeSkuForMatching("SUL - PN - BC _ SS"), "SUL-PN-BC_SS", "SKU normalization removes spaces around hyphen and underscore");

assert.equal(validateWorkerPassword("demo1234").valid, false, "Demo password is rejected");
assert.equal(validateWorkerPassword("better123").valid, true, "Usable worker password passes");
assert.equal(canDeactivateUser("u1", "u1"), false, "Owner cannot deactivate self");
assert.equal(canDeactivateUser("u1", "u2"), true, "Owner can deactivate another user");
assert.equal(shouldCloseSessionsAfterPasswordReset("owner", "worker"), true, "Owner reset closes worker sessions");
assert.equal(shouldCloseSessionsAfterPasswordReset("owner", "owner"), false, "Owner self password change keeps current sessions");
assert.equal(canUseFirstRunSetup(0), true, "First-run setup is allowed when there are no users");
assert.equal(canUseFirstRunSetup(1), false, "First-run setup is blocked after any user exists");
assert.equal(validateFirstRunSetupPassword("demo1234", "demo1234").valid, false, "Setup reuses demo password rejection");
assert.equal(validateFirstRunSetupPassword("better123", "different123").valid, false, "Setup rejects mismatched passwords");
assert.equal(validateFirstRunSetupPassword("better123", "better123").valid, true, "Setup accepts valid matching password");

assert.equal(normalizeIp("::ffff:192.168.1.10"), "192.168.1.10", "IPv4-mapped IPs normalize");
assert.equal(isIpInCidr("192.168.1.10", "192.168.0.0/16"), true, "Local CIDR allows Wi-Fi IP");
assert.equal(isAllowedLocalNetworkIp("8.8.8.8", "192.168.0.0/16"), false, "External IP is blocked by local-only ranges");
assert.equal(isAllowedLocalNetworkIp("127.0.0.1", "192.168.0.0/16"), true, "Localhost is always allowed");

assert.equal(getInitialProductImageState(null), "missing", "Product image fallback handles missing URL");
assert.equal(getInitialProductImageState("https://example.com/image.jpg"), "loading", "Product image starts loading for valid URL");
assert.equal(getInitialProductImageState("not-a-url"), "broken", "Product image state separates invalid URLs from missing mappings");
assert.equal(productImageStateText("missing", false), "Missing mapping", "Product image state labels missing mapping clearly");
assert.equal(productImageStateText("loading", true, true), "Still loading image", "Product image state labels slow image loads clearly");
assert.equal(productImageStateText("broken", true), "Image URL failed", "Product image state labels failed image loads clearly");
assert.equal(picklistSummaryProductNameLabel({ imageUrl: "https://example.com/image.jpg", imageHealth: "MAPPED", productName: null }), "Mapped, no product name", "Picklist summary shows mapped SKU without product name");
assert.equal(picklistSummaryProductNameLabel(null), "No mapping", "Picklist summary shows no mapping separately");
assert.equal(imageHealthLabel({ imageUrl: "https://example.com/image.jpg", imageHealth: "BROKEN" }), "Broken image URL", "Broken image health label is clear");
assert.equal(normalizeSkuMappingImageFilter("broken"), "broken", "SKU mapping image filter accepts broken");
assert.equal(normalizeSkuMappingImageFilter("surprise"), "all", "SKU mapping image filter falls back to all");
assert.equal(skuMappingMatchesImageFilter({ imageUrl: "https://example.com/image.jpg", imageHealth: "BROKEN" }, "broken"), true, "SKU mapping helper matches broken mappings");
assert.equal(skuMappingMatchesImageFilter({ imageUrl: "", imageHealth: "UNKNOWN" }, "missing"), true, "SKU mapping helper matches missing URLs");
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
const demoPasswordChecks = runProductionChecks({
  nodeEnv: "production",
  sessionSecret: "this-is-a-long-production-secret-123",
  nextPublicAppUrl: "https://pack.personalizedgiftday.com",
  databaseUrl: "postgresql://user:pass@example.com:5432/db",
  localNetworkOnly: "false",
  demoUsers: [{ username: "packer", active: true, passwordHash: hashPassword("demo1234") }],
  skuMappingCount: 1
});
assert.equal(
  demoPasswordChecks.some((check) => check.key === "demo-passwords" && check.status === "NEEDS_ACTION"),
  true,
  "Production checks detect active seed users with stored demo password hash"
);

const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const buildScript = readFileSync(join(repoRoot, "scripts", "build.mjs"), "utf8");
const pdfExtractor = readFileSync(join(repoRoot, "lib", "pdf", "extract-pages.ts"), "utf8");
const sqliteSchema = readFileSync(join(repoRoot, "prisma", "schema.prisma"), "utf8");
const postgresSchema = readFileSync(join(repoRoot, "prisma", "schema.postgres.prisma"), "utf8");
const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
assert.match(
  readme,
  /Free-first daily setup: Windows PC \+ Supabase \+ Cloudflare Tunnel/,
  "README documents the recommended free-first setup"
);
assert.match(readme, /Account-wise SKU image database/, "README documents account-wise SKU image mappings");
assert.match(readme, /Do not commit real Meesho PDFs/, "README warns against committing real PDFs");
assert.match(readme, /Vercel is [\s\S]*not recommended here for heavy PDF parsing/, "README marks Vercel as not recommended for heavy PDF parsing");
assert.match(readme, /SQLite requires a `file:` URL/, "README documents the Prisma provider mismatch rebuild fix");
assert.equal(buildScript.indexOf('import "dotenv/config";') < buildScript.indexOf("process.env.DATABASE_URL"), true, "Build loads .env before choosing Prisma schema");
assert.equal(pdfExtractor.includes(".next/server/chunks/pdf.worker.mjs"), false, "PDF extraction does not reference Next server worker chunks");
assert.match(pdfExtractor, /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/, "PDF extraction preloads the PDF.js worker module explicitly");
assert.match(pdfExtractor, /PDF text extraction failed before pages could be read\./, "PDF extraction reports startup failures before page reads");
assert.match(sqliteSchema, /@@unique\(\[accountId, sku\]\)/, "SQLite schema keeps SKU mappings unique by account and SKU");
assert.match(postgresSchema, /@@unique\(\[accountId, sku\]\)/, "PostgreSQL schema keeps SKU mappings unique by account and SKU");
assert.match(gitignore, /\*\.pdf/, "Git ignores real PDF files");
assert.equal(existsSync(join(repoRoot, "scripts", "windows", "start-local-prod.ps1")), true, "Windows production PowerShell script exists");
assert.equal(existsSync(join(repoRoot, "scripts", "windows", "start-local-prod.bat")), true, "Windows production batch script exists");
assert.equal(existsSync(join(repoRoot, "docs", "cloudflare-tunnel", "config.yml.example")), true, "Cloudflare Tunnel config example exists");
assert.equal(existsSync(join(repoRoot, ".env.local.production.example")), true, "Local production env example exists");

console.log("Validation tests passed.");
