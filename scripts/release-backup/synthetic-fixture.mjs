import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { ROOT, inspectSqliteDatabase, pathIsInside, sha256File } from "./core.mjs";

export const SYNTHETIC_IDS = Object.freeze({
  owner: "stage1-owner",
  worker: "stage1-worker",
  account: "stage1-account",
  listing: "stage1-listing",
  identifier: "stage1-identifier",
  order: "stage1-order",
  consignment: "stage1-consignment",
  consignmentLine: "stage1-consignment-line",
  orderTask: "stage1-order-task",
  consignmentTask: "stage1-consignment-task",
  importJob: "stage1-import-job",
  audit: "stage1-audit"
});

export const EXPECTED_SYNTHETIC_COUNTS = Object.freeze({
  User: 2,
  Account: 1,
  MarketplaceListing: 1,
  MarketplaceListingIdentifier: 1,
  Order: 1,
  ConsignmentBatch: 1,
  ConsignmentLine: 1,
  WorkTask: 2,
  ImportJob: 1,
  AuditLog: 1
});

function databaseUrl(databasePath) {
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

export function runCurrentMigrations(databasePath) {
  if (!pathIsInside(path.resolve(ROOT, ".codex-tmp", "stage1-backup"), databasePath)) throw new Error("Synthetic migration target escaped Stage 1 storage.");
  const migrationsRoot = path.join(ROOT, "prisma", "migrations");
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec('CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL, "finished_at" DATETIME, "migration_name" TEXT NOT NULL, "logs" TEXT, "rolled_back_at" DATETIME, "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "applied_steps_count" INTEGER NOT NULL DEFAULT 0)');
    const record = database.prepare('INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (?,?,?,?,1)');
    for (const [index, migrationName] of migrations.entries()) {
      const sql = readFileSync(path.join(migrationsRoot, migrationName, "migration.sql"), "utf8");
      database.exec(sql);
      record.run(`stage1-${index}`, createHash("sha256").update(sql).digest("hex"), new Date().toISOString(), migrationName);
    }
  } finally {
    database.close();
  }
}

function seedSyntheticRows(database) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare('INSERT INTO "Account" ("id","name","code","companyName","marketplace","accountDisplayName","accountCode","active","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.account, "Synthetic Stage 1 Account", "S1A", "Synthetic Warehouse", "FLIPKART", "Synthetic Account", "S1", 1);
    database.prepare('INSERT INTO "User" ("id","username","passwordHash","name","role","active","canPick","canPack","canReportProblem","accountId","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.owner, "stage1-owner", "synthetic-not-a-real-password-hash", "Synthetic Owner", "OWNER", 1, 0, 0, 1, SYNTHETIC_IDS.account);
    database.prepare('INSERT INTO "User" ("id","username","passwordHash","name","role","active","canPick","canPack","canReportProblem","accountId","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.worker, "stage1-worker", "synthetic-not-a-real-password-hash", "Synthetic Worker", "PICKER", 1, 1, 0, 1, SYNTHETIC_IDS.account);
    database.prepare('INSERT INTO "MarketplaceListing" ("id","accountId","marketplace","sellerSkuId","sku","productTitle","createdAt","updatedAt") VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.listing, SYNTHETIC_IDS.account, "FLIPKART", "FAKE-SKU-001", "FAKE-SKU-001", "Synthetic Listing");
    database.prepare('INSERT INTO "MarketplaceListingIdentifier" ("id","accountId","marketplaceListingId","marketplace","identifierType","rawValue","normalizedValue","source","active","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.identifier, SYNTHETIC_IDS.account, SYNTHETIC_IDS.listing, "FLIPKART", "SELLER_SKU", "FAKE-SKU-001", "FAKE-SKU-001", "SYNTHETIC_STAGE1", 1);
    database.prepare('INSERT INTO "Order" ("id","accountId","marketplace","shipmentId","orderItemId","trackingId","awb","sku","quantity","orderNumber","productDescription","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.order, SYNTHETIC_IDS.account, "FLIPKART", "FAKE-SHIPMENT-001", "FAKE-ITEM-001", "FAKE-TRACK-001", "FAKE-AWB-001", "FAKE-SKU-001", 2, "FAKE-ORDER-001", "Synthetic order");
    database.prepare('INSERT INTO "ConsignmentBatch" ("id","accountId","marketplace","externalConsignmentNumber","displayName","status","sourceFileName","sourceFileSha256","totalSourceRows","totalValidLines","totalRequiredQuantity","matchedLines","createdByUserId","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.consignment, SYNTHETIC_IDS.account, "FLIPKART", "FAKE-CONSIGNMENT-001", "Synthetic Consignment", "ACTIVE", "synthetic-consignment.csv", "0".repeat(64), 1, 1, 3, 1, SYNTHETIC_IDS.owner);
    database.prepare('INSERT INTO "ConsignmentLine" ("id","consignmentBatchId","accountId","rowNumber","sellerSkuSource","requiredQuantity","marketplaceListingId","matchStatus","matchIdentifierType","matchIdentifierValue","activated","sellerSkuSnapshot","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.consignmentLine, SYNTHETIC_IDS.consignment, SYNTHETIC_IDS.account, 2, "FAKE-SKU-001", 3, SYNTHETIC_IDS.listing, "EXACT_SKU", "SELLER_SKU", "FAKE-SKU-001", 1, "FAKE-SKU-001");
    database.prepare('INSERT INTO "WorkTask" ("id","accountId","sourceType","orderId","stage","sequenceNumber","requiredQuantity","completedQuantity","status","assignedUserId","version","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.orderTask, SYNTHETIC_IDS.account, "ORDER", SYNTHETIC_IDS.order, "PICK", 1, 2, 0, "READY", SYNTHETIC_IDS.worker, 1);
    database.prepare('INSERT INTO "WorkTask" ("id","accountId","sourceType","consignmentLineId","stage","sequenceNumber","requiredQuantity","completedQuantity","status","assignedUserId","version","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.consignmentTask, SYNTHETIC_IDS.account, "CONSIGNMENT", SYNTHETIC_IDS.consignmentLine, "PICK", 1, 3, 0, "READY", SYNTHETIC_IDS.worker, 1);
    database.prepare('INSERT INTO "ImportJob" ("id","accountId","createdByUserId","marketplace","importType","fileName","filePath","status","stage","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.importJob, SYNTHETIC_IDS.account, SYNTHETIC_IDS.owner, "FLIPKART", "FLIPKART_ORDER", "synthetic-orders.csv", "storage/import-jobs/fake-job/synthetic-orders.csv", "COMPLETED", "COMPLETED");
    database.prepare('INSERT INTO "AuditLog" ("id","userId","accountId","action","entityType","entityId","metadata","createdAt") VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(SYNTHETIC_IDS.audit, SYNTHETIC_IDS.owner, SYNTHETIC_IDS.account, "STAGE1_SYNTHETIC_FIXTURE", "ReleaseBackup", "synthetic", JSON.stringify({ synthetic: true }));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function createSyntheticFixture(runRoot) {
  const sourceRoot = path.join(runRoot, "source");
  const databasePath = path.join(sourceRoot, "app.db");
  const storageRoot = path.join(sourceRoot, "storage");
  await mkdir(storageRoot, { recursive: true });
  runCurrentMigrations(databasePath);

  const writer = new DatabaseSync(databasePath);
  writer.exec("PRAGMA journal_mode = WAL");
  writer.exec("PRAGMA wal_autocheckpoint = 0");
  const pinnedReader = new DatabaseSync(databasePath, { readOnly: true });
  pinnedReader.exec("BEGIN");
  pinnedReader.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations"').get();
  seedSyntheticRows(writer);
  writer.close();

  const files = [
    ["import-jobs/fake-job/synthetic-orders.csv", "synthetic-order-id,synthetic-sku\nFAKE-ITEM-001,FAKE-SKU-001\n"],
    ["marking-library/fake-asset/guide.txt", "Synthetic marking instructions only.\n"],
    ["images/fake-listing/image.txt", "Synthetic image placeholder only.\n"],
    ["images/fake-listing/zero-byte.bin", ""],
    ["images/fake-listing/यूनिकोड-file.txt", "Synthetic Unicode filename.\n"],
    [`import-jobs/fake-job/${"long-safe-name-".repeat(8)}.txt`, "Synthetic long safe relative path.\n"]
  ];
  for (const [relativePath, content] of files) {
    const target = path.join(storageRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { flag: "wx" });
  }

  return { sourceRoot, databasePath, storageRoot, pinnedReader, expectedStorageFiles: files.map(([relativePath]) => relativePath).sort() };
}

export async function demonstrateUnsafeMainFileCopy(databasePath, destination) {
  await copyFile(databasePath, destination);
  let incomplete = false;
  try {
    const unsafe = new DatabaseSync(destination, { readOnly: true });
    try {
      incomplete = Number(unsafe.prepare('SELECT COUNT(*) AS count FROM "Order"').get().count) !== EXPECTED_SYNTHETIC_COUNTS.Order;
    } finally {
      unsafe.close();
    }
  } catch {
    incomplete = true;
  }
  if (!incomplete) throw new Error("Unsafe main-file-only copy unexpectedly contained the WAL-only synthetic commit.");
  return { unsafeMainFileCopyIncomplete: true };
}

export function verifySyntheticDatabase(databasePath) {
  const inspection = inspectSqliteDatabase(databasePath);
  for (const [table, expected] of Object.entries(EXPECTED_SYNTHETIC_COUNTS)) {
    if (inspection.tableCounts[table] !== expected) throw new Error(`Synthetic verification count mismatch for ${table}.`);
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const selected = [
      database.prepare('SELECT id FROM "User" WHERE id = ?').get(SYNTHETIC_IDS.owner),
      database.prepare('SELECT id FROM "Order" WHERE id = ?').get(SYNTHETIC_IDS.order),
      database.prepare('SELECT id FROM "ConsignmentLine" WHERE id = ?').get(SYNTHETIC_IDS.consignmentLine),
      database.prepare('SELECT id FROM "WorkTask" WHERE id = ?').get(SYNTHETIC_IDS.consignmentTask)
    ];
    if (selected.some((row) => !row)) throw new Error("A selected high-value synthetic record is missing.");
  } finally {
    database.close();
  }
  return { inspection, countsVerified: true, selectedRecordsVerified: true };
}

export async function verifySyntheticStorage(sourceRoot, restoredRoot, expectedRelativePaths) {
  for (const relativePath of expectedRelativePaths) {
    const source = path.join(sourceRoot, ...relativePath.split("/"));
    const restored = path.join(restoredRoot, ...relativePath.split("/"));
    if (!existsSync(restored) || await sha256File(source) !== await sha256File(restored)) throw new Error("A restored synthetic private file does not match its source hash.");
  }
  return { restoredFileHashesVerified: true, fileCount: expectedRelativePaths.length };
}

export async function verifyWithPrismaReadOnly(databasePath) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
  try {
    const [accounts, users, listings, orders, consignments, tasks, jobs, audits] = await Promise.all([
      prisma.account.count(), prisma.user.count(), prisma.marketplaceListing.count(), prisma.order.count(),
      prisma.consignmentBatch.count(), prisma.workTask.count(), prisma.importJob.count(), prisma.auditLog.count()
    ]);
    const expected = [1, 2, 1, 1, 1, 2, 1, 1];
    if ([accounts, users, listings, orders, consignments, tasks, jobs, audits].some((value, index) => value !== expected[index])) throw new Error("Prisma read-only verification returned unexpected synthetic counts.");
    return { prismaReadOnlyVerificationPassed: true };
  } finally {
    await prisma.$disconnect();
  }
}
