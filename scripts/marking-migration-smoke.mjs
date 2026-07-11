import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const tempRoot = resolve(root, ".codex-tmp");
const migrationsRoot = resolve(root, "prisma", "migrations");
const latestName = "20260711000100_marking_workflow_foundation";
mkdirSync(tempRoot, { recursive: true });

function migrationEntries() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function applyMigration(db, name) {
  db.exec(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

function openTemporary(name) {
  const file = resolve(tempRoot, name);
  if (!file.startsWith(`${tempRoot}\\`) && !file.startsWith(`${tempRoot}/`)) throw new Error("Unsafe smoke database path.");
  rmSync(file, { force: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  return { db, file };
}

const allEntries = migrationEntries();
const entries = allEntries.slice(0, allEntries.indexOf(latestName) + 1);
assert.ok(entries.includes(latestName), "Latest marking migration exists");

const fresh = openTemporary("marking-fresh-smoke.db");
for (const name of entries) applyMigration(fresh.db, name);
const freshTables = new Set(fresh.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
for (const table of ["MarketplaceListingIdentifier", "MarkingAsset", "MarkingAssetFile", "MarkingAssetListingLink", "ProductProcessRule", "WorkTask"]) assert.ok(freshTables.has(table), `Fresh migration creates ${table}`);
fresh.db.close();

const existing = openTemporary("marking-existing-smoke.db");
for (const name of entries.filter((name) => name !== latestName)) applyMigration(existing.db, name);
existing.db.exec(`
  INSERT INTO "Account" ("id", "name", "code", "companyName", "marketplace", "active", "createdAt", "updatedAt") VALUES ('acct_fake', 'Fake Account', 'FAKE', 'Test Company', 'FLIPKART', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO "User" ("id", "username", "passwordHash", "name", "role", "active", "createdAt", "updatedAt") VALUES ('user_fake', 'fake-user', 'not-a-real-password-hash', 'Fake User', 'PACKER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO "MarketplaceListing" ("id", "accountId", "marketplace", "sellerSkuId", "sku", "fsn", "listingId", "createdAt", "updatedAt") VALUES ('listing_fake', 'acct_fake', 'FLIPKART', 'SELLER-SKU-1', 'INTERNAL-SKU-1', 'FSN-FAKE-1', 'LISTING-FAKE-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO "UploadBatch" ("id", "accountId", "filename", "createdAt", "updatedAt") VALUES ('batch_fake', 'acct_fake', 'fake.xlsx', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO "Order" ("id", "accountId", "uploadBatchId", "awb", "sku", "quantity", "orderNumber", "createdAt", "updatedAt") VALUES ('order_fake', 'acct_fake', 'batch_fake', 'FAKEAWB001', 'SELLER-SKU-1', 1, 'FAKEORDER001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`);
applyMigration(existing.db, latestName);

const permissionRow = existing.db.prepare("SELECT canMark, canAssemble, canManageMarkingLibrary, canManageProcessRules, canViewAllWork FROM User WHERE id = 'user_fake'").get();
assert.deepEqual(Object.values(permissionRow), [0, 0, 0, 0, 0], "Existing user receives safe false permission defaults");
assert.equal(existing.db.prepare("SELECT count(*) AS count FROM MarketplaceListingIdentifier WHERE marketplaceListingId = 'listing_fake'").get().count, 4, "Existing listing receives four identifiers");
assert.equal(existing.db.prepare("SELECT count(*) AS count FROM WorkTask").get().count, 0, "Existing orders receive no WorkTask rows");
const order = existing.db.prepare("SELECT pickStatus, packStatus FROM 'Order' WHERE id = 'order_fake'").get();
assert.equal(order.pickStatus, "READY", "Existing pick state is preserved");
assert.equal(order.packStatus, "READY", "Existing pack state is preserved");

const latestSql = readFileSync(join(migrationsRoot, latestName, "migration.sql"), "utf8");
existing.db.exec(latestSql.slice(latestSql.indexOf('INSERT OR IGNORE INTO "MarketplaceListingIdentifier"')));
assert.equal(existing.db.prepare("SELECT count(*) AS count FROM MarketplaceListingIdentifier WHERE marketplaceListingId = 'listing_fake'").get().count, 4, "Identifier backfill remains idempotent");
existing.db.close();

rmSync(fresh.file, { force: true });
rmSync(existing.file, { force: true });
console.log("Marking migration smoke tests passed for fresh and existing-style SQLite databases.");
