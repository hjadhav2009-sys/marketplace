import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AwbBarcodeScanner } from "../components/AwbBarcodeScanner";
import { isValidAwb, normalizeAwb } from "../lib/awb";
import {
  authRedirectForSessionStatus,
  evaluateLoginCredentials,
  loginRedirectForResult,
  normalizeUsername,
  sessionCookieSecurityDiagnostics,
  shouldUseSecureSessionCookie
} from "../lib/auth-helpers";
import { canAccessAccount, canRoleAccessPath } from "../lib/authz";
import { escapeCsvFormulaText, formatCsvValue, rowsToCsv, safeSpreadsheetValue } from "../lib/csv";
import { buildSkuMetadataAutoFillUpdates, planOrderImport } from "../lib/import/orders";
import { importIssuePageWindow, maskOperationalKey, safeImportIssueContext } from "../lib/import/issues";
import {
  cachedProductImageUrl,
  canUserAccessCachedImage,
  cardFileNameForContentType,
  findImageCacheCleanupCandidates,
  imageCacheNeedsRefresh,
  isBlockedImageDownloadUrl,
  isAllowedCachedImageFileName,
  parseProductImageCacheRoutePath,
  productImageCacheDir,
  productImageCacheRelativeDir,
  readImageCacheMeta,
  safeImageCacheSegment,
  signCachedImagePath,
  signedCachedProductImageUrl,
  verifySignedCachedImageUrl,
  writeImageCacheMeta
} from "../lib/image-cache";
import {
  buildPreviewImportStats,
  canImportPreviewIssues,
  isOrderPreviewSourceType,
  reviewProblemIssues,
  selectPreviewRowsForImport
} from "../lib/import/preview";
import { planAccountSkuMappingImport, planSkuMappingImport, type RawImportRow } from "../lib/import/sku-mappings";
import { isAllowedLocalNetworkIp, isIpInCidr, normalizeIp } from "../lib/network";
import { findAwbSearchMatches } from "../lib/operations/awb-search";
import { canConfirmPacked, selectConfirmPackedOrderIds } from "../lib/operations/packing";
import { buildPickerSkuGroups, normalizePickerLimit, paginatePickerSkuGroups } from "../lib/operations/picking";
import { buildWorkQueueOrderWhere, normalizeWorkQueueFilter, orderMatchesWorkQueue, startOfWorkDay } from "../lib/operations/work-queue";
import { hashPassword, isLegacyPasswordHash, legacySha256PasswordHash, passwordHashNeedsUpgrade, verifyPassword } from "../lib/password";
import { runProductionChecks, summarizeProductionChecks } from "../lib/production-checks";
import { normalizeReportStatus, reportDateRange, reportStatusWhere } from "../lib/reports";
import {
  buildListingImageGallery,
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
import { importJobEstimatedRemainingSeconds, importJobPageWindow, IMPORT_JOB_PAGE_SIZE, IMPORT_JOB_PAGE_SIZES } from "../src/lib/import-jobs/progress";
import { isRetainedImportJobFilePath } from "../src/lib/import-jobs/runner";
import { FLIPKART_IMPORT_MAX_BYTES, isUploadTooLarge } from "../lib/upload-limits";
import {
  awbSearchSchema,
  flipkartExcelImportFileSchema,
  flipkartOrderImportFileSchema,
  loginSchema,
  ownerAccountSchema,
  parsedOrderSchema,
  skuImageMappingSchema,
  uploadBatchSchema
} from "../lib/validators";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const imageCacheSource = readFileSync(join(repoRoot, "lib", "image-cache.ts"), "utf8");

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

const authPasswordHash = hashPassword("correct-password");
const secondPasswordHash = hashPassword("correct-password");
const legacyPasswordHash = legacySha256PasswordHash("correct-password");
assert.match(authPasswordHash, /^scrypt\$/, "New password hashes use the salted scrypt format");
assert.notEqual(authPasswordHash, secondPasswordHash, "New password hashes use random salt");
assert.equal(verifyPassword("correct-password", authPasswordHash), true, "Scrypt password verification works");
assert.equal(isLegacyPasswordHash(legacyPasswordHash), true, "Legacy SHA-256 hashes are recognized");
assert.equal(verifyPassword("correct-password", legacyPasswordHash), true, "Legacy SHA-256 hashes can still log in once");
assert.equal(passwordHashNeedsUpgrade(legacyPasswordHash), true, "Legacy SHA-256 hashes are marked for upgrade");
assert.equal(passwordHashNeedsUpgrade(authPasswordHash), false, "Fresh scrypt hashes do not need upgrade");
assert.equal(normalizeUsername("  PICKER "), "picker", "Username normalization trims and lowercases");
assert.equal(
  evaluateLoginCredentials({ active: true, lockedUntil: null, mustChangePassword: false, passwordHash: authPasswordHash }, "correct-password"),
  "allowed",
  "Correct password login is allowed"
);
assert.equal(
  evaluateLoginCredentials({ active: true, lockedUntil: null, mustChangePassword: false, passwordHash: authPasswordHash }, "wrong-password"),
  "invalid_credentials",
  "Wrong password login is blocked"
);
assert.equal(
  evaluateLoginCredentials({ active: false, lockedUntil: null, mustChangePassword: false, passwordHash: authPasswordHash }, "correct-password"),
  "inactive",
  "Inactive user login is blocked"
);
assert.equal(
  evaluateLoginCredentials({ active: true, lockedUntil: null, mustChangePassword: true, passwordHash: authPasswordHash }, "correct-password"),
  "must_change_password",
  "Users marked must-change-password are sent to password change"
);
assert.equal(loginRedirectForResult("must_change_password"), "/change-password?required=1", "Must-change-password login redirects to password change");
assert.equal(authRedirectForSessionStatus("invalid"), "/auth/session-ended?reason=expired", "Invalid sessions redirect through safe session cleanup");
assert.equal(shouldUseSecureSessionCookie({ SESSION_COOKIE_SECURE: "false", NEXT_PUBLIC_APP_URL: "https://pack.personalizedgiftday.com" }), false, "Secure cookie can be disabled for local HTTP");
assert.equal(shouldUseSecureSessionCookie({ SESSION_COOKIE_SECURE: "true", NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), true, "Secure cookie can be forced for HTTPS-only deployments");
assert.equal(shouldUseSecureSessionCookie({ SESSION_COOKIE_SECURE: "auto", NEXT_PUBLIC_APP_URL: "https://pack.personalizedgiftday.com" }), true, "Auto cookie mode is secure for HTTPS app URL");
assert.equal(shouldUseSecureSessionCookie({ SESSION_COOKIE_SECURE: "auto", NEXT_PUBLIC_APP_URL: "http://192.168.1.10:3000" }), false, "Auto cookie mode is not secure for local HTTP IP");
assert.equal(
  sessionCookieSecurityDiagnostics({ SESSION_COOKIE_SECURE: "true", NEXT_PUBLIC_APP_URL: "http://192.168.1.10:3000", NODE_ENV: "production" }).warning,
  "Local HTTP is using secure cookies. Mobile local-IP login may fail.",
  "System diagnostics warn when local HTTP is configured with secure cookies"
);

assert.equal(parsedOrderSchema.safeParse(sampleOrder).success, true, "seed order should validate");
assert.equal(awbSearchSchema.safeParse({ awb: sampleOrder.awb }).success, true, "seed AWB should validate");
assert.equal(normalizeAwb(" 1490 8349 1549 3571 "), "1490834915493571", "numeric AWB normalizes");
assert.equal(normalizeAwb("sf3423949467fpl"), "SF3423949467FPL", "Shadowfax AWB normalizes");
assert.equal(isValidAwb("bad"), false, "bad AWB is rejected");
assert.equal(isAllowedLocalNetworkIp(undefined, "192.168.0.0/16"), false, "LOCAL_NETWORK_ONLY fails closed when client IP is unavailable");
assert.equal(isAllowedLocalNetworkIp("127.0.0.1", "192.168.0.0/16"), true, "LOCAL_NETWORK_ONLY allows loopback");
assert.equal(isAllowedLocalNetworkIp("203.0.113.5", "192.168.0.0/16"), false, "LOCAL_NETWORK_ONLY blocks public IPs outside configured ranges");
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
assert.equal(flipkartOrderImportFileSchema.safeParse({ filename: "flipkart-order.csv" }).success, true, "Flipkart order CSV upload should validate");
assert.equal(flipkartOrderImportFileSchema.safeParse({ filename: "flipkart-order.xlsx" }).success, true, "Flipkart order XLSX upload should validate");
assert.equal(flipkartOrderImportFileSchema.safeParse({ filename: "flipkart-order.pdf" }).success, false, "Flipkart order non-spreadsheet upload should fail");
assert.equal(isUploadTooLarge({ size: FLIPKART_IMPORT_MAX_BYTES + 1 }, FLIPKART_IMPORT_MAX_BYTES), true, "Oversized Flipkart imports are rejected before buffering");
assert.equal(isUploadTooLarge({ size: FLIPKART_IMPORT_MAX_BYTES }, FLIPKART_IMPORT_MAX_BYTES), false, "Flipkart imports at the size limit are accepted");
assert.equal(flipkartExcelImportFileSchema.safeParse({ filename: "flipkart-listing.csv" }).success, false, "Flipkart Listing Master stays XLSX-only for now");
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
assert.equal(loginSchema.parse({ username: " OWNER ", password: "demo1234" }).username, "owner", "login schema normalizes username");
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
      imageUrl: "https://images-r.meesho.com/images/products/2/old.avif"
    },
    {
      sku: "EXISTING_SAME",
      imageUrl: "https://images-r.meesho.com/images/products/3/same.avif"
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
      imageUrl: "https://images-r.meesho.com/images/products/4/same.avif"
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
      imageUrl: "https://images-r.meesho.com/images/products/a1/old.avif"
    },
    {
      accountId: "a2",
      sku: "SHARED_SKU",
      imageUrl: "https://images-r.meesho.com/images/products/a2/same.avif"
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
assert.notEqual(
  accountWisePlan.updated[0]?.imageUrl,
  accountWisePlan.unchanged[0]?.imageUrl,
  "Same SKU in two accounts keeps different image URLs"
);

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
const repeatedPdfPlan = planOrderImport(
  [
    {
      awb: "OLD_AWB",
      courier: "Delhivery",
      sku: "SKU1",
      qty: 1,
      color: "Silver",
      size: null,
      orderNo: "ORDER1",
      productDescription: "Pendant",
      paymentType: "UNKNOWN"
    }
  ],
  [
    { awb: "OLD_AWB", courier: "Delhivery", sku: "SKU1", qty: 1, color: "Silver", orderNo: "ORDER1", productDescription: "Pendant" },
    { awb: "NEW_LATER_AWB", sku: "SKU1", qty: 1, orderNo: "ORDER6" },
    { awb: "NEW_LATER_AWB", sku: "SKU1", qty: 1, orderNo: "ORDER6" }
  ],
  new Set(["SKU1"])
);
assert.equal(repeatedPdfPlan.created.length, 1, "Later PDF with old + new AWB creates only the new AWB once");
assert.equal(repeatedPdfPlan.duplicates.length, 2, "Repeated PDF rows and duplicate rows are skipped safely");
const metadataAutoFill = buildSkuMetadataAutoFillUpdates(
  [
    { id: "m1", sku: "SKU_META_EMPTY", productName: null, color: null, size: null },
    { id: "m2", sku: "SKU_META_OWNER", productName: "Owner name", color: "Owner color", size: "Owner size" }
  ],
  [
    {
      sku: "SKU_META_EMPTY",
      productDescription: "Parsed product name",
      color: "Parsed color",
      size: "Parsed size"
    },
    {
      sku: "SKU_META_OWNER",
      productDescription: "Should not overwrite",
      color: "Should not overwrite",
      size: "Should not overwrite"
    }
  ]
);
assert.equal(metadataAutoFill.find((update) => update.id === "m1")?.productName, "Parsed product name", "Product name auto-fills when empty");
assert.equal(metadataAutoFill.find((update) => update.id === "m1")?.color, "Parsed color", "Color auto-fills when empty");
assert.equal(metadataAutoFill.find((update) => update.id === "m1")?.size, "Parsed size", "Size auto-fills when empty");
assert.equal(metadataAutoFill.some((update) => update.id === "m2"), false, "Owner-filled metadata is not overwritten");
assert.equal(canImportPreviewIssues([{ issueType: "LOW_CONFIDENCE" }]), false, "Low confidence preview rows do not import by default");
assert.equal(canImportPreviewIssues([{ issueType: "MISSING_IMAGE_MAPPING" }]), true, "Missing image mapping does not block preview import");
assert.equal(isOrderPreviewSourceType("PICKLIST_SUMMARY"), false, "Picklist summary rows are not order preview rows");
assert.equal(reviewProblemIssues([]).length, 0, "Picklist summary rows without AWB do not create missing-AWB problems by default");
assert.equal(reviewProblemIssues([{ issueType: "UNKNOWN_LAYOUT_ROW" }]).length, 1, "Unknown layout rows show in review problems");
const labelManifestPreviewRows = [
  ...Array.from({ length: 95 }, (_, index) => ({
    id: `label-${index}`,
    sourceType: "LABEL",
    awb: `LBL${String(index).padStart(10, "0")}`,
    sku: "SUL-BR-PB-GR & WH-CR03",
    imported: false,
    issues: [] as Array<{ issueType: string }>
  })),
  ...Array.from({ length: 103 }, (_, index) => ({
    id: `manifest-${index}`,
    sourceType: "MANIFEST_ORDER",
    awb: `LBL${String(index % 95).padStart(10, "0")}`,
    sku: "SUL-BR-PB-GR & WH-CR03",
    imported: false,
    issues: [{ issueType: "DUPLICATE_EXISTING_AWB" }]
  })),
  { id: "summary-1", sourceType: "PICKLIST_SUMMARY", awb: null, sku: "SUL-BR-PB-GR & WH-CR03", imported: false, issues: [] }
];
const labelManifestStats = buildPreviewImportStats(labelManifestPreviewRows, "LABEL");
assert.equal(labelManifestStats.labelOrderRows, 95, "Preview counts label rows separately");
assert.equal(labelManifestStats.manifestOrderRows, 103, "Preview counts manifest rows separately");
assert.equal(labelManifestStats.picklistSummaryRows, 1, "Preview counts picklist summary rows separately");
assert.equal(labelManifestStats.importSourceRows, 95, "Label plus manifest preview keeps only labels as import source");
assert.equal(labelManifestStats.existingDuplicateRows, 0, "Manifest duplicate AWBs are not counted against label import rows");
const selectedLabelRows = selectPreviewRowsForImport(labelManifestPreviewRows, "LABEL");
assert.equal(selectedLabelRows.rows.length, 95, "Label 95 plus manifest rows does not create 198 import rows");
assert.equal(selectedLabelRows.rows.some((row) => row.sourceType === "MANIFEST_ORDER"), false, "Manifest rows do not duplicate label AWBs on import");
const picklistOnlySelection = selectPreviewRowsForImport([
  { id: "picklist-only", sourceType: "PICKLIST_SUMMARY", sku: "SKU1", qty: 10, imported: false, issues: [] }
]);
assert.equal(picklistOnlySelection.rows.length, 0, "Picklist summary rows do not create orders");
const repeatedLabelPlan = planOrderImport(
  selectedLabelRows.rows.map((row) => ({
    awb: row.awb ?? "",
    courier: "Delhivery",
    sku: row.sku ?? "",
    qty: 1,
    color: "Green",
    size: "Free Size",
    orderNo: row.awb ?? "",
    productDescription: "Bracelet",
    paymentType: "UNKNOWN" as const
  })),
  selectedLabelRows.rows.map((row) => ({
    awb: row.awb,
    courier: "Delhivery",
    sku: row.sku,
    qty: 1,
    color: "Green",
    size: "Free Size",
    orderNo: row.awb,
    productDescription: "Bracelet",
    paymentType: "UNKNOWN" as const
  })),
  new Set(["SUL-BR-PB-GR & WH-CR03"])
);
assert.equal(repeatedLabelPlan.created.length, 0, "Re-uploading same label plus manifest does not increase order count");

assert.equal(canRoleAccessPath("OWNER", "/reports"), true, "Owner can access reports");
assert.equal(canRoleAccessPath("OWNER", "/dashboard"), true, "Owner can access the dashboard route");
assert.equal(canRoleAccessPath("OWNER", "/owner/system"), true, "Owner can access system health");
assert.equal(canRoleAccessPath("OWNER", "/owner/cleanup"), true, "Owner can access cleanup");
assert.equal(canRoleAccessPath("PICKER", "/dashboard"), false, "Picker cannot access owner dashboard");
assert.equal(canRoleAccessPath("PACKER", "/dashboard"), false, "Packer cannot access owner dashboard");
assert.equal(canRoleAccessPath("PICKER", "/packing"), false, "Picker cannot access packing");
assert.equal(canRoleAccessPath("PACKER", "/owner/users"), false, "Packer cannot access owner pages");
assert.equal(canRoleAccessPath("PACKER", "/problems"), true, "Packer can access problems");
assert.equal(canAccessAccount({ role: "PICKER", accountId: "a1" }, "a1"), true, "Assigned user can access account");
assert.equal(canAccessAccount({ role: "PICKER", accountId: "a1" }, "a2"), false, "Assigned user cannot access other account");
assert.equal(canAccessAccount({ role: "PICKER", accountId: null }, "a1"), false, "Worker with no assignment cannot access an account");
assert.equal(canRoleAccessPath("PICKER", "/change-password"), true, "Workers can change password");

assert.equal(canConfirmPacked({ packStatus: "READY" }), true, "Ready order can be packed");
assert.equal(canConfirmPacked({ packStatus: "PACKED" }), false, "Packed order is idempotently skipped");
assert.equal(canConfirmPacked({ packStatus: "PROBLEM" }), false, "Problem order cannot be packed accidentally");
assert.deepEqual(
  selectConfirmPackedOrderIds(
    { id: "o1", accountId: "a1", marketplace: "FLIPKART", trackingId: "FMPC0000000001", packStatus: "READY" },
    [
      { id: "o1", accountId: "a1", marketplace: "FLIPKART", trackingId: "FMPC0000000001", packStatus: "READY" },
      { id: "o2", accountId: "a1", marketplace: "FLIPKART", trackingId: "FMPC0000000001", packStatus: "READY" },
      { id: "o3", accountId: "a1", marketplace: "FLIPKART", trackingId: "FMPC0000000001", packStatus: "PACKED" },
      { id: "o4", accountId: "a1", marketplace: "FLIPKART", trackingId: "FMPC0000000001", packStatus: "PROBLEM" },
      { id: "o5", accountId: "a2", marketplace: "FLIPKART", trackingId: "FMPC0000000001", packStatus: "READY" }
    ]
  ),
  ["o1", "o2"],
  "Direct pack scope packs only ready same-account Flipkart Tracking ID items"
);
assert.equal(IMPORT_JOB_PAGE_SIZE, 10, "Import job pagination defaults to 10 rows");
assert.deepEqual([...IMPORT_JOB_PAGE_SIZES], [10, 25, 50, 100], "Import job page size supports 10/25/50/100");
assert.deepEqual(
  importJobPageWindow(42, "2", 25),
  { page: 2, pageSize: 25, totalPages: 2, skip: 25, take: 25, from: 26, to: 42 },
  "Import job page window calculates page ranges"
);
assert.equal(
  importJobEstimatedRemainingSeconds({
    totalRows: 100,
    processedRows: 40,
    startedAt: "2026-07-07T10:00:00.000Z"
  }, new Date("2026-07-07T10:00:20.000Z")),
  30,
  "Import job ETA uses rows per second"
);
const workQueueNow = new Date("2026-05-26T10:30:00.000Z");
const workQueueStart = startOfWorkDay(workQueueNow);
assert.equal(workQueueStart.getHours(), 0, "Work queue day starts at local midnight");
assert.equal(workQueueStart.getMinutes(), 0, "Work queue day clears minutes");
assert.equal(normalizeWorkQueueFilter("old-pending"), "old-pending", "Work queue accepts old pending filter");
assert.equal(normalizeWorkQueueFilter("surprise"), "today", "Work queue defaults to today");
assert.equal(
  orderMatchesWorkQueue(
    {
      accountId: "a1",
      batchId: "b1",
      packStatus: "READY",
      pickStatus: "READY",
      status: "READY",
      importedAt: new Date("2026-05-26T08:00:00.000Z")
    },
    { accountId: "a1", work: "today", now: workQueueNow }
  ),
  true,
  "Default today picker includes today's active imported orders"
);
assert.equal(
  orderMatchesWorkQueue(
    {
      accountId: "a1",
      batchId: "b1",
      packStatus: "READY",
      pickStatus: "READY",
      status: "READY",
      importedAt: new Date("2026-05-25T08:00:00.000Z")
    },
    { accountId: "a1", work: "today", now: workQueueNow }
  ),
  false,
  "Default today picker excludes yesterday's old pending orders"
);
assert.equal(
  orderMatchesWorkQueue(
    {
      accountId: "a1",
      batchId: "b1",
      packStatus: "READY",
      pickStatus: "READY",
      status: "READY",
      importedAt: new Date("2026-05-25T08:00:00.000Z")
    },
    { accountId: "a1", work: "old-pending", now: workQueueNow }
  ),
  true,
  "Old pending filter keeps older READY orders visible"
);
assert.equal(
  orderMatchesWorkQueue(
    {
      accountId: "a1",
      batchId: "b1",
      packStatus: "READY",
      pickStatus: "READY",
      status: "READY",
      importedAt: new Date("2026-05-26T08:00:00.000Z")
    },
    { accountId: "a1", work: "current-batch", batchId: "b2", now: workQueueNow }
  ),
  false,
  "Current batch filter does not mix orders from another batch"
);
assert.deepEqual(
  buildWorkQueueOrderWhere("a1", { work: "old-pending", now: workQueueNow }),
  { accountId: "a1", packStatus: "READY", importedAt: { lt: workQueueStart } },
  "Old pending query is account scoped and date scoped"
);

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
  [
    {
      id: "m1",
      sku: "SKU1",
      imageUrl: "https://example.com/image.jpg",
      cachedImageUrl: "/product-images/meesho/a1/SKU1/card.webp",
      galleryImages: ["https://example.invalid/large-1.jpg", "https://example.invalid/small-1.jpg"],
      productName: "Pendant",
      cacheStatus: "CACHED"
    }
  ]
);

assert.equal(pickerGroups.length, 2, "Picker grouping separates SKU by color and size");
assert.equal(pickerGroups.find((group) => group.color === "Silver")?.totalQuantity, 1, "Picker group sums quantity");
assert.equal(pickerGroups.find((group) => group.color === "Gold")?.status, "PICKED", "Picked group status is derived");
assert.equal(pickerGroups[0]?.imageUrl, "/product-images/meesho/a1/SKU1/card.webp", "Picker group uses cached image URL first");
assert.deepEqual(pickerGroups[0]?.mapping?.galleryImages, ["https://example.invalid/large-1.jpg", "https://example.invalid/small-1.jpg"], "Picker card receives listing gallery images");
assert.equal(paginatePickerSkuGroups(pickerGroups, { limit: 1 }).groups.length, 1, "Picker pagination limits first render");
assert.equal(paginatePickerSkuGroups(pickerGroups, { limit: 1 }).hasMore, true, "Picker pagination exposes load-more state");
assert.equal(paginatePickerSkuGroups(pickerGroups, { limit: 1, page: 2 }).groups.length, 2, "Picker load-more keeps previous groups visible");
assert.equal(normalizePickerLimit("999"), 96, "Picker compact mode caps very large limits");

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
  [
    {
      id: "m2",
      sku: "SKU2",
      imageUrl: "https://example.com/current-mapping-image.jpg",
      cachedImageUrl: "/product-images/meesho/a1/SKU2/card.webp",
      productName: "Current mapped product",
      cacheStatus: "CACHED"
    }
  ]
);
assert.equal(pickerGroupsWithOrderImage[0]?.imageUrl, "/product-images/meesho/a1/SKU2/card.webp", "Picker group does not fall back to slow order image when cached image exists");
assert.equal(normalizeSkuForMatching("SUL-BR-PB-GR & WH-CR03"), "SUL-BR-PB-GR & WH-CR03", "SKU normalization preserves ampersand SKUs");
assert.equal(normalizeSkuForMatching("Sullery Earing - 29"), "Sullery Earing - 29", "SKU normalization preserves meaningful spaces");
assert.equal(normalizeSkuForMatching("Sullery-BR-ME-BL Allah34"), "Sullery-BR-ME-BL-Allah34", "SKU normalization rejoins wrapped code-like SKUs");

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
assert.equal(
  ownerAccountSchema.parse({
    companyName: "Sullery",
    marketplace: "FLIPKART",
    accountDisplayName: "Second Account",
    accountCode: "Second Account",
    active: true
  }).accountCode,
  "second-account",
  "Owner account code is normalized"
);
assert.equal(
  ownerAccountSchema.safeParse({ companyName: "Sullery", accountDisplayName: "Missing Marketplace", accountCode: "missing-marketplace", active: true }).success,
  false,
  "Create account requires marketplace"
);
assert.deepEqual(
  importIssuePageWindow(151, "2", 50),
  { page: 2, pageSize: 50, totalPages: 4, skip: 50, take: 50, from: 51, to: 100 },
  "Import issue drill-down defaults to 50-row pagination windows"
);
assert.equal(importIssuePageWindow(10, "1", 10).pageSize, 50, "Import issue page rejects unsupported page sizes");
assert.equal(importIssuePageWindow(10, "1", 25).pageSize, 25, "Import issue page supports 25 rows");
assert.equal(importIssuePageWindow(10, "1", 100).pageSize, 100, "Import issue page supports 100 rows");
assert.equal(maskOperationalKey("FMPC0000000001"), "FMPC...0001", "Operational keys are masked before display");
const safeIssueContext = safeImportIssueContext(JSON.stringify({
  SKU: "SAFE-SKU-1",
  "Shipment ID": "SHIPMENT00000001",
  "ORDER ITEM ID": "ORDERITEM00000001",
  "Buyer name": "PRIVATE BUYER",
  "Address Line 1": "PRIVATE ADDRESS"
}));
assert.deepEqual(
  safeIssueContext,
  { sku: "SAFE-SKU-1", shipmentKey: "SHIP...0001", orderItemKey: "ORDE...0001" },
  "Import issue context extracts only SKU and masked operational keys"
);
assert.equal(JSON.stringify(safeIssueContext).includes("PRIVATE"), false, "Import issue context excludes private customer raw data");
assert.equal(isRetainedImportJobFilePath(join(repoRoot, "storage", "import-jobs", "fake.xlsx")), true, "Import retry accepts retained files under storage/import-jobs");
assert.equal(isRetainedImportJobFilePath(join(repoRoot, "private-test-data", "fake.xlsx")), false, "Import retry rejects files outside private retained import-job storage");
assert.equal(normalizeReportStatus("missing-image"), "missing-image", "Report status accepts current missing image filter");
assert.equal(normalizeReportStatus("not-real"), "", "Report status falls back safely");
const oldPendingReportWhere = reportStatusWhere("old-pending", new Date("2026-07-07T12:00:00.000Z"));
assert.equal(oldPendingReportWhere.packStatus, "READY", "Report old pending filter uses READY pack status");
assert.equal(oldPendingReportWhere.importedAt instanceof Object, true, "Report old pending filter separates work before today");
const explicitReportRange = reportDateRange({ from: "2026-07-01", to: "2026-07-02" });
assert.equal(explicitReportRange?.gte?.toISOString().slice(0, 10), "2026-07-01", "Report date filter parses from date");
assert.equal(explicitReportRange?.lte?.toISOString().slice(0, 10), "2026-07-02", "Report date filter parses to date");

assert.equal(normalizeIp("::ffff:192.168.1.10"), "192.168.1.10", "IPv4-mapped IPs normalize");
assert.equal(isIpInCidr("192.168.1.10", "192.168.0.0/16"), true, "Local CIDR allows Wi-Fi IP");
assert.equal(isAllowedLocalNetworkIp("8.8.8.8", "192.168.0.0/16"), false, "External IP is blocked by local-only ranges");
assert.equal(isAllowedLocalNetworkIp("127.0.0.1", "192.168.0.0/16"), true, "Localhost is always allowed");

assert.equal(getInitialProductImageState(null), "missing", "Product image fallback handles missing URL");
assert.equal(getInitialProductImageState("https://example.com/image.jpg"), "loading", "Product image starts loading for valid URL");
assert.equal(getInitialProductImageState("not-a-url"), "broken", "Product image state separates invalid URLs from missing mappings");
assert.equal(productImageStateText("missing", false), "No image URL", "Product image state labels missing URLs clearly");
assert.equal(productImageStateText("loading", true, true), "Still loading", "Product image state labels slow external images gently");
assert.equal(productImageStateText("loaded", true, false, "CACHED"), "Cached image available", "Product image state labels cached local images clearly");
assert.equal(productImageStateText("broken", true), "Image URL failed", "Product image state labels failed image loads clearly");
const galleryImages = buildListingImageGallery({
  mainImageUrl: "https://example.invalid/main.jpg",
  imageUrl1: "https://example.invalid/small-1.jpg",
  imageUrl2: "https://example.invalid/small-2.jpg",
  image1366Url1: "https://example.invalid/large-1.jpg",
  image1366Url2: "https://example.invalid/large-2.jpg"
});
assert.deepEqual(
  galleryImages,
  [
    "https://example.invalid/large-1.jpg",
    "https://example.invalid/small-1.jpg",
    "https://example.invalid/large-2.jpg",
    "https://example.invalid/small-2.jpg",
    "https://example.invalid/main.jpg"
  ],
  "Listing image gallery prefers 1366 image then standard image for each slot"
);
assert.deepEqual(
  buildListingImageGallery({ imageUrl1: "not-a-url", image1366Url1: "https://example.invalid/large-1.jpg", mainImageUrl: "https://example.invalid/large-1.jpg" }),
  ["https://example.invalid/large-1.jpg"],
  "Listing image gallery drops invalid URLs and de-duplicates repeats"
);
assert.deepEqual(
  buildListingImageGallery(null, "https://example.invalid/fallback.jpg"),
  ["https://example.invalid/fallback.jpg"],
  "Listing image gallery falls back to a single mapped image"
);
assert.equal(picklistSummaryProductNameLabel({ imageUrl: "https://example.com/image.jpg", imageHealth: "MAPPED", productName: null }), "Mapped image, no product name", "Picklist summary shows mapped SKU without product name");
assert.equal(picklistSummaryProductNameLabel(null), "No mapping", "Picklist summary shows no mapping separately");
assert.equal(imageHealthLabel({ imageUrl: "https://example.com/image.jpg", imageHealth: "BROKEN" }), "Broken image URL", "Broken image health label is clear");
assert.equal(normalizeSkuMappingImageFilter("cached"), "cached", "SKU mapping image filter accepts cached");
assert.equal(normalizeSkuMappingImageFilter("mapped"), "cached", "Old mapped filter aliases to cached");
assert.equal(normalizeSkuMappingImageFilter("broken"), "broken", "SKU mapping image filter accepts broken");
assert.equal(normalizeSkuMappingImageFilter("surprise"), "all", "SKU mapping image filter falls back to all");
assert.equal(skuMappingMatchesImageFilter({ imageUrl: "https://example.com/image.jpg", cacheStatus: "BROKEN" }, "broken"), true, "SKU mapping helper matches broken cache mappings");
assert.equal(skuMappingMatchesImageFilter({ imageUrl: "https://example.com/image.jpg", cacheStatus: "NOT_CACHED" }, "not-cached"), true, "SKU mapping helper matches not-cached mappings");
assert.equal(safeImageCacheSegment("SKU 1/2"), "SKU_1_2", "Image cache segment removes path separators");
assert.equal(productImageCacheRelativeDir({ accountId: "account/1", sku: "SKU 1/2" }), "meesho/account_1/SKU_1_2", "Account and SKU cache path is deterministic");
for (const fileName of ["card.webp", "card.jpg", "card.jpeg", "card.png", "card.avif"]) {
  assert.equal(isAllowedCachedImageFileName(fileName), true, `${fileName} is allowed as a cached card image`);
}
assert.equal(cardFileNameForContentType("image/avif"), "card.avif", "AVIF cached originals keep avif extension");
assert.equal(cardFileNameForContentType("image/png"), "card.png", "PNG cached originals keep png extension");
assert.equal(cardFileNameForContentType("image/webp"), "card.webp", "WebP cached originals keep webp extension");
assert.equal(cardFileNameForContentType("image/jpeg"), "card.jpg", "JPEG cached originals use jpg extension");
assert.equal(isAllowedCachedImageFileName("meta.json"), false, "meta.json is not served by cached image route");
assert.equal(isAllowedCachedImageFileName("other.jpg"), false, "Arbitrary cached image files are not served");
assert.equal(isBlockedImageDownloadUrl("file:///etc/passwd"), true, "Image cache blocks non-http URLs");
assert.equal(isBlockedImageDownloadUrl("http://localhost/admin"), true, "Image cache blocks localhost URLs");
assert.equal(isBlockedImageDownloadUrl("http://127.0.0.2/admin"), true, "Image cache blocks all IPv4 loopback addresses");
assert.equal(isBlockedImageDownloadUrl("http://[::ffff:127.0.0.1]/admin"), true, "Image cache blocks IPv4-mapped IPv6 loopback addresses");
assert.equal(isBlockedImageDownloadUrl("http://169.254.169.254/latest/meta-data"), true, "Image cache blocks link-local metadata addresses");
assert.equal(isBlockedImageDownloadUrl("http://192.168.1.1/router"), true, "Image cache blocks private LAN URLs");
assert.equal(isBlockedImageDownloadUrl("https://images-r.meesho.com/image.jpg"), false, "Image cache allows normal public HTTPS image URLs");
assert.match(imageCacheSource, /lookup\(hostname, \{ all: true, verbatim: true \}\)/, "Image cache checks DNS answers before server-side download");
assert.match(imageCacheSource, /redirect: "manual"/, "Image cache does not follow redirects without validation");
assert.match(imageCacheSource, /IMAGE_CACHE_MAX_REDIRECTS/, "Image cache caps redirect hops");
assert.equal(parseProductImageCacheRoutePath(["meesho", "a1", "SKU1", "card.webp"])?.relativePath, "meesho/a1/SKU1/card.webp", "Valid cache route path parses");
assert.equal(parseProductImageCacheRoutePath(["meesho", "a1", "SKU1", "meta.json"]), null, "Cache route rejects meta.json");
assert.equal(parseProductImageCacheRoutePath(["meesho", "a1", "..", "card.webp"]), null, "Cache route rejects traversal segments");
const parsedCachedImagePath = parseProductImageCacheRoutePath(["meesho", "a1", "SKU1", "card.webp"]);
assert.ok(parsedCachedImagePath, "Signed cache URL tests have a parsed route path");
const signedCacheUrl = signedCachedProductImageUrl({
  relativePath: parsedCachedImagePath.relativePath,
  accountId: parsedCachedImagePath.accountId,
  exp: 2_000_000_000
});
const signedCacheUrlParams = new URL(`http://localhost${signedCacheUrl}`).searchParams;
assert.equal(signedCacheUrl.startsWith("/product-images/meesho/a1/SKU1/card.webp?"), true, "Signed cached image URL uses the local product image route");
assert.equal(signedCacheUrlParams.get("exp"), "2000000000", "Signed cached image URL includes an expiry");
assert.equal(
  verifySignedCachedImageUrl({
    parsedPath: parsedCachedImagePath,
    token: signedCacheUrlParams.get("token"),
    exp: signedCacheUrlParams.get("exp"),
    now: new Date("2026-05-26T00:00:00.000Z")
  }),
  true,
  "Valid signed cached image token verifies without database access"
);
assert.equal(
  verifySignedCachedImageUrl({
    parsedPath: parsedCachedImagePath,
    token: "invalid",
    exp: signedCacheUrlParams.get("exp"),
    now: new Date("2026-05-26T00:00:00.000Z")
  }),
  false,
  "Invalid cached image token is rejected"
);
assert.equal(
  verifySignedCachedImageUrl({
    parsedPath: parsedCachedImagePath,
    token: signCachedImagePath({ relativePath: parsedCachedImagePath.relativePath, accountId: parsedCachedImagePath.accountId, exp: 1 }),
    exp: 1,
    now: new Date("2026-05-26T00:00:00.000Z")
  }),
  false,
  "Expired cached image token is rejected"
);
assert.equal(
  verifySignedCachedImageUrl({
    parsedPath: { ...parsedCachedImagePath, accountId: "a2", relativePath: "meesho/a2/SKU1/card.webp" },
    token: signedCacheUrlParams.get("token"),
    exp: signedCacheUrlParams.get("exp"),
    now: new Date("2026-05-26T00:00:00.000Z")
  }),
  false,
  "Signed cached image token is bound to account and relative path"
);
assert.equal(canUserAccessCachedImage({ role: "OWNER", accountId: null }, "a2"), true, "Owner can access any account cached image");
assert.equal(canUserAccessCachedImage({ role: "PICKER", accountId: "a1" }, "a2"), false, "Worker cannot access another account cached image");
assert.equal(canUserAccessCachedImage(null, "a1"), false, "Unauthenticated cached image access is denied");
assert.equal(
  cachedProductImageUrl({
    accountId: "a1",
    sku: "SKU1",
    imageUrl: "https://example.com/image.jpg",
    cacheStatus: "CACHED",
    cacheFilePath: "meesho/a1/SKU1/card.webp",
    cacheOriginalImageUrl: "https://example.com/image.jpg",
    cacheCachedAt: new Date("2026-05-25T00:00:00.000Z")
  })?.startsWith("/product-images/meesho/a1/SKU1/card.webp?"),
  true,
  "Cached image URL serves signed local product image route"
);
assert.match(
  cachedProductImageUrl({
    accountId: "a1",
    sku: "SKU1",
    imageUrl: "https://example.com/image.jpg",
    cacheStatus: "CACHED",
    cacheFilePath: "meesho/a1/SKU1/card.webp",
    cacheOriginalImageUrl: "https://example.com/image.jpg"
  }) ?? "",
  /[?&]token=/,
  "Cached image URL includes a signed token"
);
assert.equal(
  cachedProductImageUrl({
    accountId: "a1",
    sku: "SKU1",
    imageUrl: "https://example.com/image.jpg",
    cacheStatus: "CACHED",
    cacheFilePath: "meesho/a2/SKU1/card.webp",
    cacheOriginalImageUrl: "https://example.com/image.jpg"
  }),
  null,
  "Account A mapping cannot generate Account B cached image URL"
);
assert.notEqual(
  productImageCacheRelativeDir({ accountId: "a1", sku: "DUPLICATE-SKU" }),
  productImageCacheRelativeDir({ accountId: "a2", sku: "DUPLICATE-SKU" }),
  "Same SKU in two accounts maps to different cached image paths"
);
assert.equal(
  cachedProductImageUrl({
    accountId: "a1",
    sku: "SKU1",
    imageUrl: "https://example.com/new.jpg",
    cacheStatus: "CACHED",
    cacheFilePath: "meesho/a1/SKU1/card.webp",
    cacheOriginalImageUrl: "https://example.com/old.jpg"
  }),
  null,
  "Stale cached image URL is not served"
);
assert.equal(
  imageCacheNeedsRefresh({
    accountId: "a1",
    sku: "SKU1",
    imageUrl: "https://example.com/new.jpg",
    cacheStatus: "CACHED",
    cacheFilePath: "meesho/a1/SKU1/card.webp",
    cacheOriginalImageUrl: "https://example.com/old.jpg"
  }),
  true,
  "Changed image URL needs cache refresh"
);
assert.equal(
  imageCacheNeedsRefresh({
    accountId: "a1",
    sku: "SKU1",
    imageUrl: "https://example.com/image.jpg",
    cacheStatus: "CACHED",
    cacheFilePath: "meesho/a1/SKU1/card.webp",
    cacheOriginalImageUrl: "https://example.com/image.jpg"
  }),
  false,
  "Cached same SKU and same URL is skipped during image preparation"
);
const imageCacheTestRoot = mkdtempSync(join(tmpdir(), "meesho-image-cache-"));
try {
  await writeImageCacheMeta({
    root: imageCacheTestRoot,
    accountId: "a1",
    sku: "SKU1",
    meta: {
      marketplace: "meesho",
      accountId: "a1",
      sku: "SKU1",
      originalImageUrl: "https://example.com/image.jpg",
      cachedAt: "2026-04-01T00:00:00.000Z",
      lastUsedAt: "2026-04-01T00:00:00.000Z",
      width: 600,
      height: 600,
      fileSizeBytes: 4,
      status: "CACHED",
      contentType: "image/jpeg",
      fileName: "card.jpg",
      filePath: "meesho/a1/SKU1/card.jpg"
    }
  });
  mkdirSync(productImageCacheDir({ root: imageCacheTestRoot, accountId: "a1", sku: "SKU1" }), { recursive: true });
  writeFileSync(join(productImageCacheDir({ root: imageCacheTestRoot, accountId: "a1", sku: "SKU1" }), "card.jpg"), "test");
  const meta = await readImageCacheMeta({ root: imageCacheTestRoot, accountId: "a1", sku: "SKU1" });
  const cleanupCandidates = await findImageCacheCleanupCandidates(imageCacheTestRoot, new Date("2026-05-25T00:00:00.000Z"));
  assert.equal(meta?.status, "CACHED", "Image cache metadata read/write works");
  assert.equal(cleanupCandidates.length, 1, "Image cache retention selects files unused for 30+ days");
} finally {
  rmSync(imageCacheTestRoot, { recursive: true, force: true });
}
assert.equal(typeof AwbBarcodeScanner, "function", "Scanner component compiles");

assert.equal(formatCsvValue('A "quoted", value'), '"A ""quoted"", value"', "CSV values are safely escaped");
assert.equal(escapeCsvFormulaText("=1+1"), "'=1+1", "CSV formula text is neutralized");
assert.equal(formatCsvValue("+SUM(A1:A2)"), "'+SUM(A1:A2)", "CSV export values neutralize spreadsheet formulas");
assert.equal(safeSpreadsheetValue("-SUM(A1:A2)"), "'-SUM(A1:A2)", "Spreadsheet exports neutralize formula-like values");
assert.equal(safeSpreadsheetValue(new Date("2026-01-02T03:04:05.000Z")), "2026-01-02T03:04:05.000Z", "Spreadsheet exports serialize dates");
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
assert.equal(
  runProductionChecks({
    nodeEnv: "production",
    sessionSecret: "this-is-a-long-production-secret-123",
    nextPublicAppUrl: "https://pack.personalizedgiftday.com",
    databaseUrl: "postgresql://user:pass@example.com:5432/db",
    localNetworkOnly: "false",
    databasePingMs: 900,
    pendingMigrationCount: 1,
    imageCacheRootExists: false
  }).some((check) => check.key === "pending-migrations" && check.status === "NEEDS_ACTION"),
  true,
  "Production checks warn about pending migrations"
);

const envUtils = await import(new URL("../scripts/windows/env-utils.mjs", import.meta.url).href);
assert.equal(
  envUtils.maskDatabaseUrl("postgresql://user:secret@example.supabase.co:5432/postgres").includes("secret"),
  false,
  "Launcher/check-env masks DATABASE_URL passwords"
);
const envSummary = envUtils.validateEnvironment({
  DATABASE_URL: "DATABASE_URL=postgresql://user:secret@example.supabase.co:5432/postgres",
  SESSION_SECRET: "this-is-a-long-production-secret-123",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000"
});
assert.equal(envSummary.ok, true, "Launcher/check-env tolerates duplicated DATABASE_URL prefix without leaking it");
assert.equal(envSummary.schema, "prisma/schema.postgres.prisma", "Launcher/check-env selects PostgreSQL schema");
assert.equal(envSummary.sessionCookieSecure, "false", "Launcher/check-env defaults local HTTP cookies to non-secure mode");

const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const packageJsonText = readFileSync(join(repoRoot, "package.json"), "utf8");
const middlewareSource = readFileSync(join(repoRoot, "middleware.ts"), "utf8");
const nextConfig = readFileSync(join(repoRoot, "next.config.ts"), "utf8");
const buildScript = readFileSync(join(repoRoot, "scripts", "build.mjs"), "utf8");
const startScript = readFileSync(join(repoRoot, "scripts", "start.mjs"), "utf8");
const readinessScript = readFileSync(join(repoRoot, "scripts", "check-production-readiness.mjs"), "utf8");
const pdfExtractor = readFileSync(join(repoRoot, "lib", "pdf", "extract-pages.ts"), "utf8");
const importOrders = readFileSync(join(repoRoot, "lib", "import", "orders.ts"), "utf8");
const importPreview = readFileSync(join(repoRoot, "lib", "import", "preview.ts"), "utf8");
const uploadLimits = readFileSync(join(repoRoot, "lib", "upload-limits.ts"), "utf8");
const uploadActions = readFileSync(join(repoRoot, "app", "owner", "uploads", "actions.ts"), "utf8");
const uploadPage = readFileSync(join(repoRoot, "app", "owner", "uploads", "new", "page.tsx"), "utf8");
const productImageComponent = readFileSync(join(repoRoot, "components", "ProductImage.tsx"), "utf8");
const productImageGalleryComponent = readFileSync(join(repoRoot, "components", "ProductImageGallery.tsx"), "utf8");
const pickerProductCardComponent = readFileSync(join(repoRoot, "components", "PickerProductCard.tsx"), "utf8");
const productDetailsDrawerComponent = readFileSync(join(repoRoot, "components", "ProductDetailsDrawer.tsx"), "utf8");
const appNavComponent = readFileSync(join(repoRoot, "components", "AppNav.tsx"), "utf8");
const accountSwitcherComponent = readFileSync(join(repoRoot, "components", "AccountSwitcherForm.tsx"), "utf8");
const marketplaceImportWizardComponent = readFileSync(join(repoRoot, "components", "MarketplaceImportWizard.tsx"), "utf8");
const awbScannerComponent = readFileSync(join(repoRoot, "components", "AwbBarcodeScanner.tsx"), "utf8");
const productImageRoute = readFileSync(join(repoRoot, "app", "product-images", "[...path]", "route.ts"), "utf8");
const pickerPage = readFileSync(join(repoRoot, "app", "picker", "page.tsx"), "utf8");
const pickerDetailPage = readFileSync(join(repoRoot, "app", "picker", "[sku]", "page.tsx"), "utf8");
const packingPage = readFileSync(join(repoRoot, "app", "packing", "page.tsx"), "utf8");
const packingActions = readFileSync(join(repoRoot, "app", "packing", "actions.ts"), "utf8");
const packingSearchRoute = readFileSync(join(repoRoot, "app", "packing", "search", "route.ts"), "utf8");
const packingResultPage = readFileSync(join(repoRoot, "app", "packing", "[awb]", "page.tsx"), "utf8");
const reportsPage = readFileSync(join(repoRoot, "app", "reports", "page.tsx"), "utf8");
const reportsExportRoute = readFileSync(join(repoRoot, "app", "reports", "export", "route.ts"), "utf8");
const reportsHelper = readFileSync(join(repoRoot, "lib", "reports.ts"), "utf8");
const problemsPage = readFileSync(join(repoRoot, "app", "problems", "page.tsx"), "utf8");
const problemsActions = readFileSync(join(repoRoot, "app", "problems", "actions.ts"), "utf8");
const pickerActions = readFileSync(join(repoRoot, "app", "picker", "[sku]", "actions.ts"), "utf8");
const orderPickingService = readFileSync(join(repoRoot, "src", "lib", "workflow", "order-picking.ts"), "utf8");
const pickerDetailsRoute = readFileSync(join(repoRoot, "app", "picker", "details", "route.ts"), "utf8");
const dashboardPage = readFileSync(join(repoRoot, "app", "dashboard", "page.tsx"), "utf8");
const ownerPage = readFileSync(join(repoRoot, "app", "owner", "page.tsx"), "utf8");
const accountsPage = readFileSync(join(repoRoot, "app", "accounts", "page.tsx"), "utf8");
const accountActions = readFileSync(join(repoRoot, "app", "accounts", "actions.ts"), "utf8");
const ownerImportsPage = readFileSync(join(repoRoot, "app", "owner", "imports", "page.tsx"), "utf8");
const importJobProgressComponent = readFileSync(join(repoRoot, "components", "ImportJobProgress.tsx"), "utf8");
const importJobExportRoute = readFileSync(join(repoRoot, "app", "owner", "imports", "export", "route.ts"), "utf8");
const importJobRunnerSource = readFileSync(join(repoRoot, "src", "lib", "import-jobs", "runner.ts"), "utf8");
const importJobDetailPage = readFileSync(join(repoRoot, "app", "owner", "imports", "[jobId]", "page.tsx"), "utf8");
const importJobRetryActions = readFileSync(join(repoRoot, "app", "owner", "imports", "[jobId]", "actions.ts"), "utf8");
const importIssuesPage = readFileSync(join(repoRoot, "app", "owner", "imports", "[jobId]", "issues", "page.tsx"), "utf8");
const importIssuesExportRoute = readFileSync(join(repoRoot, "app", "owner", "imports", "[jobId]", "issues", "export", "route.ts"), "utf8");
const oldPendingPage = readFileSync(join(repoRoot, "app", "owner", "old-pending", "page.tsx"), "utf8");
const oldPendingActions = readFileSync(join(repoRoot, "app", "owner", "old-pending", "actions.ts"), "utf8");
const reviewPage = readFileSync(join(repoRoot, "app", "owner", "uploads", "[batchId]", "review", "page.tsx"), "utf8");
const workQueueSource = readFileSync(join(repoRoot, "lib", "operations", "work-queue.ts"), "utf8");
const ownerAccountsPage = readFileSync(join(repoRoot, "app", "owner", "accounts", "page.tsx"), "utf8");
const ownerAccountsActions = readFileSync(join(repoRoot, "app", "owner", "accounts", "actions.ts"), "utf8");
const skuExportRoute = readFileSync(join(repoRoot, "app", "owner", "sku-mappings", "export", "route.ts"), "utf8");
const skuMappingImportActions = readFileSync(join(repoRoot, "app", "owner", "sku-mappings", "import", "actions.ts"), "utf8");
const ownerUsersPage = readFileSync(join(repoRoot, "app", "owner", "users", "page.tsx"), "utf8");
const ownerUsersActions = readFileSync(join(repoRoot, "app", "owner", "users", "actions.ts"), "utf8");
const forgotPasswordPage = readFileSync(join(repoRoot, "app", "forgot-password", "page.tsx"), "utf8");
const forgotPasswordActions = readFileSync(join(repoRoot, "app", "forgot-password", "actions.ts"), "utf8");
const accountSelectionActions = readFileSync(join(repoRoot, "app", "accounts", "actions.ts"), "utf8");
const loginPage = readFileSync(join(repoRoot, "app", "login", "page.tsx"), "utf8");
const loginActions = readFileSync(join(repoRoot, "app", "login", "actions.ts"), "utf8");
const appShell = readFileSync(join(repoRoot, "components", "AppShell.tsx"), "utf8");
const dataHelpers = readFileSync(join(repoRoot, "lib", "data.ts"), "utf8");
const authHelpers = readFileSync(join(repoRoot, "lib", "auth.ts"), "utf8");
const changePasswordAction = readFileSync(join(repoRoot, "app", "change-password", "actions.ts"), "utf8");
const ownerSystemPage = readFileSync(join(repoRoot, "app", "owner", "system", "page.tsx"), "utf8");
const systemHealth = readFileSync(join(repoRoot, "lib", "system-health.ts"), "utf8");
const productionChecksSource = readFileSync(join(repoRoot, "lib", "production-checks.ts"), "utf8");
const networkSource = readFileSync(join(repoRoot, "lib", "network.ts"), "utf8");
const windowsProdPs1 = readFileSync(join(repoRoot, "scripts", "windows", "start-local-prod.ps1"), "utf8");
const windowsLauncher = readFileSync(join(repoRoot, "scripts", "windows", "start-local-prod.mjs"), "utf8");
const windowsEnvUtils = readFileSync(join(repoRoot, "scripts", "windows", "env-utils.mjs"), "utf8");
const windowsCheckEnv = readFileSync(join(repoRoot, "scripts", "windows", "check-env.mjs"), "utf8");
const windowsServerSetupDoc = readFileSync(join(repoRoot, "docs", "windows-server-setup.md"), "utf8");
const cloudflareSecurityDoc = readFileSync(join(repoRoot, "docs", "cloudflare-tunnel", "security-setup.md"), "utf8");
const manualSmokeTestDoc = readFileSync(join(repoRoot, "docs", "manual-smoke-test.md"), "utf8");
const mobileApiPlanDoc = readFileSync(join(repoRoot, "docs", "mobile-native-api-plan.md"), "utf8");
const mobileLocalConnectionDoc = readFileSync(join(repoRoot, "docs", "mobile-local-connection.md"), "utf8");
const localProdEnvExample = readFileSync(join(repoRoot, ".env.local.production.example"), "utf8");
const prodEnvExample = readFileSync(join(repoRoot, ".env.production.example"), "utf8");
const sqliteSchema = readFileSync(join(repoRoot, "prisma", "schema.prisma"), "utf8");
const postgresSchema = readFileSync(join(repoRoot, "prisma", "schema.postgres.prisma"), "utf8");
const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
const nextPhaseNotes = readFileSync(join(repoRoot, "NEXT_PHASE_NOTES.md"), "utf8");
const securityAudit = readFileSync(join(repoRoot, "SECURITY_AUDIT.md"), "utf8");
const mobileApiTypes = readFileSync(join(repoRoot, "src", "lib", "mobile-api", "types.ts"), "utf8");
const mobileApiHelper = readFileSync(join(repoRoot, "lib", "mobile-api.ts"), "utf8");
const mobileLoginRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "auth", "login", "route.ts"), "utf8");
const mobileLogoutRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "auth", "logout", "route.ts"), "utf8");
const mobileMeRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "me", "route.ts"), "utf8");
const mobilePickerGroupsRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "picker", "groups", "route.ts"), "utf8");
const mobilePickerPickedRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "picker", "mark-picked", "route.ts"), "utf8");
const mobilePickerProblemRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "picker", "problem", "route.ts"), "utf8");
const mobilePackingSearchRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "packing", "search", "route.ts"), "utf8");
const mobilePackingConfirmRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "packing", "confirm", "route.ts"), "utf8");
const mobilePackingProblemRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "packing", "problem", "route.ts"), "utf8");
const mobileProductImagesRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "products", "[sku]", "images", "route.ts"), "utf8");
const mobileProductDetailsRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "products", "[sku]", "details", "route.ts"), "utf8");
const mobileSyncStatusRoute = readFileSync(join(repoRoot, "app", "api", "mobile", "sync", "status", "route.ts"), "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Source includes ${start}`);
  assert.notEqual(endIndex, -1, `Source includes ${end}`);

  return source.slice(startIndex, endIndex);
}

const pickerListDataSource = sourceBetween(dataHelpers, "export async function getSkuGroups", "export async function getSkuDetail");
const packingSearchDataSource = sourceBetween(dataHelpers, "export async function searchOrdersByAwbFragment", "export async function getOrderWithImage");
const heavyListingFieldsPattern = /productHighlights|allSpecifications|description:\s*true/;
const mobileRouteBundle = [
  mobileLoginRoute,
  mobileLogoutRoute,
  mobileMeRoute,
  mobilePickerGroupsRoute,
  mobilePickerPickedRoute,
  mobilePickerProblemRoute,
  mobilePackingSearchRoute,
  mobilePackingConfirmRoute,
  mobilePackingProblemRoute,
  mobileProductImagesRoute,
  mobileProductDetailsRoute,
  mobileSyncStatusRoute
].join("\n");

assert.match(
  readme,
  /Free-first daily setup: Windows PC \+ Supabase \+ Cloudflare Tunnel/,
  "README documents the recommended free-first setup"
);
assert.match(readme, /Account-wise SKU image database/, "README documents account-wise SKU image mappings");
assert.match(readme, /Do not commit real Meesho PDFs/, "README warns against committing real PDFs");
assert.match(readme, /Vercel is [\s\S]*not recommended here for heavy PDF parsing/, "README marks Vercel as not recommended for heavy PDF parsing");
assert.match(readme, /SQLite requires a `file:` URL/, "README documents the Prisma provider mismatch rebuild fix");
assert.match(readme, /SESSION_COOKIE_SECURE=false/, "README documents local HTTP cookie mode");
assert.match(readme, /Meesho image URLs are external/, "README documents external image URL reliability");
assert.match(readme, /You only need SKU \+ image URL/, "README documents simple SKU image import");
assert.match(readme, /storage\/product-images\/meesho\/<accountId>\/<safeSku>/, "README documents local image cache storage");
assert.match(readme, /start-meesho-app\.bat/, "README documents the double-click Windows launcher");
assert.match(readme, /Body exceeded 1 MB limit/, "README documents the large PDF Server Action limit fix");
assert.match(readme, /check:production-readiness/, "README documents the production readiness check");
assert.match(readme, /Back up `.env` securely/, "README documents secure env backup");
assert.match(windowsServerSetupDoc, /Workers do not need the code/, "Windows setup doc explains workers use browser only");
assert.match(cloudflareSecurityDoc, /does not require opening router ports|without opening router ports/, "Cloudflare safety doc explains no router ports");
assert.match(cloudflareSecurityDoc, /SESSION_COOKIE_SECURE=true/, "Cloudflare safety doc documents HTTPS cookie mode");
assert.match(manualSmokeTestDoc, /duplicate PDF upload|Repeated Imports/i, "Manual smoke test covers duplicate PDF upload");
assert.match(manualSmokeTestDoc, /create a second Meesho account/i, "Manual smoke test covers second account creation");
assert.match(packageJsonText, /check:production-readiness/, "Package scripts include production readiness check");
assert.match(middlewareSource, /PUBLIC_PATHS[\s\S]*"\/forgot-password"/, "Forgot password remains a public route in middleware");
assert.match(middlewareSource, /getSafeClientIp[\s\S]*shouldTrustProxyHeaders/, "Middleware uses trusted-proxy-aware client IP detection");
assert.match(networkSource, /TRUST_PROXY_HEADERS/, "Forwarded headers are trusted only when explicitly configured");
assert.match(networkSource, /if \(!normalized\) \{[\s\S]*return false;/, "LOCAL_NETWORK_ONLY fails closed when client IP is unavailable");
assert.match(nextConfig, /bodySizeLimit:\s*"100mb"/, "Next config allows large local Meesho PDF uploads");
assert.match(nextConfig, /X-Frame-Options[\s\S]*DENY/, "Next config sets frame protection header");
assert.match(nextConfig, /X-Content-Type-Options[\s\S]*nosniff/, "Next config sets content-type sniffing protection");
assert.match(nextConfig, /Content-Security-Policy[\s\S]*frame-ancestors 'none'/, "Next config sets basic CSP frame protections");
assert.equal(buildScript.indexOf('import "dotenv/config";') < buildScript.indexOf("process.env.DATABASE_URL"), true, "Build loads .env before choosing Prisma schema");
assert.match(startScript, /check-production-readiness\.mjs/, "Startup runs production readiness preflight");
assert.match(readinessScript, /AUTO_APPLY_MIGRATIONS/, "Production readiness check supports automatic migration apply opt-in");
assert.match(readinessScript, /prisma", "migrate", "status"/, "Production readiness check verifies migration status");
assert.match(readinessScript, /\$queryRaw`SELECT 1`/, "Production readiness check pings the database");
assert.equal(pdfExtractor.includes(".next/server/chunks/pdf.worker.mjs"), false, "PDF extraction does not reference Next server worker chunks");
assert.match(pdfExtractor, /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/, "PDF extraction preloads the PDF.js worker module explicitly");
assert.match(pdfExtractor, /PDF text extraction failed before pages could be read\./, "PDF extraction reports startup failures before page reads");
assert.match(uploadLimits, /PDF_UPLOAD_MAX_BYTES\s*=\s*100 \* 1024 \* 1024/, "Upload action has a 100 MB friendly file-size guard");
assert.match(uploadLimits, /FLIPKART_IMPORT_MAX_BYTES\s*=\s*100 \* 1024 \* 1024/, "Flipkart imports have a max file-size guard");
assert.match(uploadActions, /error=too-large/, "Upload action redirects to friendly too-large PDF error");
assert.match(uploadActions, /isUploadTooLarge\(file, FLIPKART_IMPORT_MAX_BYTES\)/, "Flipkart order import checks file size before retaining");
assert.match(skuMappingImportActions, /isUploadTooLarge\(file, FLIPKART_IMPORT_MAX_BYTES\)/, "Flipkart Listing Master import checks file size before retaining");
assert.match(uploadActions, /ownerUploadAccount/, "Upload actions use the chosen seller account instead of a stale account cookie");
assert.match(uploadActions, /revalidatePath\("\/dashboard"\)/, "Upload actions refresh the dashboard route after imports");
assert.match(uploadActions, /selectPreviewRowsForImport/, "Confirm import uses centralized label-over-manifest source selection");
assert.match(importPreview, /rows\.some\(\(row\) => row\.sourceType === "LABEL"\)[\s\S]*"MANIFEST_ORDER"/, "Preview import source prefers labels over manifest rows");
assert.match(importPreview, /seenAwbs\.has/, "Confirm import skips duplicate AWB rows inside one preview batch");
assert.match(importOrders, /heldRows/, "Order import stats include held-for-review rows");
assert.match(reviewPage, /Held for review/, "Import result shows held-for-review count");
assert.match(dashboardPage, /requireUser\(\["OWNER"\]\)/, "Dashboard route remains owner-only");
assert.match(dashboardPage, /getDashboardStats/, "Dashboard route exists and uses lightweight dashboard data");
assert.match(dashboardPage, /Selected company \/ seller account/, "Dashboard shows selected company and account context");
assert.match(dashboardPage, /account\.marketplace/, "Dashboard shows selected marketplace context");
assert.match(dashboardPage, /Import orders[\s\S]*Import listing master[\s\S]*Open picker[\s\S]*Open packer/, "Dashboard exposes fast account-scoped quick actions");
assert.match(ownerPage, /redirect\("\/dashboard"\)/, "Legacy /owner route redirects to /dashboard");
assert.match(uploadPage, /MarketplaceImportWizard/, "Upload page delegates marketplace/account filtering to the import wizard");
assert.match(marketplaceImportWizardComponent, /Choose marketplace and seller account first\. Imports are saved under that account\./, "Upload wizard explains marketplace/account scoping");
assert.match(marketplaceImportWizardComponent, /Flipkart Listing Master/, "Upload wizard offers Flipkart Listing Master import");
assert.match(marketplaceImportWizardComponent, /Flipkart Daily Orders/, "Upload wizard offers Flipkart Daily Orders import");
assert.match(marketplaceImportWizardComponent, /Upload this only when new products are listed or title, price, image, or listing status changes/, "Upload wizard explains Listing Master timing");
assert.match(marketplaceImportWizardComponent, /Daily workers upload this order file/, "Upload wizard explains daily order import workflow");
assert.match(marketplaceImportWizardComponent, /accounts\.filter\(\(account\) => account\.active && account\.marketplace === marketplace\)/, "Upload wizard filters accounts by selected marketplace");
assert.match(marketplaceImportWizardComponent, /marketplace === "FLIPKART"[\s\S]*Flipkart Listing Master[\s\S]*Flipkart Daily Orders/, "Flipkart import types appear only under Flipkart");
assert.match(marketplaceImportWizardComponent, /marketplace === "MEESHO"[\s\S]*Advanced \/ Legacy imports[\s\S]*Legacy PDF parser for old Meesho label\/manifest workflow/, "Meesho legacy PDF import appears only under Meesho legacy");
assert.match(marketplaceImportWizardComponent, /Amazon Product Inventory Refresh/, "Amazon Product Inventory Refresh is enabled in the marketplace wizard");
assert.match(ownerImportsPage, /IMPORT_JOB_PAGE_SIZES\.map/, "Import Progress page exposes configured page size choices");
assert.match(ownerImportsPage, /Showing \{compactNumber\(window\.from\)\}-\{compactNumber\(window\.to\)\} of \{compactNumber\(totalRows\)\}/, "Import Progress page shows pagination range");
assert.match(ownerImportsPage, /Previous[\s\S]*Next/, "Import Progress page includes previous and next pagination controls");
assert.match(ownerImportsPage, /name="marketplace"[\s\S]*name="importType"[\s\S]*name="status"/, "Import Progress page filters by marketplace, import type, and status");
assert.match(ownerImportsPage, /name="q"[\s\S]*File name or job ID/, "Import Progress page supports file/job search");
assert.match(ownerImportsPage, /Open progress[\s\S]*Open review[\s\S]*CSV[\s\S]*XLSX[\s\S]*TXT/, "Import Progress table includes progress, review, and download actions");
assert.match(ownerImportsPage, /View issues/, "Import Progress table links to issue drill-down when rows need review");
assert.match(importJobExportRoute, /jobId[\s\S]*summary[\s\S]*issues/, "Import job export route supports summary and issue exports");
assert.match(importJobExportRoute, /ExcelJS/, "Import job export route supports XLSX downloads");
assert.match(importJobExportRoute, /safeSpreadsheetValue/, "Import job XLSX/TXT exports neutralize formula-like values");
assert.match(importJobExportRoute, /safeImportIssueContext/, "Import job issue exports derive safe SKU and masked operational keys");
assert.doesNotMatch(sourceBetween(importJobExportRoute, "const headers = [\"rowNumber\"", "return responseFor(format, headers, rows, filenameBase);"), /rawData["']?\s*,/, "Import job issue export headers exclude private raw row data");
assert.match(importJobDetailPage, /retainedImportJobFileExists/, "Import job detail checks retained source file availability before retry");
assert.match(importJobRetryActions, /retainedImportJobFileExists[\s\S]*createRetryImportJob[\s\S]*startImportJob/, "Retry action starts a safe new job only when the retained file exists");
assert.match(importJobRunnerSource, /IMPORT_JOB_STORAGE_DIR[\s\S]*storage", "import-jobs"/, "Import jobs retain uploaded files in private import-job storage");
assert.match(importJobRunnerSource, /isRetainedImportJobFilePath[\s\S]*resolvedStorage[\s\S]*startsWith/, "Retry only accepts source files inside retained import-job storage");
assert.match(importIssuesPage, /Row issue drill-down/, "Import issues page exists");
assert.match(importIssuesPage, /IMPORT_ISSUE_PAGE_SIZES[\s\S]*issueType[\s\S]*row[\s\S]*sku/, "Import issues page has page-size, issue type, row, and SKU filters");
assert.match(importIssuesPage, /safeImportIssueContext/, "Import issues page uses safe issue context extraction");
assert.doesNotMatch(importIssuesPage, /Address Line|Buyer name|Ship to name/, "Import issues page does not render private customer fields");
assert.match(importIssuesExportRoute, /safeImportIssueContext/, "Filtered import issue export uses safe context extraction");
assert.match(importIssuesExportRoute, /safeSpreadsheetValue/, "Filtered import issue XLSX/TXT exports neutralize formula-like values");
assert.doesNotMatch(importIssuesExportRoute, /Address Line|Buyer name|Ship to name/, "Filtered import issue export does not include private customer fields");
assert.match(importJobProgressComponent, /importJobEstimatedRemainingSeconds/, "Import job detail shows estimated remaining time");
assert.match(importJobProgressComponent, /Live progress refreshes every 1\.5 seconds/, "Import job detail explains polling cadence");
assert.match(importJobProgressComponent, /Summary CSV[\s\S]*Summary XLSX[\s\S]*Summary TXT/, "Import job detail exposes safe summary exports");
assert.match(pickerPage, /Large images/, "Picker page keeps a large-image mobile toggle");
assert.match(pickerPage, /Load more/, "Picker page supports load-more pagination");
assert.match(pickerPage, /Compact/, "Picker page supports compact mode");
assert.match(pickerPage, /data-mobile-picker-filter-pills/, "Picker filters become compact horizontal pills on mobile");
assert.match(pickerPage, /data-mobile-picker-one-column/, "Picker cards explicitly use one mobile column");
assert.match(pickerPage, /Upload today&apos;s orders[\s\S]*View old pending/, "Picker empty state has compact practical actions");
assert.match(pickerPage, /PickerProductCard/, "Picker page renders worker cards through the client card component");
assert.match(pickerListDataSource, /imageUrl1:\s*true[\s\S]*imageUrl10:\s*true[\s\S]*image1366Url1:\s*true/, "Picker card query includes listing image URLs for gallery");
assert.doesNotMatch(pickerListDataSource, heavyListingFieldsPattern, "Picker list query keeps heavy listing description/spec/gallery fields out of card payloads");
assert.match(pickerProductCardComponent, /ProductImageGallery/, "Picker card image area opens the image gallery");
assert.match(pickerProductCardComponent, /showInlineThumbnails={false}/, "Picker card keeps the top image area square without inline thumbnail rows");
assert.match(pickerProductCardComponent, /data-card-actions="3"/, "Picker card keeps worker actions under the four-button maximum");
assert.match(pickerProductCardComponent, /data-mobile-worker-actions/, "Picker card uses thumb-friendly mobile worker actions");
assert.match(pickerProductCardComponent, /Details[\s\S]*ProductDetailsDrawer/, "Picker card separates Details from the image gallery");
assert.doesNotMatch(pickerProductCardComponent, /href=.*picker\/\$\{/, "Picker card image/details controls do not navigate to the SKU page");
assert.match(productDetailsDrawerComponent, /fetch\(detailsUrl/, "Product details drawer fetches heavy detail data only after opening");
assert.match(pickerDetailsRoute, /getSkuDetail/, "Picker details drawer route reuses the full SKU detail query");
assert.match(pickerProductCardComponent, /window\.location\.assign[\s\S]*\/picker\//, "Picker card opens the explicit post-pick route chooser");
assert.match(pickerActions, /completePickWithNextRoute/, "Picker route action uses the authoritative route service");
assert.match(pickerActions, /markSkuGroupProblemInlineAction[\s\S]*return \{ ok: true, affectedOrders: orders\.length/, "Direct picker problem action returns problem result without redirecting");
assert.match(pickerDetailPage, /fixed inset-x-0 bottom-0/, "Picker detail has mobile sticky bottom actions");
assert.match(pickerDetailPage, /mapping\?\.cachedImageUrl/, "Picker detail uses cached image URL first");
assert.match(pickerDetailPage, /ProductImageGallery/, "Picker detail opens the product image gallery");
assert.match(packingPage, /<AwbBarcodeScanner[\s\S]*Packed today/, "Packing page places the scanner before lower-priority dashboard details");
assert.doesNotMatch(packingPage, /recentScans/, "Packing page does not wait on recent scan logs before showing scanner");
assert.match(packingResultPage, /Quantity to pack/, "Packing result makes quantity prominent on mobile");
assert.match(packingResultPage, /fixed inset-x-0 bottom-0/, "Packing result has mobile sticky confirm actions");
assert.match(packingResultPage, /mapping\?\.cachedImageUrl/, "Packing card uses cached image URL first");
assert.match(packingResultPage, /ProductImageGallery/, "Packing result opens the product image gallery");
assert.match(packingResultPage, /<details[\s\S]*Listing details/, "Packing result keeps heavy listing text collapsed by default");
assert.match(packingResultPage, /sticky top-24[\s\S]*Scan next AWB/, "Packing detail keeps desktop action bar sticky and visible");
assert.match(packingResultPage, /id="problem"/, "Packing detail exposes a problem anchor for search-card Problem links");
assert.match(reviewPage, /<details[\s\S]*Picklist SKU summary rows/, "Upload review makes picklist summary rows collapsible");
assert.match(reviewPage, /Prepare today&apos;s product images/, "Upload review exposes daily image cache preparation");
assert.match(reviewPage, /Missing image mappings/, "Upload review shows inline missing image mapping repair");
assert.match(reviewPage, /Save \+ cache/, "Upload review can save and immediately cache a missing SKU image");
assert.match(reviewPage, /Fix missing image URLs first/, "Upload review tells the owner to fix missing image URLs before image prep");
assert.match(uploadActions, /repairMissingSkuImageMappingAction/, "Upload review has a dedicated missing SKU image repair action");
assert.match(uploadActions, /accountId_sku[\s\S]*accountId: account\.id/, "Missing image repair creates or updates mappings in the selected account only");
assert.match(uploadActions, /cacheQueueMapping\(mapping\)/, "Save and cache calls the image cache pipeline");
assert.match(uploadActions, /clearMissingImageIssuesForSku/, "Missing image repair clears the batch preview missing-image status");
assert.match(awbScannerComponent, /primarySrc={suggestion.cachedImageUrl}/, "Manual AWB suggestions use cached signed image URL first");
assert.match(awbScannerComponent, /cacheStatus={suggestion.cacheStatus}/, "Manual AWB suggestions pass cached image status");
assert.match(awbScannerComponent, /manualAwbRef\.current\?\.focus/, "Packing screen focuses the scan input immediately");
assert.equal(
  awbScannerComponent.indexOf("data-mobile-manual-search") < awbScannerComponent.indexOf("data-mobile-scanner-panel"),
  true,
  "Packing mobile puts manual Tracking ID search before the scanner"
);
assert.match(awbScannerComponent, /<details open[\s\S]*data-mobile-scanner-panel/, "Packing scanner is secondary and collapsible");
assert.match(awbScannerComponent, /<Link[\s\S]*prefetch/, "Packing search suggestions prefetch scan-result pages");
assert.match(awbScannerComponent, /directPackAction/, "AWB scanner accepts a direct Pack server action");
assert.match(awbScannerComponent, /await import\("@zxing\/browser"\)/, "Browser barcode engine loads only when the browser scanner starts");
assert.match(awbScannerComponent, /Pack now[\s\S]*Details[\s\S]*Problem/, "Packing search result cards expose Pack, Details, and Problem actions");
assert.match(awbScannerComponent, /ProductImageGallery/, "Packing search result image opens gallery instead of navigating");
assert.match(awbScannerComponent, /shouldAcceptScannerValue/, "Scanner has duplicate scan debounce helper");
assert.match(awbScannerComponent, /playScannerSuccessFeedback[\s\S]*vibrate[\s\S]*AudioContext/, "Scanner success can trigger vibration and beep safely");
assert.match(awbScannerComponent, /permission-denied[\s\S]*unsupported/, "Scanner exposes clear permission and unsupported states");
assert.match(awbScannerComponent, /opening/, "Scanner exposes an opening-result state");
assert.match(packingSearchRoute, /cachedImageUrl/, "AWB suggestion API returns cachedImageUrl only for product images");
assert.match(packingSearchRoute, /id: order\.id[\s\S]*marketplace: order\.marketplace[\s\S]*accountName/, "AWB suggestion API returns compact metadata needed by result cards");
assert.doesNotMatch(packingSearchRoute, /imageUrl: order\.imageUrl/, "AWB suggestion API does not return slow external image URLs");
assert.match(reportsPage, /name="from"[\s\S]*name="to"/, "Reports page supports date filters");
assert.match(reportsPage, /name="accountId"[\s\S]*name="marketplace"/, "Reports page supports account and marketplace filters");
assert.match(reportsPage, /name="status"[\s\S]*missing-listing[\s\S]*missing-image/, "Reports page supports status and current missing filters");
assert.match(reportsPage, /Current now vs at import time/, "Reports page labels current vs import-time status clearly");
assert.match(reportsPage, /Old pending review/, "Reports page links old pending review");
assert.match(reportsPage, /Previous[\s\S]*Next/, "Reports order rows are paginated");
assert.match(reportsHelper, /marketplaceListing\.findMany/, "Reports recalculate current missing status from Listing Master");
assert.match(reportsHelper, /missingListingOrders = currentScopeOrders\.filter/, "Reports compute current missing listing rows from current listings");
assert.match(reportsHelper, /!listing\.mainImageUrl/, "Reports compute current missing image rows from current listing image URL");
assert.match(reportsHelper, /importJob\.aggregate[\s\S]*missingListingRows[\s\S]*missingImageRows/, "Reports keep import-time warning counters separate");
assert.match(reportsHelper, /REPORT_PAGE_SIZE = 25[\s\S]*REPORT_EXPORT_LIMIT = 5000/, "Report queries are paginated and export-limited");
assert.match(reportsExportRoute, /reportExportTypes/, "Report export route validates export types");
assert.match(reportsExportRoute, /\"csv\", \"xlsx\", \"txt\"/, "Report exports support CSV, XLSX, and TXT");
assert.match(reportsExportRoute, /maskReportTrackingKey/, "Report exports mask tracking keys");
assert.match(reportsExportRoute, /safeSpreadsheetValue/, "Report XLSX/TXT exports neutralize formula-like values");
assert.doesNotMatch(reportsExportRoute, /Address Line|Buyer name|phone|rawData/i, "Report exports avoid private raw customer data");
assert.match(problemsPage, /Open \(\{countByStatus\.get\("OPEN"\)/, "Problems page has an open tab");
assert.match(problemsPage, /Resolved \(\{countByStatus\.get\("RESOLVED"\)/, "Problems page has a resolved tab");
assert.match(problemsPage, /name="accountId"[\s\S]*name="marketplace"[\s\S]*name="sku"[\s\S]*name="reason"[\s\S]*name="reporter"/, "Problems page supports account, marketplace, SKU, reason, and reporter filters");
assert.match(problemsPage, /status: tab === "resolved" \? "RESOLVED" : "OPEN"/, "Resolved problems disappear from the open problem query");
assert.match(problemsPage, /name="resolutionNote"/, "Problem resolution accepts a note");
assert.match(problemsPage, /name="returnToReady"[\s\S]*Mark order back to ready/, "Problem return-to-ready is explicit");
assert.match(problemsActions, /requireUser\(\["OWNER"\]\)/, "Problem resolution actions are owner-only");
assert.match(problemsActions, /resolutionNote: resolutionNote \|\| null/, "Problem resolution stores resolution note");
assert.match(problemsActions, /recordAuditLog[\s\S]*PROBLEM_ORDER_RESOLVED/, "Resolving a problem creates an audit log");
assert.match(problemsActions, /returnToReady[\s\S]*status: "READY"[\s\S]*pickStatus: "READY"[\s\S]*packStatus: "READY"/, "Problem resolution returns to ready only when explicit");
assert.match(problemsActions, /PROBLEM_ORDER_KEPT_OPEN/, "Keeping a problem open is audited");
assert.match(dataHelpers, /awb: query[\s\S]*endsWith: query[\s\S]*contains: query/, "AWB search queries exact, suffix, then contains");
assert.match(dataHelpers, /packStatus: "READY"[\s\S]*OR: \[\{ awb: query \}, \{ trackingId: query \}\]/, "Packing AWB search defaults to active READY orders and checks Tracking ID");
assert.doesNotMatch(packingSearchDataSource, heavyListingFieldsPattern, "Packing search returns compact listing data without heavy descriptions/specs/gallery fields");
assert.match(packingSearchDataSource, /OR: \[\{ awb: query \}, \{ trackingId: query \}\][\s\S]*endsWith: query[\s\S]*contains: query/, "Packing search checks exact Tracking ID/AWB before suffix and contains fallback");
assert.match(dataHelpers, /withDevTiming\("packing awb search"[\s\S]*500\)/, "AWB search has 500ms dev timing logs");
assert.match(dataHelpers, /withDevTiming\("picker orders"[\s\S]*800[\s\S]*\);/, "Picker order query has 800ms dev timing logs");
assert.match(dataHelpers, /buildWorkQueueOrderWhere/, "Picker queries are scoped through the daily active work queue");
assert.match(workQueueSource, /importedAt: \{ gte: startOfToday \}/, "Today work queue filters by today's imported orders");
assert.match(workQueueSource, /importedAt: \{ lt: startOfToday \}/, "Old pending work queue separates older READY orders");
assert.match(pickerPage, /Current batch/, "Picker exposes a current-batch work queue chip");
assert.match(pickerPage, /All pending/, "Picker exposes all-pending work queue chip");
assert.match(pickerPage, /Old pending review/, "Picker links owners to the old pending review queue");
assert.match(packingPage, /Today ready[\s\S]*Old pending[\s\S]*Problems/, "Packing dashboard separates today, old pending, and problem counts");
assert.match(packingPage, /Move old pending to review/, "Owner can move old pending work into a review-only flow");
assert.match(packingPage, /directPackFromSearchAction/, "Packing page wires direct Pack action into search suggestions");
assert.match(packingActions, /writeScanLogLater[\s\S]*redirect\(`\/packing\/\$\{encodeURIComponent\(matchedOrder\.awb\)\}`\)/, "Packing search redirects before scan logging can block order opening");
assert.match(packingActions, /directPackFromSearchAction[\s\S]*packCustomerOrderShipmentSafely/, "Direct Pack uses the shared safe shipment service");
assert.doesNotMatch(packingActions, /buildConfirmPackedOrderWhere/, "Direct Pack cannot use the legacy shipment mutation helper");
assert.match(packingActions, /oldPendingReviewStatus: "IN_REVIEW"/, "Old pending review action creates a durable review state");
assert.match(packingActions, /OLD_PENDING_REVIEW_CREATED/, "Old pending review queue creation is audited");
assert.match(packingActions, /redirect\(`\/owner\/old-pending\?moved=\$\{oldPendingCount\}`\)/, "Old pending move action opens the review queue");
assert.match(oldPendingPage, /Old pending orders remain in history and reports/, "Old pending page explains the workflow");
assert.match(oldPendingPage, /Keep pending[\s\S]*Carry forward[\s\S]*Archive from today[\s\S]*Move to problem/, "Old pending page exposes owner review actions");
assert.doesNotMatch(oldPendingPage, /Buyer name|Address Line|phone/i, "Old pending page avoids private customer fields");
assert.match(oldPendingActions, /oldPendingReviewStatus: reviewStatus/, "Old pending action updates review state");
assert.match(oldPendingActions, /status: "PROBLEM"[\s\S]*pickStatus: "PROBLEM"[\s\S]*packStatus: "PROBLEM"/, "Old pending move-to-problem updates order state");
assert.match(oldPendingActions, /problemOrder\.create/, "Old pending move-to-problem creates an open problem when needed");
assert.match(productImageRoute, /getCurrentUser/, "Cached image route checks session without login redirect");
assert.match(productImageRoute, /verifySignedCachedImageUrl/, "Cached image route verifies signed image URLs");
assert.equal(productImageRoute.indexOf("verifySignedCachedImageUrl") < productImageRoute.indexOf("const user = await getCurrentUser"), true, "Signed cached image route avoids database auth before serving normal image requests");
assert.match(productImageRoute, /status: 401/, "Cached image route returns 401 for unauthenticated image requests");
assert.match(productImageRoute, /canUserAccessCachedImage/, "Cached image route enforces account access");
assert.match(skuExportRoute, /cache_status/, "Full SKU export includes cache status");
assert.match(skuExportRoute, /product_name[\s\S]*color[\s\S]*size/, "Full SKU export includes auto-filled metadata");
assert.match(skuExportRoute, /safeSpreadsheetValue/, "SKU mapping XLSX exports neutralize formula-like values");
assert.match(appShell, /\{ href: "\/dashboard", label: "Dashboard" \}/, "Owner navigation uses /dashboard as the dashboard link");
assert.match(appShell, /hasWorkPermission\(user, "canPick"\)[\s\S]*href: "\/picker"/, "Picker navigation derives from permission with legacy role fallback");
assert.match(appShell, /hasWorkPermission\(user, "canPack"\)[\s\S]*href: "\/packing"/, "Packing navigation derives from permission with legacy role fallback");
assert.match(appShell, /function linksForUser[\s\S]*if \(user\.role === "OWNER"\)[\s\S]*return ownerLinks[\s\S]*hasWorkPermission/, "Owner management links remain separate while workers may combine operational permissions");
assert.match(appNavComponent, /usePathname/, "Top navigation can style the active route");
assert.match(appNavComponent, /prefetch/, "Top navigation prefetches common route links");
assert.match(appNavComponent, /data-mobile-bottom-nav/, "Mobile bottom navigation exists");
assert.match(appNavComponent, /hidden[\s\S]*sm:flex[\s\S]*data-desktop-nav/, "Desktop nav is hidden on small screens");
assert.match(appShell, /\/owner\/accounts/, "Owner navigation includes account management");
assert.match(appShell, /MobileBottomNav/, "App shell renders mobile bottom navigation for workers");
assert.match(appShell, /data-owner-mobile-menu/, "Owner mobile navigation is tucked behind a compact menu");
assert.match(appShell, /account\.companyName[\s\S]*account\.marketplace/, "App shell shows selected company and marketplace context");
assert.match(accountsPage, /AccountSwitcherForm/, "Account switch page uses the grouped marketplace switcher");
assert.match(accountsPage, /user\.role === "OWNER"[\s\S]*No seller accounts have been created yet\.[\s\S]*Create First Seller Account/, "Owner with zero accounts sees the first-account setup action");
assert.match(accountsPage, /No active seller account is assigned to this user\. Ask the owner to assign an account\./, "Worker with zero assignments keeps the owner-assignment guidance");
assert.match(accountSwitcherComponent, /Search accounts/, "Switch account UX is searchable");
assert.match(accountSwitcherComponent, /marketplaceLabels/, "Switch account UX groups accounts by marketplace");
assert.match(accountActions, /active: true/, "Switch account action only selects active accounts");
assert.match(authHelpers, /where: \{\s*active: true\s*\}/, "Owner account switcher lists active accounts only");
assert.match(ownerAccountsPage, /Company \/ Organization/, "Owner accounts page shows company summary");
assert.match(ownerAccountsPage, /Marketplace accounts/, "Owner accounts page uses marketplace account language");
assert.match(ownerAccountsPage, /Flipkart[\s\S]*Amazon[\s\S]*Meesho legacy[\s\S]*Other/, "Owner accounts page shows marketplace sections");
assert.match(ownerAccountsPage, /Create seller account/, "Owner accounts page supports marketplace-aware account creation");
assert.match(ownerAccountsPage, /<AppShell allowNoAccount>/, "Owner can open account management without a selected account");
assert.doesNotMatch(ownerAccountsPage, /requireAccount/, "Owner account management does not require an existing account");
assert.match(ownerAccountsPage, /name="marketplace"/, "Owner account form requires marketplace");
assert.match(ownerAccountsPage, /accountDisplayName/, "Owner account form captures account display name");
assert.match(ownerAccountsPage, /accountCode/, "Owner account form captures account code");
assert.match(ownerAccountsPage, /marketplaceListings/, "Owner accounts page shows listing master counts");
assert.match(ownerAccountsPage, /importJobs/, "Owner accounts page shows import counts");
assert.match(ownerAccountsPage, /Deactivate|Reactivate/, "Owner accounts page supports activate/deactivate controls");
assert.match(ownerAccountsActions, /OWNER_ACCOUNT_CREATED/, "Owner account creation is audited");
assert.match(ownerAccountsActions, /isNewAccount && account\.active[\s\S]*accountId: account\.id[\s\S]*setSelectedAccount\(account\.id\)/, "A newly created active account is selected for the owner without a new login");
assert.match(ownerAccountsActions, /marketplace: accountInput\.marketplace/, "Owner account action stores marketplace");
assert.match(ownerAccountsActions, /accountDisplayName: accountName/, "Owner account action stores display name");
assert.match(ownerAccountsActions, /OWNER_ACCOUNT_DEACTIVATED/, "Owner account deactivation is audited");
assert.match(ownerUsersPage, /Passwords are securely hashed and cannot be viewed/, "Owner users page explains passwords cannot be viewed");
assert.match(ownerUsersPage, /Search users[\s\S]*Role[\s\S]*Assigned account/, "Owner users page has search, role, and account assignment filters");
assert.match(ownerUsersPage, /Password reset requests/, "Owner users page shows password reset requests");
assert.match(ownerUsersPage, /AccountChecklist/, "Owner users page uses grouped marketplace account assignment");
assert.match(ownerUsersPage, /Assigned accounts:/, "Owner users page shows assigned accounts clearly");
assert.match(ownerUsersPage, /Force password change on next login/, "Owner password reset can force next-login password change");
assert.match(ownerUsersActions, /passwordHash: hashPassword\(password\)/, "Owner password reset stores only a password hash");
assert.match(ownerUsersActions, /userDeviceSession\.updateMany/, "Owner password reset closes active sessions for workers");
assert.match(ownerUsersActions, /OWNER_PASSWORD_RESET/, "Owner password reset is audited");
assert.match(ownerUsersActions, /OWNER_USER_UNLOCKED/, "Owner unlock is audited");
assert.match(ownerUsersActions, /assignedAccounts: \{[\s\S]*connect:/, "Owner user creation assigns marketplace accounts");
assert.match(ownerUsersActions, /assignedAccounts: \{[\s\S]*set:/, "Owner user edit updates assigned marketplace accounts");
assert.match(ownerUsersActions, /role !== "OWNER" && active && uniqueAccountIds\.length === 0/, "Active picker/packer users require at least one account assignment");
assert.match(ownerUsersActions, /assertCanLeaveOwnerRole/, "Owner cannot remove the last active owner");
assert.match(ownerUsersActions, /passwordResetRequest\.updateMany/, "Owner reset can mark a password reset request handled");
assert.match(ownerUsersActions, /markPasswordResetRequestHandledAction/, "Owner can mark reset requests handled without deleting history");
assert.match(forgotPasswordPage, /Request owner reset/, "Forgot password page lets workers request owner reset");
assert.match(forgotPasswordPage, /If that username can be reviewed/, "Forgot password page avoids username existence disclosure");
assert.match(forgotPasswordActions, /normalizeUsername/, "Forgot password action normalizes usernames");
assert.match(forgotPasswordActions, /passwordResetRequest\.create/, "Forgot password action creates a reset request");
assert.match(forgotPasswordActions, /redirect\("\/forgot-password\?sent=1"\)/, "Forgot password action returns the same public confirmation");
assert.doesNotMatch(forgotPasswordActions, /invalid_credentials|not-found|unknown user/i, "Forgot password action does not reveal username existence");
assert.match(loginPage, /Forgot password\?/, "Login page links to password reset request flow");
assert.doesNotMatch(loginPage, /Seed users|demo1234/, "Login page does not publicly expose demo credentials");
assert.match(loginPage, /SHOW_DEV_LOGIN_HINTS/, "Any login hint is gated behind explicit local development opt-in");
assert.doesNotMatch(loginPage, /Account inactive|Too many failed attempts/, "Login page does not reveal inactive or locked account state");
assert.match(loginActions, /passwordHashNeedsUpgrade[\s\S]*hashPassword\(parsed\.data\.password\)/, "Web login upgrades legacy password hashes after successful login");
assert.match(loginActions, /metadata: \{ reason: "inactive"/, "Web login still audits inactive login internally");
assert.doesNotMatch(sourceBetween(loginActions, 'if (loginCheck === "inactive")', 'if (loginCheck === "invalid_credentials")'), /loginRedirectForResult/, "Web login does not publicly redirect to inactive or locked reasons");
assert.match(mobileLoginRoute, /passwordHashNeedsUpgrade[\s\S]*hashPassword\(parsed\.data\.password\)/, "Mobile login upgrades legacy password hashes after successful login");
assert.doesNotMatch(mobileLoginRoute, /inactive_user|Too many failed attempts|This user is inactive/, "Mobile login does not reveal inactive or locked account state");
assert.match(mobileApiHelper, /getSafeClientIp[\s\S]*shouldTrustProxyHeaders/, "Mobile API rate limit metadata uses the safe client IP helper");
assert.match(accountSelectionActions, /assignedUsers/, "Worker account switch checks assigned accounts");
assert.match(accountSelectionActions, /user\.role === "OWNER"[\s\S]*users:[\s\S]*assignedUsers:/, "Account selection allows owners while requiring a worker assignment server-side");
assert.match(authHelpers, /assignedUsers/, "Auth available-account helper includes assigned accounts");
assert.match(windowsLauncher + windowsEnvUtils, /dotenv/, "Windows launcher loads .env with dotenv");
assert.match(windowsLauncher, /SKIP_PRISMA_MIGRATE/, "Windows launcher defaults migration skip for local production");
assert.match(windowsCheckEnv, /printEnvironmentSummary/, "check-env prints a masked environment summary");
assert.match(productImageComponent, /decoding="async"/, "Product images decode asynchronously");
assert.match(productImageComponent, /state !== "loading" && state !== "retrying"[\s\S]*!isExternalSrc/, "ProductImage bounds retries only for external loading states");
assert.match(productImageComponent, /aspect-square w-full/, "Large product image areas stay square");
assert.match(productImageComponent, /object-contain/, "Product images fit without cropping");
assert.match(productImageComponent, /Use Listing Master or cache today's images/, "Product cards show a clean missing-image fallback");
assert.match(productImageComponent, /Retry image/, "Image fallback includes a manual client retry button");
assert.match(productImageComponent, /imageHealth === "BROKEN" \|\| manualCheck/, "Successful image loads only update health when repairing or manually checking a mapping");
assert.match(productImageGalleryComponent, /role="dialog"/, "Product image gallery opens as an accessible dialog");
assert.match(productImageGalleryComponent, /data-mobile-product-gallery/, "Product gallery has mobile-specific modal structure");
assert.match(productImageGalleryComponent, /data-mobile-gallery-thumbnails/, "Product gallery uses horizontal mobile thumbnails");
assert.match(productImageGalleryComponent, /lg:grid-cols-\[minmax\(0,1fr\)_5rem\]/, "Product gallery uses desktop side thumbnails");
assert.match(productImageGalleryComponent, /showInlineThumbnails = true/, "Product image gallery can show thumbnails outside compact cards");
assert.match(productImageGalleryComponent, /Escape/, "Product image gallery closes with Escape");
assert.match(productImageGalleryComponent, /ArrowRight[\s\S]*ArrowLeft/, "Product image gallery supports keyboard image navigation");
assert.match(productImageGalleryComponent, /galleryImages\.length === 0 \? 0/, "Product image gallery handles one or zero images cleanly");
assert.match(changePasswordAction, /await clearSession\(\);\s*redirect\("\/login\?passwordChanged=1"\)/, "Password changes clear session and redirect to login");
assert.match(ownerSystemPage, /Cookie secure mode/, "Owner system page shows auth cookie diagnostics");
assert.match(ownerSystemPage, /Database ping/, "Owner system page shows database latency");
assert.match(ownerSystemPage, /Pending migrations/, "Owner system page shows pending migration status");
assert.match(ownerSystemPage, /Image cache folder/, "Owner system page shows missing image cache status");
assert.match(systemHealth, /pendingMigrationCount/, "System health detects pending migration count when possible");
assert.match(productionChecksSource, /database-latency/, "Production checks warn on high database latency");
assert.match(productionChecksSource, /image-cache/, "Production checks warn when image cache folder is missing");
assert.match(windowsProdPs1, /start-local-prod\.mjs/, "Windows PowerShell launcher delegates to Node launcher");
assert.match(localProdEnvExample, /SESSION_COOKIE_SECURE=false/, "Local production env example supports local Wi-Fi HTTP cookies");
assert.match(prodEnvExample, /SESSION_COOKIE_SECURE=true/, "Production env example uses secure cookies for HTTPS");
assert.match(nextPhaseNotes, /CSV exports now neutralize spreadsheet formula injection/, "Next phase notes document CSV hardening");
assert.match(nextPhaseNotes, /Server-side product image caching now rejects/, "Next phase notes document image URL hardening");
assert.match(nextPhaseNotes, /Run the full Codex Security preflight after Python is available/, "Next phase notes document remaining preflight limitation");
assert.match(securityAudit, /Route Map[\s\S]*Owner Only[\s\S]*Worker Routes/, "Security audit documents route protection map");
assert.match(securityAudit, /CSV formula injection risk[\s\S]*Fixed centrally/, "Security audit documents CSV formula fix");
assert.match(securityAudit, /Server-side image cache could request obvious local\/private URLs[\s\S]*Fixed/, "Security audit documents image URL hardening");
assert.match(securityAudit, /python` and `py` are not available/, "Security audit documents preflight limitation");
assert.match(mobileApiPlanDoc, /must never connect directly to SQLite, PostgreSQL, Supabase, or any database host/i, "Mobile API plan forbids direct database access");
assert.match(mobileApiPlanDoc, /No database password belongs in the Android/i, "Mobile API plan forbids DB passwords in Android");
assert.match(mobileApiPlanDoc, /Android sends username and password to `POST \/api\/mobile\/auth\/login`[\s\S]*server verifies the password hash/i, "Mobile API plan documents server-side password verification");
assert.match(mobileApiPlanDoc, /Worker data is scoped by role and assigned account/i, "Mobile API plan documents worker scoping");
assert.match(mobileApiPlanDoc, /Tailscale or ZeroTier/i, "Mobile API plan recommends private VPN for different Wi-Fi");
assert.match(mobileApiPlanDoc, /Plain public router port forwarding is not recommended/i, "Mobile API plan warns against public port forwarding");
assert.match(mobileApiPlanDoc, /Native Android scanner reads the barcode locally[\s\S]*\/api\/mobile\/packing\/search/i, "Mobile API plan documents native scanner search flow");
assert.match(mobileLocalConnectionDoc, /0\.0\.0\.0[\s\S]*3001[\s\S]*http:\/\/192\.168\.1\.10:3001/i, "Mobile local docs explain same-Wi-Fi owner PC connection");
assert.match(mobileLocalConnectionDoc, /Tailscale[\s\S]*ZeroTier[\s\S]*http:\/\/100\.x\.y\.z:3001/i, "Mobile local docs explain private VPN connection");
assert.match(mobileLocalConnectionDoc, /Do not put `DATABASE_URL` in the Android app/i, "Mobile local docs warn against DB URL in Android");
assert.match(mobileLocalConnectionDoc, /sends only the scanned code to/i, "Mobile local docs explain scanner sends scanned value to API");
for (const typeName of ["MobileUser", "MobileAccount", "MobilePickerGroup", "MobilePackingSearchResult", "MobileProductImages", "MobileApiError"]) {
  assert.match(mobileApiTypes, new RegExp(`export type ${typeName}`), `Mobile API safe response type exists: ${typeName}`);
}
assert.match(mobileApiHelper, /NextResponse\.json/, "Mobile API helper returns JSON responses");
assert.doesNotMatch(mobileApiHelper, /stack/i, "Mobile API helper does not expose stack traces in errors");
assert.match(mobileApiHelper, /account_forbidden[\s\S]*getAvailableAccounts|getAvailableAccounts[\s\S]*account_forbidden/, "Mobile account checks authorize against server-side available accounts");
assert.match(mobileLoginRoute, /evaluateLoginCredentials[\s\S]*createSession[\s\S]*serializeMobileUser/, "Mobile login verifies credentials server-side and returns safe user data");
assert.match(mobileLoginRoute, /loginCheck === "inactive"[\s\S]*invalid_login/, "Mobile login rejects disabled users without exposing account state");
assert.match(mobileLoginRoute, /mustChangePassword: loginCheck === "must_change_password"/, "Mobile login returns mustChangePassword clearly");
assert.doesNotMatch(sourceBetween(mobileLoginRoute, "return mobileJson", "});\n}"), /passwordHash|passwordSalt|SESSION_SECRET|DATABASE_URL/, "Mobile login response does not return secrets or password hashes");
assert.match(mobileMeRoute, /serializeMobileUser/, "Mobile me route returns safe user/account data");
assert.match(mobileLogoutRoute, /clearSession/, "Mobile logout clears server session");
assert.match(mobilePickerGroupsRoute, /getMobilePermissionAccountContext\(request, "canPick"\)/, "Mobile picker groups require canPick permission");
assert.doesNotMatch(mobilePickerGroupsRoute, /productDescription|allSpecifications|description/, "Mobile picker groups omit heavy/private listing fields");
assert.match(mobilePickerGroupsRoute, /pendingCount[\s\S]*pickedCount[\s\S]*problemCount[\s\S]*mainImageUrl[\s\S]*cacheStatus/, "Mobile picker groups return compact worker fields");
assert.match(mobilePickerPickedRoute, /markCustomerOrdersPickedSafely/, "Mobile mark-picked uses the shared picking service");
assert.match(orderPickingService, /pickStatus === "READY"[\s\S]*packStatus === "READY"[\s\S]*pickStatus: "PICKED"/, "Shared picking service updates only ready picker rows");
assert.match(mobilePickerProblemRoute, /pickStatus: "PROBLEM"[\s\S]*packStatus: "PROBLEM"[\s\S]*MOBILE_PICK_PROBLEM_CREATED|MOBILE_PICK_PROBLEM_CREATED[\s\S]*pickStatus: "PROBLEM"[\s\S]*packStatus: "PROBLEM"/, "Mobile picker problem marks grouped items problem");
assert.match(mobilePackingSearchRoute, /getMobilePermissionAccountContext\(request, "canPack"\)/, "Mobile packing search requires canPack permission");
assert.equal(mobilePackingSearchRoute.indexOf("trackingId: code") < mobilePackingSearchRoute.indexOf("awb: code"), true, "Mobile packing search checks Tracking ID before AWB");
assert.match(mobilePackingSearchRoute, /canPack: order\.packStatus === "READY"/, "Mobile packing search exposes pack eligibility");
assert.doesNotMatch(mobilePackingSearchRoute, /productDescription|allSpecifications|description/, "Mobile packing search returns compact fields only");
assert.match(mobilePackingConfirmRoute, /packCustomerOrderShipmentSafely[\s\S]*skippedCount/, "Mobile packing confirm uses the shared safe shipment service");
assert.doesNotMatch(mobilePackingConfirmRoute, /buildConfirmPackedOrderWhere/, "Mobile packing cannot use the legacy mutation helper");
assert.match(mobilePackingProblemRoute, /packStatus === "PACKED"[\s\S]*already_packed/, "Mobile packing problem refuses already packed rows");
assert.match(mobileProductImagesRoute, /buildListingImageGallery[\s\S]*mainImageUrl[\s\S]*gallery/, "Mobile product images route returns safe gallery data");
assert.doesNotMatch(mobileProductImagesRoute, /description|allSpecifications|productHighlights/, "Mobile product images route excludes heavy listing details");
assert.match(mobileProductDetailsRoute, /description[\s\S]*allSpecifications/, "Mobile product details route loads heavier listing fields only on details");
assert.match(mobileSyncStatusRoute, /readyOrders[\s\S]*openProblems[\s\S]*latestImport/, "Mobile sync status is compact and account-scoped");
assert.doesNotMatch(mobileRouteBundle, /rawData|passwordSalt|SESSION_SECRET|DATABASE_URL/, "Mobile routes do not expose raw private data or secrets");
assert.match(sqliteSchema, /@@unique\(\[accountId, sku\]\)/, "SQLite schema keeps SKU mappings unique by account and SKU");
assert.match(postgresSchema, /@@unique\(\[accountId, sku\]\)/, "PostgreSQL schema keeps SKU mappings unique by account and SKU");
assert.match(sqliteSchema, /enum Marketplace[\s\S]*FLIPKART[\s\S]*MEESHO[\s\S]*AMAZON[\s\S]*WOOCOMMERCE[\s\S]*OTHER/, "SQLite schema defines marketplace enum");
assert.match(postgresSchema, /enum Marketplace[\s\S]*FLIPKART[\s\S]*MEESHO[\s\S]*AMAZON[\s\S]*WOOCOMMERCE[\s\S]*OTHER/, "PostgreSQL schema defines marketplace enum");
assert.match(sqliteSchema, /companyName\s+String\s+@default\("Sullery"\)[\s\S]*marketplace\s+Marketplace\s+@default\(FLIPKART\)[\s\S]*accountDisplayName\s+String\?[\s\S]*accountCode\s+String\?/, "SQLite Account model stores company, marketplace, display name, and account code");
assert.match(postgresSchema, /companyName\s+String\s+@default\("Sullery"\)[\s\S]*marketplace\s+Marketplace\s+@default\(FLIPKART\)[\s\S]*accountDisplayName\s+String\?[\s\S]*accountCode\s+String\?/, "PostgreSQL Account model stores company, marketplace, display name, and account code");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations", "20260707000100_marketplace_accounts", "migration.sql")), true, "SQLite marketplace account migration exists");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations-postgres", "20260707000100_marketplace_accounts", "migration.sql")), true, "PostgreSQL marketplace account migration exists");
assert.match(sqliteSchema, /oldPendingReviewStatus\s+String\s+@default\("NONE"\)[\s\S]*oldPendingReviewedAt\s+DateTime\?[\s\S]*oldPendingReviewNote\s+String\?/, "SQLite schema stores old pending review state");
assert.match(postgresSchema, /oldPendingReviewStatus\s+String\s+@default\("NONE"\)[\s\S]*oldPendingReviewedAt\s+DateTime\?[\s\S]*oldPendingReviewNote\s+String\?/, "PostgreSQL schema stores old pending review state");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations", "20260707000200_old_pending_review", "migration.sql")), true, "SQLite old pending review migration exists");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations-postgres", "20260707000200_old_pending_review", "migration.sql")), true, "PostgreSQL old pending review migration exists");
assert.match(sqliteSchema, /model ProblemOrder[\s\S]*resolutionNote\s+String\?/, "SQLite schema stores problem resolution notes");
assert.match(postgresSchema, /model ProblemOrder[\s\S]*resolutionNote\s+String\?/, "PostgreSQL schema stores problem resolution notes");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations", "20260707000300_problem_resolution_note", "migration.sql")), true, "SQLite problem resolution note migration exists");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations-postgres", "20260707000300_problem_resolution_note", "migration.sql")), true, "PostgreSQL problem resolution note migration exists");
assert.match(sqliteSchema, /assignedAccounts\s+Account\[\]\s+@relation\("UserAssignedAccounts"\)/, "SQLite schema supports multiple assigned accounts per user");
assert.match(postgresSchema, /assignedAccounts\s+Account\[\]\s+@relation\("UserAssignedAccounts"\)/, "PostgreSQL schema supports multiple assigned accounts per user");
assert.match(sqliteSchema, /model PasswordResetRequest[\s\S]*status\s+String\s+@default\("OPEN"\)/, "SQLite schema stores password reset requests");
assert.match(postgresSchema, /model PasswordResetRequest[\s\S]*status\s+String\s+@default\("OPEN"\)/, "PostgreSQL schema stores password reset requests");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations", "20260707000400_user_assignments_password_requests", "migration.sql")), true, "SQLite user assignment/password request migration exists");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations-postgres", "20260707000400_user_assignments_password_requests", "migration.sql")), true, "PostgreSQL user assignment/password request migration exists");
assert.match(sqliteSchema, /cacheStatus\s+ImageCacheStatus/, "SQLite schema stores cache status metadata");
assert.match(postgresSchema, /cacheStatus\s+ImageCacheStatus/, "PostgreSQL schema stores cache status metadata");
assert.match(sqliteSchema, /active\s+Boolean\s+@default\(true\)[\s\S]*@@index\(\[active\]\)/, "SQLite schema supports active account management");
assert.match(postgresSchema, /active\s+Boolean\s+@default\(true\)[\s\S]*@@index\(\[active\]\)/, "PostgreSQL schema supports active account management");
assert.match(gitignore, /\*\.pdf/, "Git ignores real PDF files");
assert.match(gitignore, /storage\/product-images\//, "Git ignores local product image cache");
assert.equal(existsSync(join(repoRoot, "scripts", "windows", "start-local-prod.ps1")), true, "Windows production PowerShell script exists");
assert.equal(existsSync(join(repoRoot, "scripts", "windows", "start-local-prod.bat")), true, "Windows production batch script exists");
assert.equal(existsSync(join(repoRoot, "scripts", "windows", "start-meesho-app.bat")), true, "Windows double-click launcher exists");
assert.equal(existsSync(join(repoRoot, "docs", "cloudflare-tunnel", "config.yml.example")), true, "Cloudflare Tunnel config example exists");
assert.equal(existsSync(join(repoRoot, "docs", "cloudflare-tunnel", "security-setup.md")), true, "Cloudflare security setup doc exists");
assert.equal(existsSync(join(repoRoot, "docs", "windows-server-setup.md")), true, "Windows server setup doc exists");
assert.equal(existsSync(join(repoRoot, ".env.local.production.example")), true, "Local production env example exists");
assert.equal(existsSync(join(repoRoot, "app", "owner", "accounts", "page.tsx")), true, "Owner accounts page exists");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations", "20260526093000_account_management", "migration.sql")), true, "SQLite account management migration exists");
assert.equal(existsSync(join(repoRoot, "prisma", "migrations-postgres", "20260526093000_account_management", "migration.sql")), true, "PostgreSQL account management migration exists");

console.log("Validation tests passed.");
