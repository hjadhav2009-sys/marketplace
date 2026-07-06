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
import { formatCsvValue, rowsToCsv } from "../lib/csv";
import { buildSkuMetadataAutoFillUpdates, planOrderImport } from "../lib/import/orders";
import {
  cachedProductImageUrl,
  canUserAccessCachedImage,
  cardFileNameForContentType,
  findImageCacheCleanupCandidates,
  imageCacheNeedsRefresh,
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
import { canConfirmPacked } from "../lib/operations/packing";
import { buildPickerSkuGroups, normalizePickerLimit, paginatePickerSkuGroups } from "../lib/operations/picking";
import { buildWorkQueueOrderWhere, normalizeWorkQueueFilter, orderMatchesWorkQueue, startOfWorkDay } from "../lib/operations/work-queue";
import { hashPassword } from "../lib/password";
import { runProductionChecks, summarizeProductionChecks } from "../lib/production-checks";
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
assert.equal(canRoleAccessPath("PICKER", "/change-password"), true, "Workers can change password");

assert.equal(canConfirmPacked({ packStatus: "READY" }), true, "Ready order can be packed");
assert.equal(canConfirmPacked({ packStatus: "PACKED" }), false, "Packed order is idempotently skipped");
assert.equal(canConfirmPacked({ packStatus: "PROBLEM" }), false, "Problem order cannot be packed accidentally");
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
assert.equal(ownerAccountSchema.parse({ name: "Second Account", code: "Second Account", active: true }).code, "second-account", "Owner account code is normalized");

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
const awbScannerComponent = readFileSync(join(repoRoot, "components", "AwbBarcodeScanner.tsx"), "utf8");
const productImageRoute = readFileSync(join(repoRoot, "app", "product-images", "[...path]", "route.ts"), "utf8");
const pickerPage = readFileSync(join(repoRoot, "app", "picker", "page.tsx"), "utf8");
const pickerDetailPage = readFileSync(join(repoRoot, "app", "picker", "[sku]", "page.tsx"), "utf8");
const packingPage = readFileSync(join(repoRoot, "app", "packing", "page.tsx"), "utf8");
const packingActions = readFileSync(join(repoRoot, "app", "packing", "actions.ts"), "utf8");
const packingSearchRoute = readFileSync(join(repoRoot, "app", "packing", "search", "route.ts"), "utf8");
const packingResultPage = readFileSync(join(repoRoot, "app", "packing", "[awb]", "page.tsx"), "utf8");
const pickerActions = readFileSync(join(repoRoot, "app", "picker", "[sku]", "actions.ts"), "utf8");
const pickerDetailsRoute = readFileSync(join(repoRoot, "app", "picker", "details", "route.ts"), "utf8");
const dashboardPage = readFileSync(join(repoRoot, "app", "dashboard", "page.tsx"), "utf8");
const ownerPage = readFileSync(join(repoRoot, "app", "owner", "page.tsx"), "utf8");
const reviewPage = readFileSync(join(repoRoot, "app", "owner", "uploads", "[batchId]", "review", "page.tsx"), "utf8");
const workQueueSource = readFileSync(join(repoRoot, "lib", "operations", "work-queue.ts"), "utf8");
const ownerAccountsPage = readFileSync(join(repoRoot, "app", "owner", "accounts", "page.tsx"), "utf8");
const ownerAccountsActions = readFileSync(join(repoRoot, "app", "owner", "accounts", "actions.ts"), "utf8");
const skuExportRoute = readFileSync(join(repoRoot, "app", "owner", "sku-mappings", "export", "route.ts"), "utf8");
const ownerUsersPage = readFileSync(join(repoRoot, "app", "owner", "users", "page.tsx"), "utf8");
const ownerUsersActions = readFileSync(join(repoRoot, "app", "owner", "users", "actions.ts"), "utf8");
const appShell = readFileSync(join(repoRoot, "components", "AppShell.tsx"), "utf8");
const dataHelpers = readFileSync(join(repoRoot, "lib", "data.ts"), "utf8");
const changePasswordAction = readFileSync(join(repoRoot, "app", "change-password", "actions.ts"), "utf8");
const ownerSystemPage = readFileSync(join(repoRoot, "app", "owner", "system", "page.tsx"), "utf8");
const systemHealth = readFileSync(join(repoRoot, "lib", "system-health.ts"), "utf8");
const productionChecksSource = readFileSync(join(repoRoot, "lib", "production-checks.ts"), "utf8");
const windowsProdPs1 = readFileSync(join(repoRoot, "scripts", "windows", "start-local-prod.ps1"), "utf8");
const windowsLauncher = readFileSync(join(repoRoot, "scripts", "windows", "start-local-prod.mjs"), "utf8");
const windowsEnvUtils = readFileSync(join(repoRoot, "scripts", "windows", "env-utils.mjs"), "utf8");
const windowsCheckEnv = readFileSync(join(repoRoot, "scripts", "windows", "check-env.mjs"), "utf8");
const windowsServerSetupDoc = readFileSync(join(repoRoot, "docs", "windows-server-setup.md"), "utf8");
const cloudflareSecurityDoc = readFileSync(join(repoRoot, "docs", "cloudflare-tunnel", "security-setup.md"), "utf8");
const manualSmokeTestDoc = readFileSync(join(repoRoot, "docs", "manual-smoke-test.md"), "utf8");
const localProdEnvExample = readFileSync(join(repoRoot, ".env.local.production.example"), "utf8");
const prodEnvExample = readFileSync(join(repoRoot, ".env.production.example"), "utf8");
const sqliteSchema = readFileSync(join(repoRoot, "prisma", "schema.prisma"), "utf8");
const postgresSchema = readFileSync(join(repoRoot, "prisma", "schema.postgres.prisma"), "utf8");
const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");

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
assert.match(nextConfig, /bodySizeLimit:\s*"100mb"/, "Next config allows large local Meesho PDF uploads");
assert.equal(buildScript.indexOf('import "dotenv/config";') < buildScript.indexOf("process.env.DATABASE_URL"), true, "Build loads .env before choosing Prisma schema");
assert.match(startScript, /check-production-readiness\.mjs/, "Startup runs production readiness preflight");
assert.match(readinessScript, /AUTO_APPLY_MIGRATIONS/, "Production readiness check supports automatic migration apply opt-in");
assert.match(readinessScript, /prisma", "migrate", "status"/, "Production readiness check verifies migration status");
assert.match(readinessScript, /\$queryRaw`SELECT 1`/, "Production readiness check pings the database");
assert.equal(pdfExtractor.includes(".next/server/chunks/pdf.worker.mjs"), false, "PDF extraction does not reference Next server worker chunks");
assert.match(pdfExtractor, /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/, "PDF extraction preloads the PDF.js worker module explicitly");
assert.match(pdfExtractor, /PDF text extraction failed before pages could be read\./, "PDF extraction reports startup failures before page reads");
assert.match(uploadLimits, /PDF_UPLOAD_MAX_BYTES\s*=\s*100 \* 1024 \* 1024/, "Upload action has a 100 MB friendly file-size guard");
assert.match(uploadActions, /error=too-large/, "Upload action redirects to friendly too-large PDF error");
assert.match(uploadActions, /ownerUploadAccount/, "Upload actions use the chosen seller account instead of a stale account cookie");
assert.match(uploadActions, /revalidatePath\("\/dashboard"\)/, "Upload actions refresh the dashboard route after imports");
assert.match(uploadActions, /selectPreviewRowsForImport/, "Confirm import uses centralized label-over-manifest source selection");
assert.match(importPreview, /rows\.some\(\(row\) => row\.sourceType === "LABEL"\)[\s\S]*"MANIFEST_ORDER"/, "Preview import source prefers labels over manifest rows");
assert.match(importPreview, /seenAwbs\.has/, "Confirm import skips duplicate AWB rows inside one preview batch");
assert.match(importOrders, /heldRows/, "Order import stats include held-for-review rows");
assert.match(reviewPage, /Held for review/, "Import result shows held-for-review count");
assert.match(dashboardPage, /requireUser\(\["OWNER"\]\)/, "Dashboard route remains owner-only");
assert.match(dashboardPage, /getDashboardStats/, "Dashboard route exists and uses lightweight dashboard data");
assert.match(ownerPage, /redirect\("\/dashboard"\)/, "Legacy /owner route redirects to /dashboard");
assert.match(uploadPage, /Flipkart Listing Master/, "Upload page offers Flipkart Listing Master import");
assert.match(uploadPage, /Flipkart Daily Orders/, "Upload page offers Flipkart Daily Orders import");
assert.match(uploadPage, /Upload this only when new products are listed or title, price, image, or listing status changes/, "Upload page explains Listing Master timing");
assert.match(uploadPage, /Daily workers upload this order file/, "Upload page explains daily order import workflow");
assert.match(uploadPage, /<details[\s\S]*Advanced \/ Legacy imports[\s\S]*Legacy PDF parser for old Meesho label\/manifest workflow/, "Legacy PDF parser is hidden under Advanced / Legacy imports");
assert.match(uploadPage, /name="accountId"[\s\S]*accounts\.map/, "Upload page exposes seller account selection");
assert.match(pickerPage, /Large images/, "Picker page keeps a large-image mobile toggle");
assert.match(pickerPage, /Load more/, "Picker page supports load-more pagination");
assert.match(pickerPage, /Compact/, "Picker page supports compact mode");
assert.match(pickerPage, /sticky top-\[88px\]/, "Picker filters stay reachable on mobile");
assert.doesNotMatch(pickerPage, /overflow-x-auto/, "Picker filters avoid unwanted horizontal scrolling");
assert.match(pickerPage, /Upload today&apos;s orders[\s\S]*View old pending/, "Picker empty state has compact practical actions");
assert.match(pickerPage, /PickerProductCard/, "Picker page renders worker cards through the client card component");
assert.match(pickerListDataSource, /imageUrl1:\s*true[\s\S]*imageUrl10:\s*true[\s\S]*image1366Url1:\s*true/, "Picker card query includes listing image URLs for gallery");
assert.doesNotMatch(pickerListDataSource, heavyListingFieldsPattern, "Picker list query keeps heavy listing description/spec/gallery fields out of card payloads");
assert.match(pickerProductCardComponent, /ProductImageGallery/, "Picker card image area opens the image gallery");
assert.match(pickerProductCardComponent, /showInlineThumbnails={false}/, "Picker card keeps the top image area square without inline thumbnail rows");
assert.match(pickerProductCardComponent, /data-card-actions="3"/, "Picker card keeps worker actions under the four-button maximum");
assert.match(pickerProductCardComponent, /Details[\s\S]*ProductDetailsDrawer/, "Picker card separates Details from the image gallery");
assert.doesNotMatch(pickerProductCardComponent, /href=.*picker\/\$\{/, "Picker card image/details controls do not navigate to the SKU page");
assert.match(productDetailsDrawerComponent, /fetch\(detailsUrl/, "Product details drawer fetches heavy detail data only after opening");
assert.match(pickerDetailsRoute, /getSkuDetail/, "Picker details drawer route reuses the full SKU detail query");
assert.match(pickerActions, /markSkuGroupPickedInlineAction[\s\S]*return \{ ok: true, updatedRows: result\.count \}/, "Direct picker card action returns picked result without redirecting");
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
assert.match(reviewPage, /<details[\s\S]*Picklist SKU summary rows/, "Upload review makes picklist summary rows collapsible");
assert.match(reviewPage, /Prepare today&apos;s product images/, "Upload review exposes daily image cache preparation");
assert.match(reviewPage, /Missing image mappings/, "Upload review shows inline missing image mapping repair");
assert.match(reviewPage, /Save \+ cache/, "Upload review can save and immediately cache a missing SKU image");
assert.match(reviewPage, /Fix missing image URLs first/, "Upload review tells the owner to fix missing image URLs before image prep");
assert.match(uploadActions, /repairMissingSkuImageMappingAction/, "Upload review has a dedicated missing SKU image repair action");
assert.match(uploadActions, /accountId_sku[\s\S]*accountId: account\.id/, "Missing image repair creates or updates mappings in the selected account only");
assert.match(uploadActions, /cacheQueueMapping\(mapping\)/, "Save and cache calls the image cache pipeline");
assert.match(uploadActions, /clearMissingImageIssuesForSku/, "Missing image repair clears the batch preview missing-image status");
assert.match(awbScannerComponent, /src={suggestion.cachedImageUrl}/, "Manual AWB suggestions use cached signed image URL first");
assert.match(awbScannerComponent, /cacheStatus={suggestion.cacheStatus}/, "Manual AWB suggestions pass cached image status");
assert.match(awbScannerComponent, /manualAwbRef\.current\?\.focus/, "Packing screen focuses the scan input immediately");
assert.match(awbScannerComponent, /<Link[\s\S]*prefetch/, "Packing search suggestions prefetch scan-result pages");
assert.match(packingSearchRoute, /cachedImageUrl/, "AWB suggestion API returns cachedImageUrl only for product images");
assert.doesNotMatch(packingSearchRoute, /imageUrl: order\.imageUrl/, "AWB suggestion API does not return slow external image URLs");
assert.match(dataHelpers, /awb: query[\s\S]*endsWith: query[\s\S]*contains: query/, "AWB search queries exact, suffix, then contains");
assert.match(dataHelpers, /packStatus: "READY"[\s\S]*OR: \[\{ awb: query \}, \{ trackingId: query \}\]/, "Packing AWB search defaults to active READY orders and checks Tracking ID");
assert.doesNotMatch(packingSearchDataSource, heavyListingFieldsPattern, "Packing search returns compact listing data without heavy descriptions/specs/gallery fields");
assert.match(dataHelpers, /withDevTiming\("packing awb search"[\s\S]*500\)/, "AWB search has 500ms dev timing logs");
assert.match(dataHelpers, /withDevTiming\("picker orders"[\s\S]*800[\s\S]*\);/, "Picker order query has 800ms dev timing logs");
assert.match(dataHelpers, /buildWorkQueueOrderWhere/, "Picker queries are scoped through the daily active work queue");
assert.match(workQueueSource, /importedAt: \{ gte: startOfToday \}/, "Today work queue filters by today's imported orders");
assert.match(workQueueSource, /importedAt: \{ lt: startOfToday \}/, "Old pending work queue separates older READY orders");
assert.match(pickerPage, /Current batch/, "Picker exposes a current-batch work queue chip");
assert.match(pickerPage, /All pending/, "Picker exposes all-pending work queue chip");
assert.match(packingPage, /Today ready[\s\S]*Old pending[\s\S]*Problems/, "Packing dashboard separates today, old pending, and problem counts");
assert.match(packingPage, /Move old pending to review/, "Owner can move old pending work into a review-only flow");
assert.match(packingActions, /writeScanLogLater[\s\S]*redirect\(`\/packing\/\$\{encodeURIComponent\(matchedOrder\.awb\)\}`\)/, "Packing search redirects before scan logging can block order opening");
assert.match(packingActions, /OLD_PENDING_REVIEW_REPORTED/, "Old pending review action is audited without deleting orders");
assert.match(productImageRoute, /getCurrentUser/, "Cached image route checks session without login redirect");
assert.match(productImageRoute, /verifySignedCachedImageUrl/, "Cached image route verifies signed image URLs");
assert.equal(productImageRoute.indexOf("verifySignedCachedImageUrl") < productImageRoute.indexOf("const user = await getCurrentUser"), true, "Signed cached image route avoids database auth before serving normal image requests");
assert.match(productImageRoute, /status: 401/, "Cached image route returns 401 for unauthenticated image requests");
assert.match(productImageRoute, /canUserAccessCachedImage/, "Cached image route enforces account access");
assert.match(skuExportRoute, /cache_status/, "Full SKU export includes cache status");
assert.match(skuExportRoute, /product_name[\s\S]*color[\s\S]*size/, "Full SKU export includes auto-filled metadata");
assert.match(appShell, /\{ href: "\/dashboard", label: "Dashboard" \}/, "Owner navigation uses /dashboard as the dashboard link");
assert.match(appShell, /const pickerLinks = \[[\s\S]*\/picker[\s\S]*\/change-password[\s\S]*\]/, "Picker navigation stays worker-only");
assert.doesNotMatch(sourceBetween(appShell, "const pickerLinks", "const packerLinks"), /\/owner/, "Picker navigation does not show owner management links");
assert.doesNotMatch(sourceBetween(appShell, "const packerLinks", "async function logoutAction"), /\/owner/, "Packer navigation does not show owner management links");
assert.match(appNavComponent, /usePathname/, "Top navigation can style the active route");
assert.match(appNavComponent, /prefetch/, "Top navigation prefetches common route links");
assert.match(appShell, /\/owner\/accounts/, "Owner navigation includes account management");
assert.match(ownerAccountsPage, /Create account/, "Owner accounts page supports account creation");
assert.match(ownerAccountsPage, /Deactivate|Reactivate/, "Owner accounts page supports activate/deactivate controls");
assert.match(ownerAccountsActions, /OWNER_ACCOUNT_CREATED/, "Owner account creation is audited");
assert.match(ownerAccountsActions, /OWNER_ACCOUNT_DEACTIVATED/, "Owner account deactivation is audited");
assert.match(ownerUsersPage, /Passwords are securely hashed and cannot be viewed/, "Owner users page explains passwords cannot be viewed");
assert.match(ownerUsersPage, /Force password change on next login/, "Owner password reset can force next-login password change");
assert.match(ownerUsersActions, /passwordHash: hashPassword\(password\)/, "Owner password reset stores only a password hash");
assert.match(ownerUsersActions, /userDeviceSession\.updateMany/, "Owner password reset closes active sessions for workers");
assert.match(ownerUsersActions, /OWNER_PASSWORD_RESET/, "Owner password reset is audited");
assert.match(ownerUsersActions, /OWNER_USER_UNLOCKED/, "Owner unlock is audited");
assert.match(windowsLauncher + windowsEnvUtils, /dotenv/, "Windows launcher loads .env with dotenv");
assert.match(windowsLauncher, /SKIP_PRISMA_MIGRATE/, "Windows launcher defaults migration skip for local production");
assert.match(windowsCheckEnv, /printEnvironmentSummary/, "check-env prints a masked environment summary");
assert.match(productImageComponent, /decoding="async"/, "Product images decode asynchronously");
assert.match(productImageComponent, /state !== "loading" \|\| !isExternalSrc/, "ProductImage does not show slow external warning for local cached images");
assert.match(productImageComponent, /aspect-square w-full/, "Large product image areas stay square");
assert.match(productImageComponent, /object-contain/, "Product images fit without cropping");
assert.match(productImageComponent, /Use Listing Master or cache today's images/, "Product cards show a clean missing-image fallback");
assert.match(productImageComponent, /Check this image/, "Owner image diagnostics include a manual client recheck button");
assert.match(productImageComponent, /imageHealth === "BROKEN" \|\| manualCheck/, "Successful image loads only update health when repairing or manually checking a mapping");
assert.match(productImageGalleryComponent, /role="dialog"/, "Product image gallery opens as an accessible dialog");
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
assert.match(sqliteSchema, /@@unique\(\[accountId, sku\]\)/, "SQLite schema keeps SKU mappings unique by account and SKU");
assert.match(postgresSchema, /@@unique\(\[accountId, sku\]\)/, "PostgreSQL schema keeps SKU mappings unique by account and SKU");
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
