import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, type IdentifierType, type Marketplace, type WorkStage, type WorkTaskStatus } from "@prisma/client";

export type Phase7ScalePreset = "small" | "medium" | "large" | "full";
export const PHASE7_SCALE_PRESETS = {
  small: { accounts: 2, listings: 5_000, tasks: 1_000, orders: 500 },
  medium: { accounts: 10, listings: 100_000, tasks: 5_000, orders: 2_500 },
  large: { accounts: 20, listings: 800_000, tasks: 10_000, orders: 10_000 },
  full: { accounts: 20, listings: 800_000, tasks: 12_000, orders: 12_000 }
} as const;

const identifiers: IdentifierType[] = ["SELLER_SKU", "FSN", "LISTING_ID", "ASIN", "FNSKU", "EXTERNAL_ID", "BARCODE"];
const chunk = <T>(items: T[], size = 1_000) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

function migrate(file: string) {
  rmSync(file, { force: true, maxRetries: 5, retryDelay: 100 });
  const sqlite = new DatabaseSync(file);
  sqlite.exec("PRAGMA foreign_keys=ON;");
  for (const name of readdirSync(resolve(process.cwd(), "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) sqlite.exec(readFileSync(join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  sqlite.close();
}

export async function createPhase7ScaleDatabase(preset: Phase7ScalePreset = "small") {
  const config = PHASE7_SCALE_PRESETS[preset];
  const root = resolve(process.cwd(), ".codex-tmp");
  mkdirSync(root, { recursive: true });
  const file = resolve(root, `phase7-${preset}.db`);
  migrate(file);
  const db = new PrismaClient({ datasourceUrl: `file:${file.replace(/\\/g, "/")}` });
  const now = new Date();
  const accounts = Array.from({ length: config.accounts }, (_, index) => ({ id: `p7-account-${index}`, name: `Phase 7 Account ${index}`, code: `P7-${index}`, companyName: "Synthetic QA", marketplace: (index % 2 ? "AMAZON" : "FLIPKART") as Marketplace, active: true }));
  await db.account.createMany({ data: accounts });
  await db.user.create({ data: { id: "p7-owner", username: "phase7-owner", passwordHash: "synthetic-not-a-login-hash", name: "Phase 7 Owner", role: "OWNER", active: true, canPick: true, canPack: true, canMark: true, canAssemble: true, canViewAllWork: true } });
  for (const account of accounts) await db.consignmentBatch.create({ data: { id: `p7-batch-${account.id}`, accountId: account.id, marketplace: account.marketplace, externalConsignmentNumber: `P7-CN-${account.id}`, displayName: "Synthetic scale batch", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: `synthetic-${account.id}`, activatedAt: now } });

  for (let offset = 0; offset < config.listings; offset += 1_000) {
    const count = Math.min(1_000, config.listings - offset);
    const listingRows = Array.from({ length: count }, (_, local) => {
      const index = offset + local; const account = accounts[index % accounts.length];
      return { id: `p7-listing-${index}`, accountId: account.id, marketplace: account.marketplace, sellerSkuId: `P7-SKU-${index}`, sku: `P7-SKU-${index}`, productTitle: `Synthetic product ${index}`, mainImageUrl: index % 5 ? `https://example.invalid/p7/${index}.png` : null };
    });
    await db.marketplaceListing.createMany({ data: listingRows });
    await db.marketplaceListingIdentifier.createMany({ data: listingRows.map((listing, local) => { const index = offset + local; const identifierType = identifiers[index % identifiers.length]; const value = index < accounts.length ? "P7-DUPLICATE-CODE" : `P7-${identifierType}-${index}`; return { id: `p7-identifier-${index}`, accountId: listing.accountId, marketplaceListingId: listing.id, marketplace: listing.marketplace as Marketplace, identifierType, rawValue: value, normalizedValue: value, active: true }; }) });
  }

  const orders = Array.from({ length: config.orders }, (_, index) => {
    const account = accounts[index % accounts.length];
    return { id: `p7-order-${index}`, accountId: account.id, marketplace: account.marketplace, awb: `P7-AWB-${index}`, trackingId: index < 3 ? "P7-TRACK-GROUP" : `P7-TRACK-${index}`, shipmentId: `P7-SHIP-${index}`, orderItemId: `P7-ITEM-${index}`, sku: `P7-SKU-${index % config.listings}`, qty: index % 4 + 1, orderNo: `P7-ORDER-${index}`, pickStatus: index % 3 ? "READY" as const : "PICKED" as const, packStatus: "READY" as const, importedAt: now };
  });
  for (const rows of chunk(orders)) await db.order.createMany({ data: rows });

  for (let offset = 0; offset < config.tasks; offset += 500) {
    const count = Math.min(500, config.tasks - offset);
    const lines = Array.from({ length: count }, (_, local) => { const index = offset + local; const account = accounts[index % accounts.length]; return { id: `p7-line-${index}`, consignmentBatchId: `p7-batch-${account.id}`, accountId: account.id, rowNumber: index + 1, requiredQuantity: index % 5 + 1, matchStatus: "EXACT_SKU" as const, marketplaceListingId: `p7-listing-${index % config.listings}`, processRoute: "PICK_PACK" as const, activated: true, sellerSkuSnapshot: `P7-SKU-${index % config.listings}`, fnskuSnapshot: `P7-FNSKU-${index}`, asinSnapshot: `B${String(index).padStart(9, "0")}`, externalIdSnapshot: `P7-EXTERNAL-${index}`, barcodeSnapshot: `8900${String(index).padStart(9, "0")}`, productTitleSnapshot: `Synthetic task product ${index}` }; });
    await db.consignmentLine.createMany({ data: lines });
    await db.workTask.createMany({ data: lines.map((line, local) => { const index = offset + local; const statuses: WorkTaskStatus[] = ["READY", "IN_PROGRESS", "PROBLEM", "COMPLETED"]; const stages: WorkStage[] = ["PICK", "MARK", "PACK"]; const status = index === config.tasks - 1 ? "READY" : statuses[index % statuses.length]; return { id: `p7-task-${index}`, accountId: line.accountId, sourceType: "CONSIGNMENT" as const, consignmentLineId: line.id, stage: stages[index % stages.length], sequenceNumber: 1, requiredQuantity: line.requiredQuantity, completedQuantity: status === "COMPLETED" ? line.requiredQuantity : 0, status, completedAt: status === "COMPLETED" ? now : null, assignedUserId: index === config.tasks - 1 ? "p7-owner" : null, problemReason: status === "PROBLEM" ? "OTHER" : null, problemReportedAt: status === "PROBLEM" ? now : null, problemReportedByUserId: status === "PROBLEM" ? "p7-owner" : null }; }) });
  }
  return { db, file, preset, config, accounts, databaseBytes: statSync(file).size };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase7-scale-data.ts")) {
  const preset = (process.argv[2] ?? "small") as Phase7ScalePreset;
  if (!(preset in PHASE7_SCALE_PRESETS)) throw new Error("Preset must be small, medium, large, or full.");
  const result = await createPhase7ScaleDatabase(preset);
  console.log(JSON.stringify({ preset, ...result.config, databaseBytes: result.databaseBytes, file: result.file }, null, 2));
  await result.db.$disconnect();
}
