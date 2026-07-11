import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentifierType } from "@prisma/client";
import { hasWorkPermission } from "../lib/work-permissions";
import { findListingMatchesByIdentifiers, listingIdentifierRows, normalizeListingIdentifier } from "../src/lib/marking/identifiers";
import { processRouteRequirements, validateProcessRule } from "../src/lib/marking/process-rules";
import { MARKING_FILE_MAX_BYTES, calculateSha256, resolveManagedMarkingPath, validateMarkingFileMetadata, writeMarkingAssetFile } from "../src/lib/marking/storage";
import { buildTaskPlan, canAdvanceTask, getNextStage, getRequiredStages, validateTaskTransition } from "../src/lib/workflow/tasks";
import { actionableScanCandidate, prepareUniversalScanCode } from "../src/lib/workflow/scan-contract";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const permissionDefaults = { canPick: false, canMark: false, canAssemble: false, canPack: false, canReportProblem: false, canManageMarkingLibrary: false, canManageProcessRules: false, canViewAllWork: false, canViewConsignments: false, canImportConsignments: false, canManageConsignments: false };

assert.equal(hasWorkPermission({ role: "OWNER", ...permissionDefaults }, "canManageMarkingLibrary"), true, "Owner bypass grants marking management");
assert.equal(hasWorkPermission({ role: "PACKER", ...permissionDefaults, canManageMarkingLibrary: true }, "canManageMarkingLibrary"), true, "Explicit marking manager permission works");
assert.equal(hasWorkPermission({ role: "PICKER", ...permissionDefaults, canMark: true }, "canManageMarkingLibrary"), false, "Marking stage permission does not imply library management");
assert.equal(hasWorkPermission({ role: "PACKER", ...permissionDefaults, canAssemble: true }, "canManageProcessRules"), false, "Assembly stage permission does not imply rule management");
assert.equal(hasWorkPermission({ role: "PICKER", ...permissionDefaults }, "canPick"), true, "Existing picker role still picks");
assert.equal(hasWorkPermission({ role: "PACKER", ...permissionDefaults }, "canPack"), true, "Existing packer role still packs");

assert.equal(normalizeListingIdentifier(IdentifierType.SELLER_SKU, " sku- 01 "), "SKU- 01", "SKU normalization is deterministic without destructive hyphen removal");
assert.equal(normalizeListingIdentifier(IdentifierType.GTIN, " 123-456 789 "), "123456789", "Barcode-like identifiers remove harmless spaces and hyphens");
assert.equal(normalizeListingIdentifier(IdentifierType.FSN, "   "), null, "Blank identifiers are rejected");
assert.equal(normalizeListingIdentifier(IdentifierType.BARCODE, "x".repeat(161)), null, "Oversize identifiers are rejected");
const rows = listingIdentifierRows({ id: "listing-1", accountId: "account-1", marketplace: "FLIPKART", sellerSkuId: "SKU-1", sku: "INT-1", fsn: "FSN1", listingId: "LID1" });
assert.deepEqual(rows.map((row) => row.identifierType), ["SELLER_SKU", "INTERNAL_SKU", "FSN", "LISTING_ID"], "Current listing fields map to generic identifiers");
assert.match(findListingMatchesByIdentifiers.toString(), /accountId:input\.accountId/, "Identifier lookup is account scoped");
assert.match(findListingMatchesByIdentifiers.toString(), /EXACT_MULTIPLE/, "Ambiguous exact matches are returned without auto-selection");

assert.deepEqual(getRequiredStages("PICK_PACK"), ["PICK", "PACK"]);
assert.deepEqual(getRequiredStages("PICK_MARK_PACK"), ["PICK", "MARK", "PACK"]);
assert.deepEqual(getRequiredStages("PICK_ASSEMBLE_PACK"), ["PICK", "ASSEMBLE", "PACK"]);
assert.deepEqual(getRequiredStages("PICK_MARK_ASSEMBLE_PACK"), ["PICK", "MARK", "ASSEMBLE", "PACK"]);
assert.deepEqual(buildTaskPlan("PICK_MARK_PACK", 2).map((task) => task.status), ["READY", "LOCKED", "LOCKED"], "Only first planned stage is ready");
assert.equal(getNextStage("PICK_MARK_ASSEMBLE_PACK", "MARK"), "ASSEMBLE", "Only next route stage is selected");
assert.equal(canAdvanceTask({ status: "LOCKED", requiredQuantity: 1, completedQuantity: 0 }, 1), false, "Locked task cannot advance");
assert.equal(validateTaskTransition({ status: "READY", requiredQuantity: 1, completedQuantity: 0 }, 2).valid, false, "Completed quantity cannot exceed required quantity");
assert.equal(validateTaskTransition({ status: "COMPLETED", requiredQuantity: 1, completedQuantity: 1 }, 1).valid, true, "Completed transition is idempotent");

assert.equal(validateProcessRule({ route: "PICK_MARK_PACK" }).valid, false, "Mark route requires marking asset");
assert.equal(validateProcessRule({ route: "PICK_ASSEMBLE_PACK", assemblyTitle: "Attach base" }).valid, true, "Assembly route accepts assembly configuration");
assert.equal(validateProcessRule({ route: "PICK_PACK", markingAssetId: "asset" }).valid, false, "Ready-made route cannot retain marking asset");
assert.equal(validateProcessRule({ route: "PICK_ASSEMBLE_PACK", assemblyTitle: "Attach base", assemblyImageUrl: "file:///private/image.png" }).valid, false, "Assembly image rejects non-web URL schemes");
assert.deepEqual(processRouteRequirements("PICK_MARK_ASSEMBLE_PACK"), { markingRequired: true, assemblyRequired: true });

assert.throws(() => validateMarkingFileMetadata({ name: "unsafe.exe", size: 10, attachmentType: "MARKING_FILE" }), /not allowed/i, "Executable upload is blocked");
assert.throws(() => validateMarkingFileMetadata({ name: "empty.ezd", size: 0, attachmentType: "MARKING_FILE" }), /empty/i, "Zero-byte upload is blocked");
assert.throws(() => validateMarkingFileMetadata({ name: "large.ezd", size: MARKING_FILE_MAX_BYTES + 1, attachmentType: "MARKING_FILE" }), /limit/i, "Oversize upload is blocked before buffering");
assert.throws(() => resolveManagedMarkingPath("../private.txt"), /escapes/i, "Filename traversal is blocked");

const tempRoot = mkdtempSync(join(tmpdir(), "marking-foundation-"));
process.env.MARKING_LIBRARY_ROOT = tempRoot;
const fakeBytes = new Uint8Array([1, 2, 3, 4, 5]);
const stored = await writeMarkingAssetFile({ markingAssetId: "asset_test_1", fileId: "file_test_1", attachmentType: "MARKING_FILE", file: new File([fakeBytes], "fake-design.ezd", { type: "application/octet-stream" }) });
assert.equal(stored.sha256, calculateSha256(fakeBytes), "Managed upload stores SHA-256");
assert.equal(stored.managedRelativePath.includes(tempRoot), false, "Database metadata never contains absolute storage root");
assert.equal(stored.originalFileName, "fake-design.ezd", "Safe original filename is metadata only");
rmSync(tempRoot, { recursive: true, force: true });
delete process.env.MARKING_LIBRARY_ROOT;

assert.equal(prepareUniversalScanCode(" sku-1 "), "SKU-1", "Future scanner contract normalizes exact code");
assert.equal(actionableScanCandidate({ status: "COMPLETED" }), false, "Completed work is not actionable in future scan contract");
assert.equal(actionableScanCandidate({ status: "READY" }), true, "Ready work remains actionable");

const sqliteMigration = read("prisma", "migrations", "20260711000100_marking_workflow_foundation", "migration.sql");
const postgresMigration = read("prisma", "migrations-postgres", "20260711000100_marking_workflow_foundation", "migration.sql");
const schema = read("prisma", "schema.prisma");
const actions = read("app", "owner", "marking-library", "actions.ts");
const download = read("app", "owner", "marking-library", "[assetId]", "files", "[fileId]", "route.ts");
const processRules = read("src", "lib", "marking", "process-rules.ts");
const storage = read("src", "lib", "marking", "storage.ts");

assert.match(sqliteMigration, /INSERT OR IGNORE INTO "MarketplaceListingIdentifier"/, "SQLite backfill is idempotent");
assert.match(postgresMigration, /ON CONFLICT DO NOTHING/, "PostgreSQL backfill is idempotent");
assert.doesNotMatch(sqliteMigration, /INSERT INTO "WorkTask"/, "Migration does not activate tasks for existing orders");
assert.doesNotMatch(sqliteMigration, /UPDATE "Order"|ALTER TABLE "Order"/, "Migration does not mutate existing order state");
assert.match(sqliteMigration, /one_active_listing_key[\s\S]*WHERE "active" = true/, "One active process rule is enforced per listing");
assert.match(sqliteMigration, /one_active_type_key[\s\S]*WHERE "activeVersion" = true/, "One active file version is enforced per asset attachment type");
assert.match(actions, /requireWorkPermission\("canManageMarkingLibrary"\)/, "Every marking management action authenticates permission");
assert.match(actions, /accountId: account\.id/, "Marking actions use selected account context");
assert.match(download, /getCurrentUser[\s\S]*canManageMarkingLibrary[\s\S]*getSelectedAccount/, "Private download authenticates permission and account");
assert.match(download, /X-Content-Type-Options[\s\S]*nosniff/, "Private download uses nosniff");
assert.doesNotMatch(download, /managedRelativePath[\s\S]*new Response\([^)]*managedRelativePath/, "Download never returns managed path text");
assert.match(processRules, /id: input\.marketplaceListingId, accountId: input\.accountId/, "Process rule listing is account-scoped");
assert.match(processRules, /updateMany[\s\S]*active: false[\s\S]*productProcessRule\.create/, "Rule replacement disables old active rule transactionally");
assert.match(storage, /BLOCKED_EXTENSIONS[\s\S]*\.exe[\s\S]*\.ps1/, "Storage has explicit executable/script blocklist");
assert.doesNotMatch(schema, /model (InventoryBalance|InventoryLedger|BranchStock|WarehouseStock|AvailableQuantity|ReservedQuantity|DestinationReceiving|QualityCheck|StockAdjustment|StockValuation|InTransitInventory)/, "No inventory-management model was introduced");

console.log("Marking foundation tests passed.");
