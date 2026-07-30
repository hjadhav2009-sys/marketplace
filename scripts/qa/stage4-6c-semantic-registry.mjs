import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { REQUIRED_SCENARIOS, ROLE_TO_DISPLAY } from "./stage4-5-scenarios.mjs";

export const SEMANTIC_REGISTRY_VERSION = "stage4.6c1-semantic-v2";
export const SYNTHETIC_FIXTURE_VERSION = "phase-7.3.6-stage4.6c1-semantic-fixtures-v2";

const record = (table, column, value, expected = undefined) => Object.freeze({
  kind: "record",
  table,
  column,
  value,
  ...(expected ? { expected: Object.freeze({ ...expected }) } : {}),
});
const fixtureFile = (relativePath) => Object.freeze({ kind: "file", relativePath });
const routeFixture = (route) => Object.freeze({ kind: "route", route });
const ROLE_USER_IDS = Object.freeze({
  OWNER: "stage3-owner",
  PICKER: "stage3-picker-a",
  MARKER: "stage3-marker",
  ASSEMBLER: "stage3-assembler",
  PACKER: "stage3-packer-a",
  VIEW_ALL: "stage3-view-all",
});

const NAMED_FIXTURES = Object.freeze({
  AUTH_DEFAULT: [routeFixture("/login")],
  AUTH_INVALID: [routeFixture("/login")],
  AUTH_EXPIRED: [record("User", "id", "stage3-owner", { active: 1 })],
  AUTH_FORBIDDEN: [record("User", "id", "stage3-picker-a")],
  OWNER_EMPTY_ACCOUNT: [record("User", "id", "stage3-owner"), record("Account", "code", "STAGE-FK-01")],
  OWNER_POPULATED: [record("Account", "code", "STAGE-FK-01")],
  PRODUCT_ACTIVE: [record("MarketplaceListing", "id", "stage3-listing-fk-direct")],
  PRODUCT_INACTIVE: [record("MarketplaceListing", "id", "stage3-listing-fk-inactive")],
  PRODUCT_ARCHIVED: [record("MarketplaceListing", "id", "stage3-listing-fk-archived")],
  PRODUCT_IMAGES_OK: [record("MarketplaceListing", "id", "stage3-listing-fk-gallery")],
  PRODUCT_IMAGE_ONE_BROKEN: [record("MarketplaceListing", "id", "stage3-listing-fk-broken-image")],
  PRODUCT_IMAGES_ALL_BROKEN: [record("MarketplaceListing", "id", "stage3-listing-fk-missing-image")],
  PRODUCT_DELETE_AVAILABLE: [record("MarketplaceListing", "id", "stage3-listing-fk-inactive")],
  PRODUCT_DELETE_BLOCKED: [record("MarketplaceListing", "id", "stage3-listing-fk-direct"), record("WorkTask", "id", "stage3-order-pick-ready-pick")],
  IMPORT_UPLOAD_EMPTY: [routeFixture("/owner/product-inventory/refresh")],
  IMPORT_ONE_FILE: [fixtureFile("catalog-one.csv")],
  IMPORT_MULTI_FILE: [fixtureFile("catalog-one.csv"), fixtureFile("catalog-two.csv")],
  IMPORT_AMAZON_THREE_ROLE: [fixtureFile("amazon-all-listings.csv"), fixtureFile("catalog-one.csv"), fixtureFile("catalog-two.csv")],
  IMPORT_NEEDS_MAPPING: [record("ImportJob", "id", "stage4-import-mapping")],
  IMPORT_VALIDATION_ERROR: [record("UploadBatch", "id", "stage4-upload-needs-mapping")],
  IMPORT_PROCESSING: [record("ImportJob", "id", "stage4-import-running")],
  IMPORT_COMPLETED: [record("ImportJob", "id", "stage4-import-completed")],
  IMPORT_COMPLETED_WARNINGS: [record("ImportJob", "id", "stage4-import-warnings")],
  IMPORT_FAILED: [record("ImportJob", "id", "stage4-import-failed")],
  IMPORT_CANCELLED: [record("ImportJob", "id", "stage4-import-cancelled")],
  MISSING_LISTING_HELD: [record("ImportRowIssue", "id", "stage4-missing-listing-issue")],
  MISSING_LISTING_RESOLVED: [record("ImportRowIssue", "id", "stage4-missing-listing-issue")],
  CONSIGNMENT_DRAFT: [record("ConsignmentBatch", "id", "stage3-batch-draft")],
  CONSIGNMENT_REVIEW: [record("ConsignmentBatch", "id", "stage3-batch-review_required", { status: "REVIEW_REQUIRED" })],
  CONSIGNMENT_INVALID_QUANTITY: [record("ConsignmentImportIssue", "id", "stage4-consignment-invalid-error", { severity: "ERROR", issueType: "INVALID_QUANTITY", resolved: 0 })],
  CONSIGNMENT_ZERO_QUANTITY: [record("ConsignmentImportIssue", "id", "stage4-consignment-zero-info")],
  CONSIGNMENT_ACTIVE: [record("ConsignmentBatch", "id", "stage3-batch-active")],
  CONSIGNMENT_COMPLETED: [record("ConsignmentBatch", "id", "stage3-batch-completed")],
  PICK_READY: [record("WorkTask", "id", "stage3-order-pick-ready-pick")],
  PICK_PARTIAL: [record("WorkTask", "id", "stage3-order-pick-progress-pick")],
  PICK_ROUTE_DIALOG: [record("WorkTask", "id", "stage3-order-pick-ready-pick")],
  PICK_ROUTE_OVERRIDE: [record("WorkTask", "id", "stage3-order-pick-ready-pick")],
  PICK_MISSING_INSTRUCTIONS: [record("WorkTask", "id", "stage3-order-pick-progress-pick")],
  MARK_READY: [record("WorkTask", "id", "stage3-order-mark-ready-mark")],
  MARK_PARTIAL: [record("WorkTask", "id", "stage3-order-mark-progress-mark")],
  MARK_COMPLETED: [record("WorkTask", "id", "stage4-line-mark-completed-mark")],
  ASSEMBLY_READY: [record("WorkTask", "id", "stage3-order-assembly-ready-assemble", { stage: "ASSEMBLE", status: "READY", requiredQuantity: { gt: 0 }, completedQuantity: 0, problemReason: null })],
  ASSEMBLY_PARTIAL: [record("WorkTask", "id", "stage3-order-assembly-progress-assemble", { stage: "ASSEMBLE", status: "IN_PROGRESS", requiredQuantity: { gt: 1 }, completedQuantity: { gt: 0, ltColumn: "requiredQuantity" }, problemReason: null })],
  ASSEMBLY_COMPLETED: [record("WorkTask", "id", "stage4-line-assembly-completed-assemble")],
  PACK_PICK_LOCKED: [record("WorkTask", "id", "stage3-order-pick-ready-pick")],
  PACK_MARK_LOCKED: [record("WorkTask", "id", "stage3-order-mark-ready-mark")],
  PACK_ASSEMBLY_LOCKED: [record("WorkTask", "id", "stage4-order-pack-assembly-locked-pack")],
  PACK_READY: [record("WorkTask", "id", "stage3-order-pack-ready-pack")],
  PACK_COMPLETED: [record("WorkTask", "id", "stage3-order-pack-complete-pack")],
  SCANNER_EMPTY: [routeFixture("/work/scan")],
  SCANNER_ONE_MATCH: [record("ScanLog", "id", "stage4-scan-found")],
  SCANNER_MULTI_MATCH: [record("MarketplaceListing", "id", "stage3-listing-fk-direct")],
  SCANNER_NO_MATCH: [record("ScanLog", "id", "stage4-scan-missing")],
  SCANNER_WRONG_ACCOUNT: [record("MarketplaceListingIdentifier", "id", "stage3-amz-fnsku")],
  SCANNER_COMPLETED: [record("ScanLog", "id", "stage4-scan-packed")],
  PROBLEM_OPEN: [record("ProblemOrder", "id", "stage4-problem-open")],
  PROBLEM_RESOLVED: [record("ProblemOrder", "id", "stage4-problem-resolved")],
  DATA_DELETE_PREVIEW: [record("DataDeletionJob", "id", "stage4-delete-preview", { actionKind: "PURGE_QA_OPERATIONAL_DATA", state: "PREVIEWED" })],
  DATA_WRONG_PASSWORD: [record("DataDeletionJob", "id", "stage4-delete-preview")],
  DATA_CONFIRMATION_MISMATCH: [record("DataDeletionJob", "id", "stage4-delete-preview")],
  DATA_EXPIRED_GRANT: [record("DataDeletionJob", "id", "stage4-delete-preview")],
  DATA_REPLAY_REJECTED: [record("User", "id", "stage3-picker-a", { active: 1 })],
  DATA_QUARANTINED: [record("DataDeletionJob", "id", "stage4-delete-quarantined", { state: "COMPLETED", totalFiles: { gt: 0 }, purgeAfter: { future: true } })],
  DATA_RESTORED: [record("DataDeletionJob", "id", "stage4-delete-completed", { actionKind: "RESTORE_QUARANTINED_FILES", state: "COMPLETED" })],
  DATA_RETENTION_BLOCKED: [record("DataDeletionJob", "id", "stage4-delete-quarantined", { state: "COMPLETED", totalFiles: { gt: 0 }, purgeAfter: { future: true } })],
  DATA_PURGED: [record("DataDeletionJob", "id", "stage4-delete-purged", { actionKind: "PURGE_QUARANTINED_FILES", state: "PURGED" })],
  PERMISSION_OWNER: [record("User", "id", "stage3-owner")],
  PERMISSION_PICKER: [record("User", "id", "stage3-picker-a")],
  PERMISSION_MARKER: [record("User", "id", "stage3-marker")],
  PERMISSION_ASSEMBLER: [record("User", "id", "stage3-assembler")],
  PERMISSION_PACKER: [record("User", "id", "stage3-packer-a")],
  PERMISSION_VIEW_ONLY: [record("User", "id", "stage3-view-all")],
  PERMISSION_DENIED: [record("User", "id", "stage3-picker-a")],
});

const NAMED_ASSERTIONS = Object.fromEntries([
  ["AUTH_DEFAULT", [["Sign in"], ["Access Denied"], [], ["Dashboard"]]],
  ["AUTH_INVALID", [["Sign in", "The username or password is incorrect."], ["Warehouse overview"], [], ["Dashboard"]]],
  ["AUTH_EXPIRED", [["Sign in", "Your session expired. Sign in again to continue."], ["404", "Warehouse overview"], [], ["Dashboard"]]],
  ["AUTH_FORBIDDEN", [["You do not have permission to open this page"], ["Worker users and sessions"], [], ["Create user"]]],
  ["OWNER_EMPTY_ACCOUNT", [["No seller accounts have been created yet", "Create First Seller Account"], ["Ask the owner", "Choose seller account"], ["Create First Seller Account"], []]],
  ["OWNER_POPULATED", [["Warehouse overview", "STAGE-FK-01"], ["No seller accounts have been created yet"], [], []]],
  ["PRODUCT_ACTIVE", [["STAGE-FK-SKU-001", "Active"], ["Listing not found"], [], []]],
  ["PRODUCT_INACTIVE", [["STAGE-FK-SKU-INACTIVE", "Inactive"], ["Listing not found"], [], []]],
  ["PRODUCT_ARCHIVED", [["Archived"], ["Listing not found"], [], []]],
  ["PRODUCT_IMAGES_OK", [["STAGE-FK-SKU-GALLERY", "Product images"], ["Image unavailable"], [], []]],
  ["PRODUCT_IMAGE_ONE_BROKEN", [["STAGE-FK-SKU-BROKEN-IMAGE"], ["Listing not found"], [], []]],
  ["PRODUCT_IMAGES_ALL_BROKEN", [["STAGE-FK-SKU-MISSING-IMAGE", "Image unavailable"], ["Listing not found"], [], []]],
  ["PRODUCT_DELETE_AVAILABLE", [["Inactive", "Delete"], ["Active work prevents deletion"], ["Delete"], []]],
  ["PRODUCT_DELETE_BLOCKED", [["Active work", "Delete"], ["Deleted"], [], ["Delete permanently"]]],
  ["IMPORT_UPLOAD_EMPTY", [["Product Inventory Refresh", "Choose files"], ["selected file"], [], ["Start Import"]]],
  ["IMPORT_ONE_FILE", [["Product Inventory Refresh", "catalog-one.csv"], ["No file selected"], ["Start Import"], []]],
  ["IMPORT_MULTI_FILE", [["Product Inventory Refresh", "2 files"], ["No file selected"], ["Start Import"], []]],
  ["IMPORT_AMAZON_THREE_ROLE", [["Amazon", "3 files"], ["No file selected"], ["Start Import"], []]],
  ["IMPORT_NEEDS_MAPPING", [["Map File Headers", "NEEDS MAPPING"], ["Import completed"], ["Save Profile and Retry"], []]],
  ["IMPORT_VALIDATION_ERROR", [["Flipkart import review", "issue"], ["Import completed"], [], []]],
  ["IMPORT_PROCESSING", [["Import Progress", "RUNNING"], ["Import completed"], [], []]],
  ["IMPORT_COMPLETED", [["Import Progress", "COMPLETED"], ["RUNNING"], [], []]],
  ["IMPORT_COMPLETED_WARNINGS", [["Import Progress", "warning"], ["No warnings"], [], []]],
  ["IMPORT_FAILED", [["Import Progress", "FAILED"], ["COMPLETED"], [], []]],
  ["IMPORT_CANCELLED", [["Import Progress", "CANCELLED"], ["RUNNING"], [], []]],
  ["MISSING_LISTING_HELD", [["Missing Listings", "held"], ["No unresolved missing listings"], [], []]],
  ["MISSING_LISTING_RESOLVED", [["Missing Listings", "resolved"], ["Unresolved only"], [], []]],
  ["CONSIGNMENT_DRAFT", [["Consignment detail", "DRAFT"], ["COMPLETED"], [], []]],
  ["CONSIGNMENT_REVIEW", [["Activation preview", "REVIEW_REQUIRED", "Activation blocked", "4 blocking errors"], ["Activated"], ["Review blocking issues"], ["Activate", "Activate with warnings"]]],
  ["CONSIGNMENT_INVALID_QUANTITY", [["issues", "ERROR", "INVALID QUANTITY", "Correct or replace the source"], ["No issue rows"], ["Back to review"], []]],
  ["CONSIGNMENT_ZERO_QUANTITY", [["issues", "zero"], ["active work"], [], []]],
  ["CONSIGNMENT_ACTIVE", [["Consignment detail", "ACTIVE"], ["DRAFT"], [], []]],
  ["CONSIGNMENT_COMPLETED", [["Consignment detail", "COMPLETED"], ["Activate Consignment"], [], []]],
  ["PICK_READY", [["Pick", "READY"], ["Work is paused"], ["Complete Pick"], []]],
  ["PICK_PARTIAL", [["Pick", "IN PROGRESS"], ["COMPLETED"], ["Save Partial Quantity"], []]],
  ["PICK_ROUTE_DIALOG", [["Choose the next route"], ["Route saved"], ["Direct to Pack"], []]],
  ["PICK_ROUTE_OVERRIDE", [["Choose the next route", "reason"], ["Route saved"], ["Assembly"], []]],
  ["PICK_MISSING_INSTRUCTIONS", [["instructions are missing", "Continue"], ["machine settings"], ["Continue"], []]],
  ["MARK_READY", [["Marking", "READY"], ["MARK: COMPLETED"], ["Marking Completed"], []]],
  ["MARK_PARTIAL", [["Marking", "IN PROGRESS"], ["MARK: COMPLETED"], ["Save Partial Quantity"], []]],
  ["MARK_COMPLETED", [["MARK: COMPLETED", "completed by Synthetic Marker", "Quantity", "history"], ["Marking Completed"], ["Details"], ["Marking Completed"]]],
  ["ASSEMBLY_READY", [["Synthetic assembly-ready order", "Current stage", "ASSEMBLE", "READY", "Pending quantity", "1"], ["ASSEMBLE: COMPLETED"], ["Assembly Completed"], []]],
  ["ASSEMBLY_PARTIAL", [["Synthetic assembly-progress order", "Current stage", "ASSEMBLE", "IN PROGRESS", "Required quantity", "2", "Completed quantity", "1", "Pending quantity", "1"], ["ASSEMBLE: COMPLETED"], ["Partial Quantity", "Assembly Completed"], []]],
  ["ASSEMBLY_COMPLETED", [["ASSEMBLE: COMPLETED", "completed by Synthetic Assembler", "Quantity", "history"], ["Assembly Completed"], ["Scan Next"], ["Assembly Completed"]]],
  ["PACK_PICK_LOCKED", [["Pick is required before packing", "locked"], ["Packing is complete"], [], ["Confirm packed"]]],
  ["PACK_MARK_LOCKED", [["Marking is required before packing", "locked"], ["Packing is complete"], [], ["Confirm packed"]]],
  ["PACK_ASSEMBLY_LOCKED", [["Assembly is required before packing", "locked"], ["Packing is complete"], [], ["Confirm packed"]]],
  ["PACK_READY", [["Packing", "READY"], ["locked"], ["Confirm packed"], []]],
  ["PACK_COMPLETED", [["PACKED", "Packing is complete", "packed"], ["Confirm packed"], ["Details"], ["Confirm packed"]]],
  ["SCANNER_EMPTY", [["Universal Work Scan", "Scanning never mutates work"], ["No match found"], ["Search"], []]],
  ["SCANNER_ONE_MATCH", [["STAGE-AWB-1", "active result"], ["No match found"], ["Open Details"], []]],
  ["SCANNER_MULTI_MATCH", [["STAGE-FK-SKU-001", "active result"], ["No match found"], ["Open Details"], []]],
  ["SCANNER_NO_MATCH", [["No match found", "No action was performed"], ["PACKED"], ["Scan Next"], []]],
  ["SCANNER_WRONG_ACCOUNT", [["No authorized active work"], ["Amazon Account"], [], ["Complete"]]],
  ["SCANNER_COMPLETED", [["PACKED", "STAGE-AWB-10", "packed by", "packed", "item", "quantity"], ["Confirm packed"], ["Open Details", "Scan Next"], ["Confirm packed"]]],
  ["PROBLEM_OPEN", [["Synthetic damaged item", "Synthetic open problem for UI audit", "stage"], ["No open problem orders"], ["Resolve"], []]],
  ["PROBLEM_RESOLVED", [["Synthetic assembly mismatch", "Synthetic resolution completed"], ["Resolve and return to work"], ["History"], ["Resolve and return to work"]]],
  ["DATA_DELETE_PREVIEW", [["Data Management", "PURGE QA OPERATIONAL DATA", "PREVIEWED"], ["Deleted"], [], []]],
  ["DATA_WRONG_PASSWORD", [["Reauthenticate", "password"], ["Authorized"], ["Cancel"], []]],
  ["DATA_CONFIRMATION_MISMATCH", [["Data Management", "Type exactly: QUARANTINE stage3-account-fk-01"], ["The authorized action completed"], [], []]],
  ["DATA_EXPIRED_GRANT", [["Data Management", "Owner password", "Confirmation phrase", "scoped and single-use"], ["The authorized action completed"], ["Purge QA operational data", "Cancel"], []]],
  ["DATA_REPLAY_REJECTED", [["You do not have permission to open this page"], ["Data Management", "Deletion History"], [], ["Purge", "Restore"]]],
  ["DATA_QUARANTINED", [["Trash / Quarantine", "QUARANTINE IMPORT SOURCE FILE", "COMPLETED", "retained until"], ["Trash / Quarantine is empty"], ["Restore quarantined files"], []]],
  ["DATA_RESTORED", [["Deletion History", "RESTORE QUARANTINED FILES", "COMPLETED"], ["No deletion actions have been recorded"], [], []]],
  ["DATA_RETENTION_BLOCKED", [["Trash / Quarantine", "Permanently purge after retention", "Unavailable while", "retention window"], ["Purge completed"], [], ["Permanently purge after retention"]]],
  ["DATA_PURGED", [["Deletion History", "PURGE QUARANTINED FILES", "PURGED"], ["No deletion actions have been recorded"], [], ["Restore quarantined files"]]],
  ["PERMISSION_OWNER", [["Work Hub"], ["Access Denied"], [], []]],
  ["PERMISSION_PICKER", [["Pick"], ["Worker users and sessions"], ["Details"], []]],
  ["PERMISSION_MARKER", [["Marking"], ["Complete Pick"], ["Details"], []]],
  ["PERMISSION_ASSEMBLER", [["Assembly"], ["Marking Completed"], ["Details"], []]],
  ["PERMISSION_PACKER", [["Packing"], ["Complete Pick"], ["Details"], []]],
  ["PERMISSION_VIEW_ONLY", [["Work Hub", "read-only"], ["Complete Pick", "Confirm packed"], ["Details"], ["Complete Pick", "Confirm packed"]]],
  ["PERMISSION_DENIED", [["You do not have permission to open this page"], ["Worker users and sessions"], [], ["Create user"]]],
]);

const ROUTE_VISIBLE = {
  "/": "Sign in",
  "/%5F%5Fqa/design-lab": "Live Design Lab",
  "/%5F%5Fqa/design-lab/[area]": "work cards",
  "/%5F%5Fqa/ui-audit": "UI Audit Studio",
  "/access-denied": "You do not have permission to open this page",
  "/accounts": "Choose seller account",
  "/change-password": "Change password",
  "/dashboard": "Warehouse overview",
  "/forgot-password": "Request owner reset",
  "/login": "Sign in",
  "/network-blocked": "outside the allowed local network",
  "/owner": "Owner",
  "/owner/accounts": "Marketplace accounts",
  "/owner/catalog/missing": "Missing Listings",
  "/owner/catalog/missing/[issueId]": "Create or link Product Inventory",
  "/owner/cleanup": "Cleanup temporary data",
  "/owner/consignments": "Consignments",
  "/owner/consignments/[batchId]": "Consignment detail",
  "/owner/consignments/[batchId]/issues": "issues",
  "/owner/consignments/[batchId]/listing/[lineId]": "Create Product Inventory and resolve line",
  "/owner/consignments/[batchId]/review": "Activation preview",
  "/owner/consignments/new": "Upload and preview",
  "/owner/data-management": "Data Management",
  "/owner/imports": "Imports",
  "/owner/imports/[jobId]": "Import Progress",
  "/owner/imports/[jobId]/issues": "Row issue drill-down",
  "/owner/imports/[jobId]/mapping": "Map File Headers",
  "/owner/manual-review": "Current data manual review",
  "/owner/marking-library": "Marking Library",
  "/owner/marking-library/[assetId]": "Synthetic Marking",
  "/owner/marking-library/new": "New marking asset",
  "/owner/old-pending": "Old pending review",
  "/owner/process-rules": "Product process rules",
  "/owner/product-inventory": "Product Inventory",
  "/owner/product-inventory/[listingId]": "STAGE-FK-SKU-001",
  "/owner/product-inventory/[listingId]/edit": "Edit Product Inventory Listing",
  "/owner/product-inventory/new": "Create Product Inventory Listing",
  "/owner/product-inventory/refresh": "Product Inventory Refresh",
  "/owner/sku-mappings": "Map SKU to product image URL",
  "/owner/sku-mappings/import": "Import SKU images / listings",
  "/owner/system": "System health",
  "/owner/uploads/[batchId]/review": "Flipkart import review",
  "/owner/uploads/new": "Upload marketplace files",
  "/owner/users": "Worker users and sessions",
  "/owner/work-route-summary": "Worker route decisions",
  "/packing": "Scan any authorized work code",
  "/packing/[awb]": "STAGE-AWB-9",
  "/picker": "Pick",
  "/picker/[sku]": "STAGE-FK-SKU-001",
  "/problems": "Problem order workflow",
  "/reports": "Operations reports",
  "/setup": "Create the first owner",
  "/work": "Work Hub",
  "/work/assemble": "Assembly",
  "/work/assembly": "Assembly",
  "/work/consignments/assemble": "Consignment Assembly",
  "/work/consignments/items/[taskId]": "Consignment item",
  "/work/consignments/pack": "Consignment Packing",
  "/work/consignments/pick": "Consignment Picking",
  "/work/groups/[stage]/[groupKey]": "details",
  "/work/mark": "Marking",
  "/work/marking": "Marking",
  "/work/marking/[taskId]": "marking",
  "/work/order-marking": "Order Marking",
  "/work/pack": "Packing",
  "/work/pick": "Picking",
  "/work/problems": "Work Problems",
  "/work/scan": "Universal Work Scan",
};

const DYNAMIC_EXAMPLES = {
  "/%5F%5Fqa/design-lab/[area]": "/__qa/design-lab/work-cards",
  "/owner/catalog/missing/[issueId]": "/owner/catalog/missing/stage4-missing-listing-issue",
  "/owner/consignments/[batchId]/issues": "/owner/consignments/stage3-batch-review_required/issues",
  "/owner/consignments/[batchId]/listing/[lineId]": "/owner/consignments/stage3-batch-review_required/listing/stage3-line-held-missing",
  "/owner/consignments/[batchId]/review": "/owner/consignments/stage3-batch-review_required/review",
  "/owner/consignments/[batchId]": "/owner/consignments/stage3-batch-active",
  "/owner/imports/[jobId]/issues": "/owner/imports/stage4-import-warnings/issues",
  "/owner/imports/[jobId]/mapping": "/owner/imports/stage4-import-mapping/mapping",
  "/owner/imports/[jobId]": "/owner/imports/stage4-import-completed",
  "/owner/marking-library/[assetId]": "/owner/marking-library/stage4-synthetic-marking-asset",
  "/owner/product-inventory/[listingId]/edit": "/owner/product-inventory/stage3-listing-fk-direct/edit",
  "/owner/product-inventory/[listingId]": "/owner/product-inventory/stage3-listing-fk-direct",
  "/owner/uploads/[batchId]/review": "/owner/uploads/stage4-upload-needs-mapping/review",
  "/packing/[awb]": "/packing/STAGE-AWB-9",
  "/picker/[sku]": "/picker/STAGE-FK-SKU-001",
  "/work/consignments/items/[taskId]": "/work/consignments/items/stage3-line-pick_pack-pack",
  "/work/groups/[stage]/[groupKey]": "/work/pick",
  "/work/marking/[taskId]": "/work/marking/stage3-line-pick_mark_pack-mark",
};

const EXPECTED_DESTINATIONS = Object.freeze({
  AUTH_INVALID: { url: "/login?error=invalid" },
  AUTH_EXPIRED: { url: "/login?expired=1", requiredQuery: { expired: "1" } },
  AUTH_FORBIDDEN: { url: "/access-denied" },
  DATA_REPLAY_REJECTED: { url: "/access-denied" },
});

function routeId(route) {
  return `ROUTE_${route.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "ROOT"}`;
}

function contract({
  id,
  route,
  role,
  fixtureIdentity,
  fixtureProbes,
  requiredVisible,
  forbiddenVisible,
  requiredActions,
  forbiddenActions,
  selectedAccount,
  expectedUrl,
  requiredQuery,
}) {
  return Object.freeze({
    id,
    route,
    expectedUrl: expectedUrl ?? DYNAMIC_EXAMPLES[route] ?? route,
    requiredQuery: Object.freeze({ ...(requiredQuery ?? {}) }),
    role,
    selectedAccount: role === "PUBLIC" || selectedAccount === null ? null : selectedAccount ?? "STAGE-FK-01",
    fixtureIdentity,
    fixtureProbes: fixtureProbes.map((probe) => ({ ...probe })),
    requiredVisible: [...requiredVisible],
    forbiddenVisible: [...forbiddenVisible],
    requiredActions: requiredActions.map((action) => typeof action === "string"
      ? { label: action, enabled: true }
      : { label: action.label, enabled: action.enabled !== false }),
    forbiddenActions: [...forbiddenActions],
  });
}

const namedContracts = REQUIRED_SCENARIOS.map((scenario) => {
  const assertions = NAMED_ASSERTIONS[scenario.id];
  if (!assertions) throw new Error(`Missing explicit named semantic contract for ${scenario.id}.`);
  const fixtureProbes = NAMED_FIXTURES[scenario.id];
  if (!fixtureProbes?.length) throw new Error(`Missing explicit named fixture probes for ${scenario.id}.`);
  const [requiredVisible, forbiddenVisible, requiredActions, forbiddenActions] = assertions;
  const destination = EXPECTED_DESTINATIONS[scenario.id];
  return contract({
    ...scenario,
    fixtureIdentity: fixtureProbes.map(fixtureProbeIdentity).join("+"),
    fixtureProbes,
    requiredVisible,
    forbiddenVisible,
    requiredActions,
    forbiddenActions,
    selectedAccount: ["AUTH_INVALID", "AUTH_EXPIRED"].includes(scenario.id)
      ? null
      : scenario.id === "IMPORT_AMAZON_THREE_ROLE" ? "STAGE-AMZ-01" : undefined,
    expectedUrl: destination?.url,
    requiredQuery: destination?.requiredQuery,
  });
});

export async function sourceRouteContracts(root) {
  const appRoot = path.join(root, "app");
  const files = await walkPages(appRoot);
  return files.map((file) => {
    const relative = path.relative(appRoot, file).replaceAll(path.sep, "/").replace(/\/?page\.tsx$/, "");
    const route = relative ? `/${relative}` : "/";
    if (!Object.hasOwn(ROUTE_VISIBLE, route)) throw new Error(`Missing explicit route semantic contract for ${route}.`);
    const publicRoute = ["/", "/login", "/forgot-password", "/setup", "/network-blocked"].includes(route);
    return contract({
      id: routeId(route),
      route,
      role: publicRoute ? "PUBLIC" : "OWNER",
      fixtureIdentity: `route:${route}`,
      fixtureProbes: dynamicRouteFixture(route, DYNAMIC_EXAMPLES[route] ?? route),
      requiredVisible: [ROUTE_VISIBLE[route]],
      forbiddenVisible: route === "/login" || route === "/" ? ["404"] : ["Sign in", "404"],
      requiredActions: [],
      forbiddenActions: [],
    });
  });
}

export async function semanticRegistry(root) {
  const routeContracts = await sourceRouteContracts(root);
  const contracts = [...namedContracts, ...routeContracts];
  const registry = new Map(contracts.map((item) => [item.id, item]));
  if (registry.size !== contracts.length) throw new Error("Semantic contract IDs are not unique.");
  return registry;
}

export function evaluateSemanticContract(item, evidence) {
  if (!item) return { passed: false, failures: ["MISSING_EXPLICIT_SEMANTIC_CONTRACT"] };
  const body = String(evidence?.bodyText ?? "").replace(/\s+/g, " ").trim();
  const actions = Array.isArray(evidence?.actions) ? evidence.actions : [];
  const failures = [];
  if (evidence?.role !== item.role) failures.push(`ROLE_MISMATCH:${evidence?.role ?? "missing"}`);
  if ((evidence?.selectedAccount ?? null) !== item.selectedAccount) failures.push("SELECTED_ACCOUNT_MISMATCH");
  const expectedPath = new URL(item.expectedUrl, "http://127.0.0.1").pathname;
  const actualUrl = new URL(evidence?.url ?? "/", "http://127.0.0.1");
  const actualPath = actualUrl.pathname;
  if (expectedPath !== actualPath) failures.push(`URL_MISMATCH:${actualPath}`);
  for (const [name, expected] of Object.entries(item.requiredQuery ?? {})) {
    if (actualUrl.searchParams.get(name) !== expected) failures.push(`QUERY_MISMATCH:${name}`);
  }
  for (const text of item.requiredVisible) if (!body.toLocaleLowerCase().includes(text.toLocaleLowerCase())) failures.push(`REQUIRED_VISIBLE_MISSING:${text}`);
  for (const text of item.forbiddenVisible) if (body.toLocaleLowerCase().includes(text.toLocaleLowerCase())) failures.push(`FORBIDDEN_VISIBLE_PRESENT:${text}`);
  for (const required of item.requiredActions) {
    const found = actions.find((action) => String(action.label).toLocaleLowerCase().includes(required.label.toLocaleLowerCase()));
    if (!found) failures.push(`REQUIRED_ACTION_MISSING:${required.label}`);
    else if (required.enabled && found.disabled) failures.push(`REQUIRED_ACTION_DISABLED:${required.label}`);
  }
  for (const label of item.forbiddenActions) {
    const found = actions.find((action) => String(action.label).toLocaleLowerCase().includes(label.toLocaleLowerCase()) && !action.disabled);
    if (found) failures.push(`FORBIDDEN_ACTION_ENABLED:${label}`);
  }
  return { passed: failures.length === 0, failures };
}

export async function semanticPreflight(root, {
  credentialRoles = Object.values(ROLE_TO_DISPLAY),
  accountCodes = ["STAGE-FK-01", "STAGE-AMZ-01"],
  databasePath = path.join(root, ".codex-tmp", "stage3-sanitized-staging", "database", "staging.db"),
  fixtureRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging", "fixtures"),
} = {}) {
  const registry = await semanticRegistry(root);
  const failures = [];
  if (registry.size !== 141) failures.push(`Expected 141 semantic contracts, found ${registry.size}.`);
  for (const item of registry.values()) {
    for (const field of ["id", "route", "expectedUrl", "role", "fixtureIdentity"]) {
      if (!item[field]) failures.push(`${item.id} has no ${field}.`);
    }
    for (const field of ["requiredVisible", "forbiddenVisible", "requiredActions", "forbiddenActions", "fixtureProbes"]) {
      if (!Array.isArray(item[field])) failures.push(`${item.id} has no explicit ${field}.`);
    }
    if (!item.requiredVisible.length) failures.push(`${item.id} has no state-specific visible assertion.`);
    if (!item.fixtureProbes.length) failures.push(`${item.id} has no explicit fixture probe.`);
  }
  const requiredRoles = new Set([...registry.values()].filter((item) => item.role !== "PUBLIC").map((item) => ROLE_TO_DISPLAY[item.role]));
  for (const role of requiredRoles) if (!credentialRoles.includes(role)) failures.push(`Missing credential mapping for ${role}.`);
  const requiredAccounts = new Set([...registry.values()].map((item) => item.selectedAccount).filter(Boolean));
  for (const account of requiredAccounts) if (!accountCodes.includes(account)) failures.push(`Missing account fixture ${account}.`);
  const fixtureFailures = verifyFixtures(registry, { databasePath, fixtureRoot });
  failures.push(...fixtureFailures);
  return {
    passed: failures.length === 0,
    semanticContracts: registry.size,
    fixtureMappings: [...registry.values()].filter((item) => item.fixtureIdentity && !fixtureFailures.some((failure) => failure.startsWith(`${item.id}:`))).length,
    failures,
    registry,
  };
}

function fixtureProbeIdentity(probe) {
  if (probe.kind === "record") return `${probe.table}.${probe.column}=${probe.value}`;
  if (probe.kind === "file") return `file:${probe.relativePath}`;
  return `route:${probe.route}`;
}

function dynamicRouteFixture(route, expectedUrl) {
  const segments = expectedUrl.split(/[/?=&]+/).filter(Boolean);
  const final = segments.at(-1) ?? "";
  const byRoute = {
    "/owner/catalog/missing/[issueId]": record("ImportRowIssue", "id", final),
    "/owner/consignments/[batchId]": record("ConsignmentBatch", "id", final),
    "/owner/consignments/[batchId]/issues": record("ConsignmentBatch", "id", segments.at(-2)),
    "/owner/consignments/[batchId]/review": record("ConsignmentBatch", "id", segments.at(-2)),
    "/owner/consignments/[batchId]/listing/[lineId]": record("ConsignmentLine", "id", final),
    "/owner/imports/[jobId]": record("ImportJob", "id", final),
    "/owner/imports/[jobId]/issues": record("ImportJob", "id", segments.at(-2)),
    "/owner/imports/[jobId]/mapping": record("ImportJob", "id", segments.at(-2)),
    "/owner/marking-library/[assetId]": record("MarkingAsset", "id", final),
    "/owner/product-inventory/[listingId]": record("MarketplaceListing", "id", final),
    "/owner/product-inventory/[listingId]/edit": record("MarketplaceListing", "id", segments.at(-2)),
    "/owner/uploads/[batchId]/review": record("UploadBatch", "id", segments.at(-2)),
    "/packing/[awb]": record("Order", "awb", final),
    "/picker/[sku]": record("MarketplaceListing", "sellerSkuId", final),
    "/work/consignments/items/[taskId]": record("WorkTask", "id", final),
    "/work/marking/[taskId]": record("WorkTask", "id", final),
  };
  return [byRoute[route] ?? routeFixture(route)];
}

function verifyFixtures(registry, { databasePath, fixtureRoot }) {
  const failures = [];
  if (!existsSync(databasePath)) return [`PREFLIGHT: synthetic fixture database does not exist: ${databasePath}`];
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    for (const account of new Set([...registry.values()].map((item) => item.selectedAccount).filter(Boolean))) {
      if (!database.prepare('SELECT 1 AS present FROM "Account" WHERE "code" = ? LIMIT 1').get(account)) {
        failures.push(`PREFLIGHT: selected account cannot be established: ${account}.`);
      }
    }
    for (const role of new Set([...registry.values()].map((item) => item.role).filter((item) => item !== "PUBLIC"))) {
      const userId = ROLE_USER_IDS[role];
      const activeUser = userId
        ? database.prepare('SELECT 1 AS present FROM "User" WHERE "id" = ? AND "active" = 1 LIMIT 1').get(userId)
        : null;
      if (!activeUser) failures.push(`PREFLIGHT: active synthetic user cannot establish role ${role}.`);
    }
    for (const item of registry.values()) {
      for (const probe of item.fixtureProbes) {
        if (probe.kind === "route") continue;
        if (probe.kind === "file") {
          if (!existsSync(path.join(fixtureRoot, ...probe.relativePath.split("/")))) {
            failures.push(`${item.id}: missing synthetic fixture file ${probe.relativePath}.`);
          }
          continue;
        }
        if (probe.kind !== "record") {
          failures.push(`${item.id}: unsupported fixture probe ${probe.kind}.`);
          continue;
        }
        try {
          const found = database.prepare(`SELECT * FROM "${probe.table}" WHERE "${probe.column}" = ? LIMIT 1`).get(probe.value);
          if (!found) failures.push(`${item.id}: missing synthetic record ${fixtureProbeIdentity(probe)}.`);
          else for (const [field, expectation] of Object.entries(probe.expected ?? {})) {
            const actual = found[field];
            const matches = expectation && typeof expectation === "object"
              ? (!Object.hasOwn(expectation, "gt") || Number(actual) > Number(expectation.gt))
                && (!Object.hasOwn(expectation, "lt") || Number(actual) < Number(expectation.lt))
                && (!Object.hasOwn(expectation, "ltColumn") || Number(actual) < Number(found[expectation.ltColumn]))
                && (!expectation.future || Number(actual) > Date.now())
              : actual === expectation;
            if (!matches) failures.push(`${item.id}: synthetic record ${fixtureProbeIdentity(probe)} has invalid ${field}.`);
          }
        } catch (error) {
          failures.push(`${item.id}: fixture probe failed for ${fixtureProbeIdentity(probe)} (${error instanceof Error ? error.message : String(error)}).`);
        }
      }
    }
  } finally {
    database?.close();
  }
  return failures;
}

async function walkPages(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walkPages(absolute));
    else if (entry.name === "page.tsx") output.push(absolute);
  }
  return output.sort();
}

export const semanticRegistryInternals = {
  NAMED_ASSERTIONS,
  NAMED_FIXTURES,
  ROLE_USER_IDS,
  ROUTE_VISIBLE,
  DYNAMIC_EXAMPLES,
  routeId,
  verifyFixtures,
};
