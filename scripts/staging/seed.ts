import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type ProcessRoute, type WorkStage, type WorkTaskStatus } from "@prisma/client";
import { hashPassword } from "../../lib/password";
import { rebuildWorkGroupProjection } from "../../src/lib/workflow/work-group-projection";

const prisma = new PrismaClient();
const credentialPath = process.env.STAGING_CREDENTIAL_PATH;
const fixtureRoot = process.env.STAGING_FIXTURES_ROOT;
const importStorageRoot = process.env.IMPORT_JOB_STORAGE_ROOT;
const productImageStorageRoot = process.env.PRODUCT_IMAGE_STORAGE_ROOT;
if (!credentialPath || !fixtureRoot || !importStorageRoot || !productImageStorageRoot || !process.env.STAGE3_SYNTHETIC_STAGING) throw new Error("Synthetic seed may run only inside the Stage 3 environment.");

const accounts = [
  { id: "stage3-account-fk-01", name: "Synthetic Flipkart Primary", code: "STAGE-FK-01", marketplace: "FLIPKART", active: true },
  { id: "stage3-account-amz-01", name: "Synthetic Amazon Primary", code: "STAGE-AMZ-01", marketplace: "AMAZON", active: true },
  { id: "stage3-account-fk-02", name: "Synthetic Flipkart Isolation", code: "STAGE-FK-02", marketplace: "FLIPKART", active: true },
  { id: "stage3-account-inactive", name: "Synthetic Inactive Account", code: "STAGE-INACTIVE-01", marketplace: "FLIPKART", active: false }
] as const;

const users = [
  { id: "stage3-owner", display: "Synthetic Owner", username: "stage3-owner", role: "OWNER", scenario: "OWNER", account: accounts[0].id, active: true, permissions: {} },
  { id: "stage3-import-manager", display: "Synthetic Import Manager", username: "stage3-import-manager", role: "PICKER", scenario: "IMPORT_MANAGER", account: accounts[0].id, active: true, permissions: { canImportConsignments: true, canManageConsignments: true, canViewConsignments: true } },
  { id: "stage3-picker-a", display: "Synthetic Picker A", username: "stage3-picker-a", role: "PICKER", scenario: "PICKER", account: accounts[0].id, active: true, permissions: { canPick: true, canReportProblem: true } },
  { id: "stage3-picker-b", display: "Synthetic Picker B", username: "stage3-picker-b", role: "PICKER", scenario: "PICKER_B", account: accounts[0].id, active: true, permissions: { canPick: true, canReportProblem: true } },
  { id: "stage3-marker", display: "Synthetic Marker", username: "stage3-marker", role: "PICKER", scenario: "MARKER", account: accounts[0].id, active: true, permissions: { canMark: true, canReportProblem: true } },
  { id: "stage3-assembler", display: "Synthetic Assembler", username: "stage3-assembler", role: "PICKER", scenario: "ASSEMBLER", account: accounts[0].id, active: true, permissions: { canAssemble: true, canReportProblem: true } },
  { id: "stage3-packer-a", display: "Synthetic Packer A", username: "stage3-packer-a", role: "PACKER", scenario: "PACKER", account: accounts[0].id, active: true, permissions: { canPack: true, canReportProblem: true } },
  { id: "stage3-packer-b", display: "Synthetic Packer B", username: "stage3-packer-b", role: "PACKER", scenario: "PACKER_B", account: accounts[0].id, active: true, permissions: { canPack: true, canReportProblem: true } },
  { id: "stage3-view-all", display: "Synthetic View-All Worker", username: "stage3-view-all", role: "PICKER", scenario: "VIEW_ALL", account: accounts[0].id, active: true, permissions: { canViewAllWork: true, canViewConsignments: true } },
  { id: "stage3-disabled", display: "Synthetic Disabled Worker", username: "stage3-disabled", role: "PICKER", scenario: "DISABLED", account: accounts[0].id, active: false, permissions: { canPick: true } },
  { id: "stage3-pick-pack", display: "Synthetic Pick + Pack Worker", username: "stage3-pick-pack", role: "PICKER", scenario: "PICK_PACK", account: accounts[0].id, active: true, permissions: { canPick: true, canPack: true, canReportProblem: true } },
  { id: "stage3-no-account", display: "Synthetic No-Account Worker", username: "stage3-no-account", role: "PICKER", scenario: "NO_ACCOUNT", account: null, active: true, permissions: { canPick: true } },
  { id: "stage3-owner-no-account", display: "Synthetic No-Account Owner", username: "stage3-owner-no-account", role: "OWNER", scenario: "OWNER_NO_ACCOUNT", account: null, active: true, permissions: {} },
  { id: "stage4-pick-view-all", display: "Synthetic Pick Read-Only Reviewer", username: "stage4-pick-view-all", role: "PICKER", scenario: "C1_PICK_READ_ONLY", account: accounts[0].id, active: true, permissions: { canPick: true, canViewAllWork: true } }
] as const;

const listings = [
  ["fk-direct", "STAGE-FK-SKU-001", "Synthetic Direct Pack Product", "PICK_PACK"],
  ["fk-mark", "STAGE-FK-SKU-002", "Synthetic Marking Product", "PICK_MARK_PACK"],
  ["fk-assembly", "STAGE-FK-SKU-003", "Synthetic Assembly Product", "PICK_ASSEMBLE_PACK"],
  ["fk-mark-assembly", "STAGE-FK-SKU-004", "Synthetic Mark and Assembly Product", "PICK_MARK_ASSEMBLE_PACK"],
  ["fk-fallback", "STAGE-FK-SKU-005", "Synthetic System Fallback Product", null],
  ["fk-missing-image", "STAGE-FK-SKU-006", "Synthetic Missing Image Product", "PICK_PACK"],
  ["fk-broken-image", "STAGE-FK-SKU-007", "Synthetic Broken Image Product", "PICK_PACK"],
  ["fk-gallery", "STAGE-FK-SKU-008", "Synthetic Gallery Product", "PICK_PACK"],
  ["fk-inactive", "STAGE-FK-SKU-009", "Synthetic Inactive Listing", "PICK_PACK"],
  ["fk-locked", "STAGE-FK-SKU-010", "Synthetic Manually Locked Product", "PICK_PACK"],
  ["fk-archived", "STAGE-FK-SKU-011", "Synthetic Archived Listing", "PICK_PACK"],
  ["fk-error", "STAGE-FK-SKU-012", "Synthetic Processing Error Listing", "PICK_PACK"]
] as const;

function snapshot(sku: string, title: string, route: string | null) {
  return JSON.stringify({ sellerSku: sku, productTitle: title, primaryImage: sku.endsWith("006") ? null : `/stage3/${sku}.svg`, routeRecommendation: route ?? "PICK_PACK", routeRecommendationSource: route ? "PRODUCT_RULE" : "SYSTEM_FALLBACK", hasExplicitSavedRoute: Boolean(route), savedProcessRoute: route, synthetic: true });
}

function routeSnapshot(route: string | null, currentStage: WorkStage) {
  return JSON.stringify({ version: 3, routeRecommendation: route ?? "PICK_PACK", routeRecommendationSource: route ? "EXPLICIT_PRODUCT_RULE" : "SYSTEM_FALLBACK", hasExplicitSavedRoute: Boolean(route), selectedProcessRoute: route ?? "PICK_PACK", currentStage, completedStages: [], decision: "SYNTHETIC_SEED" });
}

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP4z8DAwMDAxMDAwMAAAAwAAf4C/qkAAAAASUVORK5CYII=",
  "base64"
);

function syntheticImageRoute(safeSku: string) {
  return `/product-images/meesho/${accounts[0].id}/${safeSku}/card.png`;
}

async function writeSyntheticImage(safeSku: string) {
  const directory = path.join(productImageStorageRoot!, "meesho", accounts[0].id, safeSku);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "card.png"), syntheticPng, { flag: "wx" });
}

async function createTask(input: { id: string; accountId?: string; orderId?: string; consignmentLineId?: string; sourceType?: "ORDER" | "CONSIGNMENT"; stage: WorkStage; sequence: number; status: WorkTaskStatus; quantity?: number; completed?: number; assigned?: string; sku: string; title: string; route: string | null; problem?: string; metadataJson?: string }) {
  return prisma.workTask.create({ data: {
    id: input.id, accountId: input.accountId ?? accounts[0].id, sourceType: input.sourceType ?? "ORDER", orderId: input.orderId, consignmentLineId: input.consignmentLineId,
    stage: input.stage, sequenceNumber: input.sequence, requiredQuantity: input.quantity ?? 1, completedQuantity: input.completed ?? (input.status === "COMPLETED" ? input.quantity ?? 1 : 0), status: input.status,
    assignedUserId: input.assigned, startedByUserId: input.status === "IN_PROGRESS" ? input.assigned : undefined, startedAt: input.status === "IN_PROGRESS" ? new Date() : undefined,
    completedByUserId: input.status === "COMPLETED" ? input.assigned ?? users[0].id : undefined, completedAt: input.status === "COMPLETED" ? new Date() : undefined,
    problemReason: input.problem, problemReportedAt: input.problem ? new Date() : undefined, problemReportedByUserId: input.problem ? input.assigned ?? users[0].id : undefined,
    statusBeforeProblem: input.problem ? "READY" : undefined, metadataJson: input.metadataJson ?? JSON.stringify({ synthetic: true, processRoute: input.route ?? "PICK_PACK", instruction: input.stage === "MARK" ? "Use synthetic marking guide." : input.stage === "ASSEMBLE" ? "Use synthetic assembly guide." : null }),
    workCardSnapshotJson: snapshot(input.sku, input.title, input.route), routeSnapshotJson: routeSnapshot(input.route, input.stage)
  } });
}

async function seed() {
  for (const account of accounts) await prisma.account.create({ data: { ...account, marketplace: account.marketplace as "FLIPKART" | "AMAZON", companyName: "Synthetic Warehouse", accountDisplayName: account.name, accountCode: account.code, notes: "SYNTHETIC STAGING ONLY" } });
  const credentialRows = [];
  for (const user of users) {
    const password = `S3!${randomBytes(18).toString("base64url")}`;
    await prisma.user.create({ data: { id: user.id, username: user.username, passwordHash: hashPassword(password), name: user.display, role: user.role as "OWNER" | "PICKER" | "PACKER", active: user.active, accountId: user.account ?? undefined, assignedAccounts: user.account ? { connect: [{ id: user.account }] } : undefined, ...user.permissions } });
    credentialRows.push({ displayRole: user.display, username: user.username, password, assignedAccount: accounts.find((item) => item.id === user.account)?.code, permissions: user.permissions, scenario: user.scenario, active: user.active });
  }
  await writeFile(credentialPath!, `${JSON.stringify({ environment: "PRIVATE_SYNTHETIC_STAGING", generatedAt: new Date().toISOString(), users: credentialRows }, null, 2)}\n`, { flag: "wx" });

  for (const [suffix] of listings) {
    if (suffix !== "fk-missing-image") await writeSyntheticImage(`stage3-${suffix}`);
  }
  await writeSyntheticImage("stage3-gallery-2");
  await writeSyntheticImage("stage3-gallery-3");
  await mkdir(fixtureRoot!, { recursive: true });
  await writeFile(path.join(fixtureRoot!, "catalog-one.csv"), "Seller SKU Id,Product Title\nSTAGE-FK-SKU-001,Synthetic Direct Pack Product\n", { flag: "wx" });
  await writeFile(path.join(fixtureRoot!, "catalog-two.csv"), "Seller SKU Id,Product Title\nSTAGE-FK-SKU-002,Synthetic Marking Product\n", { flag: "wx" });
  await writeFile(path.join(fixtureRoot!, "amazon-all-listings.csv"), "seller-sku,asin1,fnsku\nSTAGE-AMZ-SKU-001,B0STAGE001,STAGEFNSKU001\n", { flag: "wx" });

  let listingIndex = 0;
  for (const [suffix, sku, title, route] of listings) {
    const id = `stage3-listing-${suffix}`;
    await prisma.marketplaceListing.create({ data: { id, accountId: accounts[0].id, marketplace: "FLIPKART", sellerSkuId: sku, sku, productTitle: title, listingStatus: suffix === "fk-inactive" ? "INACTIVE" : suffix === "fk-archived" ? "ARCHIVED" : "ACTIVE", fsn: `STAGE-FSN-${String(++listingIndex).padStart(3, "0")}`, listingId: `STAGE-LISTING-${String(listingIndex).padStart(3, "0")}`, mainImageUrl: suffix === "fk-missing-image" ? "https://invalid.example.invalid/stage3-all-broken.jpg" : syntheticImageRoute(`stage3-${suffix}`), imageUrl1: suffix === "fk-broken-image" ? syntheticImageRoute(`stage3-${suffix}`) : null, imageUrl2: suffix === "fk-broken-image" ? "https://invalid.example.invalid/stage3-one-broken.jpg" : suffix === "fk-gallery" ? syntheticImageRoute("stage3-gallery-2") : null, imageUrl3: suffix === "fk-gallery" ? syntheticImageRoute("stage3-gallery-3") : null, scrapeStatus: suffix === "fk-error" ? "FAILED" : "COMPLETED", scrapeError: suffix === "fk-error" ? "Synthetic image and catalog refresh failure." : null, manualLocksJson: suffix === "fk-locked" ? JSON.stringify({ productTitle: true }) : null, fieldProvenanceJson: JSON.stringify({ productTitle: { source: suffix === "fk-locked" ? "MANUAL_OWNER" : "SYNTHETIC_FIXTURE", manualLocked: suffix === "fk-locked" } }) } });
    await prisma.marketplaceListingIdentifier.createMany({ data: [
      { id: `${id}-sku`, accountId: accounts[0].id, marketplaceListingId: id, marketplace: "FLIPKART", identifierType: "SELLER_SKU", rawValue: sku, normalizedValue: sku, source: "SYNTHETIC_STAGE3" },
      { id: `${id}-fsn`, accountId: accounts[0].id, marketplaceListingId: id, marketplace: "FLIPKART", identifierType: "FSN", rawValue: `STAGE-FSN-${String(listingIndex).padStart(3, "0")}`, normalizedValue: `STAGE-FSN-${String(listingIndex).padStart(3, "0")}`, source: "SYNTHETIC_STAGE3" }
    ] });
    if (route) await prisma.productProcessRule.create({ data: { id: `${id}-rule`, accountId: accounts[0].id, marketplaceListingId: id, route: route as ProcessRoute, markingRequired: route.includes("MARK"), assemblyRequired: route.includes("ASSEMBLE"), assemblyTitle: route.includes("ASSEMBLE") ? "Synthetic assembly" : null, assemblyInstructions: route.includes("ASSEMBLE") ? "Follow the synthetic assembly checklist." : null, active: true, createdByUserId: users[0].id, updatedByUserId: users[0].id } });
  }
  await prisma.marketplaceListing.create({ data: { id: "stage3-listing-isolation", accountId: accounts[2].id, marketplace: "FLIPKART", sellerSkuId: "STAGE-FK-SKU-001", sku: "STAGE-FK-SKU-001", productTitle: "Synthetic Cross Account Same SKU" } });
  await prisma.marketplaceListing.create({ data: { id: "stage3-listing-amazon", accountId: accounts[1].id, marketplace: "AMAZON", sellerSkuId: "STAGE-AMZ-SKU-001", sku: "STAGE-AMZ-SKU-001", productTitle: "Synthetic Amazon Product", mainImageUrl: "https://example.invalid/synthetic/amazon.jpg" } });
  await prisma.marketplaceListingIdentifier.createMany({ data: [
    { id: "stage3-amz-sku", accountId: accounts[1].id, marketplaceListingId: "stage3-listing-amazon", marketplace: "AMAZON", identifierType: "SELLER_SKU", rawValue: "STAGE-AMZ-SKU-001", normalizedValue: "STAGE-AMZ-SKU-001", source: "SYNTHETIC_STAGE3" },
    { id: "stage3-amz-asin", accountId: accounts[1].id, marketplaceListingId: "stage3-listing-amazon", marketplace: "AMAZON", identifierType: "ASIN", rawValue: "B0STAGE001", normalizedValue: "B0STAGE001", source: "SYNTHETIC_STAGE3" },
    { id: "stage3-amz-fnsku", accountId: accounts[1].id, marketplaceListingId: "stage3-listing-amazon", marketplace: "AMAZON", identifierType: "FNSKU", rawValue: "STAGEFNSKU001", normalizedValue: "STAGEFNSKU001", source: "SYNTHETIC_STAGE3" }
  ] });
  await prisma.marketplaceListingAttribute.createMany({ data: [
    { id: "stage3-attr-fk", marketplaceListingId: "stage3-listing-fk-mark", accountId: accounts[0].id, marketplace: "FLIPKART", technicalKey: "synthetic_material", displayLabel: "Synthetic Material", valueJson: JSON.stringify("Synthetic alloy"), valueText: "Synthetic alloy", sourceAuthority: "MANUAL_OWNER", manualLocked: true, createdByUserId: users[0].id },
    { id: "stage3-attr-amz", marketplaceListingId: "stage3-listing-amazon", accountId: accounts[1].id, marketplace: "AMAZON", technicalKey: "item_type_keyword", displayLabel: "Item Type Keyword", valueJson: JSON.stringify("synthetic-item"), valueText: "synthetic-item", sourceAuthority: "MANUAL_OWNER", manualLocked: true, createdByUserId: users[0].id }
  ] });
  await prisma.markingAsset.create({
    data: {
      id: "stage4-synthetic-marking-asset",
      name: "Synthetic Marking Guide",
      masterDesignId: "STAGE-MARKING-MASTER-001",
      description: "Synthetic-only marking asset for private UI audit.",
      machineType: "Synthetic laser",
      material: "Synthetic alloy",
      markingPosition: "Centered",
      markingWidthMm: 24,
      markingHeightMm: 12,
      instructions: "Use the synthetic alignment guide. No production settings.",
      status: "APPROVED",
      active: true,
      createdByUserId: users[0].id,
      updatedByUserId: users[0].id,
      listingLinks: {
        create: {
          id: "stage4-synthetic-marking-link",
          marketplaceListingId: "stage3-listing-fk-mark",
          accountId: accounts[0].id,
          marketplace: "FLIPKART",
          matchMethod: "SYNTHETIC_STAGE4",
          confidence: 1,
          identifierSnapshotJson: JSON.stringify({ sellerSku: "STAGE-FK-SKU-002", synthetic: true }),
          active: true,
          createdByUserId: users[0].id
        }
      }
    }
  });

  const orderStates = [
    ["pick-ready", "PICK", "READY", "STAGE-FK-SKU-001", "PICK_PACK", users[2].id], ["pick-progress", "PICK", "IN_PROGRESS", "STAGE-FK-SKU-002", "PICK_MARK_PACK", users[2].id], ["pick-problem", "PICK", "PROBLEM", "STAGE-FK-SKU-003", "PICK_ASSEMBLE_PACK", users[3].id],
    ["mark-ready", "MARK", "READY", "STAGE-FK-SKU-002", "PICK_MARK_PACK", users[4].id], ["mark-progress", "MARK", "IN_PROGRESS", "STAGE-FK-SKU-004", "PICK_MARK_ASSEMBLE_PACK", users[4].id],
    ["assembly-ready", "ASSEMBLE", "READY", "STAGE-FK-SKU-003", "PICK_ASSEMBLE_PACK", users[5].id], ["assembly-progress", "ASSEMBLE", "IN_PROGRESS", "STAGE-FK-SKU-004", "PICK_MARK_ASSEMBLE_PACK", users[5].id], ["assembly-problem", "ASSEMBLE", "PROBLEM", "STAGE-FK-SKU-003", "PICK_ASSEMBLE_PACK", users[5].id],
    ["pack-ready", "PACK", "READY", "STAGE-FK-SKU-001", "PICK_PACK", users[6].id], ["pack-complete", "PACK", "COMPLETED", "STAGE-FK-SKU-001", "PICK_PACK", users[6].id]
  ] as const;
  let orderNumber = 0;
  for (const [name, stage, status, sku, route, assigned] of orderStates) {
    const orderId = `stage3-order-${name}`; const qty = name.includes("progress") ? 2 : 1;
    await prisma.order.create({ data: { id: orderId, accountId: accounts[0].id, marketplace: "FLIPKART", shipmentId: `STAGE-SHIP-${++orderNumber}`, orderItemId: `STAGE-ITEM-${orderNumber}`, trackingId: `STAGE-TRACK-${orderNumber}`, awb: `STAGE-AWB-${orderNumber}`, sku, qty, orderNo: `STAGE-ORDER-${orderNumber}`, productDescription: `Synthetic ${name} order`, pickStatus: stage === "PICK" ? "READY" : "PICKED", packStatus: status === "COMPLETED" ? "PACKED" : "READY", status: status === "COMPLETED" ? "PACKED" : "READY" } });
    await createTask({ id: `${orderId}-${stage.toLowerCase()}`, orderId, stage, sequence: stage === "PICK" ? 1 : stage === "MARK" ? 2 : stage === "ASSEMBLE" ? 2 : 4, status: status as WorkTaskStatus, quantity: qty, completed: status === "IN_PROGRESS" ? 1 : undefined, assigned, sku, title: `Synthetic ${name} order`, route, problem: status === "PROBLEM" ? "Synthetic staged problem" : undefined });
  }
  await prisma.order.create({
    data: {
      id: "stage4-order-held-missing-listing",
      accountId: accounts[0].id,
      marketplace: "FLIPKART",
      shipmentId: "STAGE-HELD-SHIP-001",
      orderItemId: "STAGE-HELD-ITEM-001",
      trackingId: "STAGE-HELD-TRACK-001",
      awb: "STAGE-HELD-AWB-001",
      sku: "STAGE-MISSING-SKU-ORDER-001",
      qty: 2,
      orderNo: "STAGE-HELD-ORDER-001",
      productDescription: "Synthetic held order awaiting listing resolution",
      status: "READY",
      pickStatus: "READY",
      packStatus: "READY"
    }
  });
  await prisma.problemOrder.createMany({ data: [
    { id: "stage4-problem-open", accountId: accounts[0].id, orderId: "stage3-order-pick-problem", reason: "Synthetic damaged item", details: "Synthetic open problem for UI audit.", interruptedStage: "PICK", workTaskId: "stage3-order-pick-problem-pick", taskStatusBefore: "READY", orderStatusBefore: "READY", pickStatusBefore: "READY", packStatusBefore: "READY", clientRequestId: "stage4-open-problem", status: "OPEN", reportedById: users[2].id },
    { id: "stage4-problem-resolved", accountId: accounts[0].id, orderId: "stage3-order-assembly-problem", reason: "Synthetic assembly mismatch", details: "Synthetic resolved problem for UI audit.", interruptedStage: "ASSEMBLE", workTaskId: "stage3-order-assembly-problem-assemble", taskStatusBefore: "READY", orderStatusBefore: "READY", pickStatusBefore: "PICKED", packStatusBefore: "READY", clientRequestId: "stage4-resolved-problem", status: "RESOLVED", reportedById: users[5].id, resolvedAt: new Date(), resolutionNote: "Synthetic resolution completed." }
  ] });
  await prisma.scanLog.createMany({ data: [
    { id: "stage4-scan-found", accountId: accounts[0].id, orderId: "stage3-order-pick-ready", awb: "STAGE-AWB-1", outcome: "FOUND", scannedById: users[2].id, note: "Synthetic exact active match." },
    { id: "stage4-scan-packed", accountId: accounts[0].id, orderId: "stage3-order-pack-complete", awb: "STAGE-AWB-10", outcome: "PACKED", scannedById: users[6].id, note: "Synthetic completed match." },
    { id: "stage4-scan-missing", accountId: accounts[0].id, awb: "STAGE-NO-MATCH", outcome: "NOT_FOUND", scannedById: users[2].id, note: "Synthetic no-match result." }
  ] });

  const batchStates = ["DRAFT", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "ACTIVE", "COMPLETED"] as const;
  let batchIndex = 0;
  for (const status of batchStates) await prisma.consignmentBatch.create({ data: { id: `stage3-batch-${status.toLowerCase()}`, accountId: accounts[0].id, marketplace: "FLIPKART", externalConsignmentNumber: `STAGE-CONSIGNMENT-${++batchIndex}`, displayName: `Synthetic ${status} Consignment`, status, sourceFileName: `synthetic-${status.toLowerCase()}.csv`, sourceFileSha256: "3".repeat(64), totalSourceRows: 1, totalValidLines: 1, totalRequiredQuantity: 2, matchedLines: status === "REVIEW_REQUIRED" ? 0 : 1, unmatchedLines: status === "REVIEW_REQUIRED" ? 1 : 0, createdByUserId: users[0].id, activatedAt: ["ACTIVE", "COMPLETED"].includes(status) ? new Date() : undefined, activatedByUserId: ["ACTIVE", "COMPLETED"].includes(status) ? users[0].id : undefined, completedAt: status === "COMPLETED" ? new Date() : undefined, completedByUserId: status === "COMPLETED" ? users[0].id : undefined } });
  const routes = ["PICK_PACK", "PICK_MARK_PACK", "PICK_ASSEMBLE_PACK", "PICK_MARK_ASSEMBLE_PACK"] as const;
  for (const [index, route] of routes.entries()) {
    const lineId = `stage3-line-${route.toLowerCase()}`, batchId = "stage3-batch-active", sku = listings[index][1], stage = index === 0 ? "PACK" : index === 1 ? "MARK" : "ASSEMBLE";
    await prisma.consignmentLine.create({ data: { id: lineId, consignmentBatchId: batchId, accountId: accounts[0].id, rowNumber: index + 1, sellerSkuSource: sku, requiredQuantity: index + 1, marketplaceListingId: `stage3-listing-${listings[index][0]}`, matchStatus: "EXACT_SKU", processRoute: route, activated: true, sellerSkuSnapshot: sku, productTitleSnapshot: listings[index][2], catalogSnapshotJson: snapshot(sku, listings[index][2], route) } });
    await createTask({ id: `${lineId}-${stage.toLowerCase()}`, consignmentLineId: lineId, sourceType: "CONSIGNMENT", stage, sequence: stage === "PACK" ? 4 : 2, status: "READY", quantity: index + 1, assigned: stage === "PACK" ? users[6].id : stage === "MARK" ? users[4].id : users[5].id, sku, title: listings[index][2], route });
  }
  await prisma.marketplaceListing.create({ data: { id: "stage4-c1-listing-no-image", accountId: accounts[0].id, marketplace: "FLIPKART", sellerSkuId: "STAGE-C1-NO-IMAGE-SKU", sku: "STAGE-C1-NO-IMAGE-SKU", productTitle: "Synthetic C1 missing image product", listingStatus: "ACTIVE", fsn: "STAGE-C1-NO-IMAGE-FSN", listingId: "STAGE-C1-NO-IMAGE-LISTING" } });
  await prisma.consignmentBatch.create({ data: { id: "stage4-batch-c1-work-cards", accountId: accounts[0].id, marketplace: "FLIPKART", externalConsignmentNumber: `STAGE-C1-${"LONG-CONSIGNMENT-REFERENCE-".repeat(4)}001`, displayName: `Synthetic C1 ${"Long Worker Card Evidence ".repeat(4)}`, status: "ACTIVE", sourceFileName: "synthetic-c1-work-cards.csv", sourceFileSha256: "4".repeat(64), totalSourceRows: 4, totalValidLines: 4, totalRequiredQuantity: 13, matchedLines: 4, unmatchedLines: 0, createdByUserId: users[0].id, activatedAt: new Date(), activatedByUserId: users[0].id } });
  const c1Lines = [
    { id: "stage4-c1-line-pick-ready", row: 1, sku: `STAGE-C1-${"LONG-SELLER-SKU-".repeat(5)}READY`, title: `Synthetic C1 ${"very long product title for wrapping and operational scanning ".repeat(4)}`, listingId: "stage3-listing-fk-direct", quantity: 6, stage: "PICK" as const, status: "READY" as const, assigned: users[2].id, problem: undefined, metadataJson: undefined },
    { id: "stage4-c1-line-pick-problem", row: 2, sku: "STAGE-C1-PROBLEM-SKU", title: "Synthetic C1 paused consignment product", listingId: "stage3-listing-fk-missing-image", quantity: 2, stage: "PICK" as const, status: "PROBLEM" as const, assigned: users[2].id, problem: "QUANTITY_SHORT", metadataJson: undefined },
    { id: "stage4-c1-line-assembly-manual", row: 3, sku: "STAGE-C1-MANUAL-ASSEMBLY-SKU", title: "Synthetic C1 manual route assembly product", listingId: "stage3-listing-fk-assembly", quantity: 4, stage: "ASSEMBLE" as const, status: "READY" as const, assigned: users[5].id, problem: undefined, metadataJson: JSON.stringify({ synthetic: true, instructionStatus: "MISSING", warning: "Manual route instructions need supervisor confirmation", routedByUserId: users[0].id, routedAt: new Date().toISOString(), workerNote: "Synthetic C1 manual route evidence only." }) },
    { id: "stage4-c1-line-pick-no-image", row: 4, sku: "STAGE-C1-NO-IMAGE-SKU", title: "Synthetic C1 missing image product", listingId: "stage4-c1-listing-no-image", quantity: 1, stage: "PICK" as const, status: "READY" as const, assigned: users[2].id, problem: undefined, metadataJson: undefined },
  ];
  for (const item of c1Lines) {
    await prisma.consignmentLine.create({ data: { id: item.id, consignmentBatchId: "stage4-batch-c1-work-cards", accountId: accounts[0].id, rowNumber: item.row, sellerSkuSource: item.sku, requiredQuantity: item.quantity, marketplaceListingId: item.listingId, matchStatus: "EXACT_SKU", processRoute: item.stage === "ASSEMBLE" ? "PICK_ASSEMBLE_PACK" : "PICK_PACK", activated: true, sellerSkuSnapshot: item.sku, productTitleSnapshot: item.title, catalogSnapshotJson: snapshot(item.sku, item.title, item.stage === "ASSEMBLE" ? "PICK_ASSEMBLE_PACK" : "PICK_PACK") } });
    await createTask({ id: `${item.id}-${item.stage.toLowerCase()}`, consignmentLineId: item.id, sourceType: "CONSIGNMENT", stage: item.stage, sequence: item.stage === "PICK" ? 1 : 2, status: item.status, quantity: item.quantity, assigned: item.assigned, sku: item.sku, title: item.title, route: item.stage === "ASSEMBLE" ? "PICK_ASSEMBLE_PACK" : "PICK_PACK", problem: item.problem, metadataJson: item.metadataJson });
  }
  const completedConsignmentStates = [
    { lineId: "stage4-line-mark-completed", rowNumber: 20, sku: "STAGE-FK-SKU-002", title: "Synthetic completed Mark item", route: "PICK_MARK_PACK" as const, stage: "MARK" as const, workerId: users[4].id },
    { lineId: "stage4-line-assembly-completed", rowNumber: 21, sku: "STAGE-FK-SKU-003", title: "Synthetic completed Assembly item", route: "PICK_ASSEMBLE_PACK" as const, stage: "ASSEMBLE" as const, workerId: users[5].id }
  ];
  for (const item of completedConsignmentStates) {
    await prisma.consignmentLine.create({ data: { id: item.lineId, consignmentBatchId: "stage3-batch-active", accountId: accounts[0].id, rowNumber: item.rowNumber, sellerSkuSource: item.sku, requiredQuantity: 1, marketplaceListingId: item.stage === "MARK" ? "stage3-listing-fk-mark" : "stage3-listing-fk-assembly", matchStatus: "EXACT_SKU", processRoute: item.route, activated: true, sellerSkuSnapshot: item.sku, productTitleSnapshot: item.title, catalogSnapshotJson: snapshot(item.sku, item.title, item.route) } });
    await createTask({ id: `${item.lineId}-pick`, consignmentLineId: item.lineId, sourceType: "CONSIGNMENT", stage: "PICK", sequence: 1, status: "COMPLETED", quantity: 1, assigned: users[2].id, sku: item.sku, title: item.title, route: item.route });
    await createTask({ id: `${item.lineId}-${item.stage.toLowerCase()}`, consignmentLineId: item.lineId, sourceType: "CONSIGNMENT", stage: item.stage, sequence: 2, status: "COMPLETED", quantity: 1, assigned: item.workerId, sku: item.sku, title: item.title, route: item.route });
    await createTask({ id: `${item.lineId}-pack`, consignmentLineId: item.lineId, sourceType: "CONSIGNMENT", stage: "PACK", sequence: 3, status: "READY", quantity: 1, assigned: users[6].id, sku: item.sku, title: item.title, route: item.route });
  }
  await prisma.order.create({ data: { id: "stage4-order-pack-assembly-locked", accountId: accounts[0].id, marketplace: "FLIPKART", shipmentId: "STAGE-SHIP-ASSEMBLY-LOCKED", orderItemId: "STAGE-ITEM-ASSEMBLY-LOCKED", trackingId: "STAGE-TRACK-ASSEMBLY-LOCKED", awb: "STAGE-AWB-ASSEMBLY-LOCKED", sku: "STAGE-FK-SKU-003", qty: 1, orderNo: "STAGE-ORDER-ASSEMBLY-LOCKED", productDescription: "Synthetic Pack blocked by pending Assembly", pickStatus: "PICKED", packStatus: "READY", status: "READY" } });
  await createTask({ id: "stage4-order-pack-assembly-locked-pick", orderId: "stage4-order-pack-assembly-locked", stage: "PICK", sequence: 1, status: "COMPLETED", quantity: 1, assigned: users[2].id, sku: "STAGE-FK-SKU-003", title: "Synthetic Pack blocked by pending Assembly", route: "PICK_ASSEMBLE_PACK" });
  await createTask({ id: "stage4-order-pack-assembly-locked-assemble", orderId: "stage4-order-pack-assembly-locked", stage: "ASSEMBLE", sequence: 2, status: "READY", quantity: 1, assigned: users[5].id, sku: "STAGE-FK-SKU-003", title: "Synthetic Pack blocked by pending Assembly", route: "PICK_ASSEMBLE_PACK" });
  await createTask({ id: "stage4-order-pack-assembly-locked-pack", orderId: "stage4-order-pack-assembly-locked", stage: "PACK", sequence: 3, status: "LOCKED", quantity: 1, assigned: users[6].id, sku: "STAGE-FK-SKU-003", title: "Synthetic Pack blocked by pending Assembly", route: "PICK_ASSEMBLE_PACK" });
  await prisma.consignmentLine.create({ data: { id: "stage3-line-held-missing", consignmentBatchId: "stage3-batch-review_required", accountId: accounts[0].id, rowNumber: 1, sellerSkuSource: "STAGE-MISSING-SKU-001", requiredQuantity: 5, matchStatus: "NOT_FOUND", activated: false } });
  await prisma.consignmentImportIssue.create({ data: { id: "stage3-consignment-missing-issue", consignmentBatchId: "stage3-batch-review_required", consignmentLineId: "stage3-line-held-missing", severity: "ERROR", issueType: "MISSING_LISTING", message: "Synthetic missing listing requires owner resolution.", rowNumber: 2, safeDataJson: JSON.stringify({ sourceFileName: "synthetic-missing.csv", sourceTableName: "Synthetic", sellerSku: "STAGE-MISSING-SKU-001" }) } });
  await prisma.consignmentImportIssue.createMany({ data: [
    { id: "stage4-consignment-zero-info", consignmentBatchId: "stage3-batch-review_required", severity: "INFO", issueType: "ZERO_QUANTITY_SKIPPED", message: "Synthetic zero quantity row created no work.", rowNumber: 3, safeDataJson: JSON.stringify({ sellerSku: "STAGE-FK-SKU-002" }) },
    { id: "stage4-consignment-invalid-error", consignmentBatchId: "stage3-batch-review_required", severity: "ERROR", issueType: "INVALID_QUANTITY", message: "Synthetic invalid quantity blocks activation.", rowNumber: 4, safeDataJson: JSON.stringify({ sellerSku: "STAGE-FK-SKU-003" }) }
  ] });

  await mkdir(importStorageRoot!, { recursive: true });
  const syntheticImportFile = path.join(importStorageRoot!, "stage4-synthetic-import.csv");
  await writeFile(syntheticImportFile, "synthetic,only\n1,true\n", { flag: "wx" });
  const importStates = [
    ["queued", "QUEUED", "QUEUED", 0, 0, 0, null],
    ["mapping", "NEEDS_MAPPING", "MAPPING", 20, 0, 0, null],
    ["running", "RUNNING", "MERGING", 100, 45, 2, null],
    ["completed", "COMPLETED", "COMPLETED", 100, 100, 0, null],
    ["warnings", "COMPLETED_WITH_WARNINGS", "COMPLETED", 100, 100, 5, null],
    ["failed", "FAILED", "FAILED", 40, 12, 3, "Synthetic parser failure."],
    ["cancelled", "CANCELLED", "CANCELLED", 20, 5, 0, null]
  ] as const;
  for (const [suffix, status, stage, totalRows, processedRows, warningRows, lastError] of importStates) {
    await prisma.importJob.create({ data: {
      id: `stage4-import-${suffix}`, accountId: accounts[0].id, createdByUserId: users[1].id, marketplace: "FLIPKART", importType: "PRODUCT_INVENTORY",
      fileName: suffix === "failed" ? `synthetic-${"attention-and-long-filename-".repeat(8)}failed.csv` : `synthetic-${suffix}.csv`, filePath: syntheticImportFile, batchId: `stage4-batch-${suffix}`, status, stage, totalRows, processedRows,
      createdRows: suffix === "completed" ? 25 : 0, unchangedRows: suffix === "completed" ? 75 : 0, warningRows, errorRows: suffix === "failed" ? 3 : 0,
      totalFiles: 1, processedFiles: ["completed", "warnings", "failed", "cancelled"].includes(suffix) ? 1 : 0, lastError,
      startedAt: ["running", "completed", "warnings", "failed", "cancelled"].includes(suffix) ? new Date() : undefined,
      finishedAt: ["completed", "warnings", "failed", "cancelled"].includes(suffix) ? new Date() : undefined,
      reportJson: JSON.stringify({ synthetic: true, state: suffix }),
      progressJson: suffix === "mapping" ? JSON.stringify({
        headers: ["Order Item ID", "Shipment ID", "Tracking ID", "Seller SKU", "Quantity"],
        fingerprint: "stage4-synthetic-mapping-profile",
        requiredFields: ["orderItemId", "sellerSku", "quantity"],
        optionalFields: ["shipmentId", "trackingId"]
      }) : undefined
    } });
  }
  await prisma.importJob.create({ data: {
    id: "stage4-import-amazon-completed", accountId: accounts[1].id, createdByUserId: users[0].id, marketplace: "AMAZON", importType: "AMAZON_PRODUCT_INVENTORY",
    fileName: "synthetic-amazon-product-inventory.xlsx", filePath: syntheticImportFile, status: "COMPLETED", stage: "COMPLETED", totalRows: 24, processedRows: 24,
    createdRows: 24, totalFiles: 1, processedFiles: 1, startedAt: new Date(), finishedAt: new Date(), reportJson: JSON.stringify({ synthetic: true, state: "amazon-completed" })
  } });
  await prisma.uploadBatch.create({ data: { id: "stage4-upload-needs-mapping", accountId: accounts[0].id, createdByUserId: users[1].id, fileName: "synthetic-needs-mapping.csv", importType: "ORDER_LABEL", status: "NEEDS_MAPPING", totalRows: 3, errorRows: 1, warningRows: 1, blockingErrorRows: 1 } });
  await prisma.importRowIssue.createMany({ data: [
    { id: "stage4-import-warning", batchId: "stage4-upload-needs-mapping", rowNumber: 2, issueType: "UNKNOWN_HEADER", message: "Synthetic header requires mapping.", safeDataJson: JSON.stringify({ sellerSku: "STAGE-FK-SKU-001" }), severity: "WARNING" },
    { id: "stage4-import-blocking", batchId: "stage4-upload-needs-mapping", rowNumber: 3, issueType: "IDENTITY_CONFLICT", message: "Synthetic conflicting identity blocks import.", safeDataJson: JSON.stringify({ sellerSku: "STAGE-FK-SKU-002" }), severity: "ERROR" },
    { id: "stage4-missing-listing-issue", batchId: "stage4-upload-needs-mapping", rowNumber: 4, issueType: "MISSING_FLIPKART_LISTING_MAPPING", message: "Synthetic Order listing must be linked or created before Pick work is released.", safeDataJson: JSON.stringify({ sellerSku: "STAGE-MISSING-SKU-ORDER-001", fsn: "STAGE-MISSING-FSN-ORDER-001" }), severity: "ERROR", sourceType: "ORDER", sourceId: "stage4-order-held-missing-listing" }
  ] });
  await prisma.dataDeletionJob.createMany({ data: [
    { id: "stage4-delete-preview", accountId: accounts[0].id, actorUserId: users[0].id, actionKind: "PURGE_QA_OPERATIONAL_DATA", state: "PREVIEWED", clientRequestId: "stage4-preview", requestFingerprint: "a".repeat(64), scopeFingerprint: "b".repeat(64), scopeJson: JSON.stringify({ synthetic: true, label: "STAGE4" }), previewJson: JSON.stringify({ synthetic: true, affectedRecords: 12 }) },
    { id: "stage4-delete-quarantined", accountId: accounts[0].id, actorUserId: users[0].id, actionKind: "QUARANTINE_IMPORT_SOURCE_FILE", state: "COMPLETED", clientRequestId: "stage4-quarantine", requestFingerprint: "c".repeat(64), scopeFingerprint: "d".repeat(64), scopeJson: JSON.stringify({ synthetic: true }), previewJson: JSON.stringify({ synthetic: true, affectedFiles: 1 }), manifestJson: JSON.stringify([{ storageKind: "IMPORT_JOB", sourceRelativePath: "stage4-synthetic-import.csv", quarantineRelativePath: "0-stage4-synthetic-import.csv", size: 22 }]), quarantineRelativePath: "stage4-delete-quarantined", totalFiles: 1, totalBytes: 22, purgeAfter: new Date(Date.now() + 86_400_000), completedAt: new Date() },
    { id: "stage4-delete-completed", accountId: accounts[0].id, actorUserId: users[0].id, actionKind: "RESTORE_QUARANTINED_FILES", state: "COMPLETED", clientRequestId: "stage4-restored", requestFingerprint: "e".repeat(64), scopeFingerprint: "f".repeat(64), scopeJson: JSON.stringify({ synthetic: true }), previewJson: JSON.stringify({ synthetic: true }), completedAt: new Date() },
    { id: "stage4-delete-purged", accountId: accounts[0].id, actorUserId: users[0].id, actionKind: "PURGE_QUARANTINED_FILES", state: "PURGED", clientRequestId: "stage4-purged", requestFingerprint: "1".repeat(64), scopeFingerprint: "2".repeat(64), scopeJson: JSON.stringify({ synthetic: true, deletionJobId: "stage4-delete-historical-source" }), previewJson: JSON.stringify({ synthetic: true, affectedFiles: 1 }), totalFiles: 1, totalBytes: 22, completedAt: new Date() }
  ] });

  for (const account of accounts.filter((item) => item.active)) for (const sourceType of ["ORDER", "CONSIGNMENT"] as const) for (const stage of ["PICK", "MARK", "ASSEMBLE", "PACK"] as const) {
    await rebuildWorkGroupProjection({ accountId: account.id, sourceType, stage }, prisma);
  }
  await prisma.auditLog.createMany({ data: [
    { id: "stage3-seed-audit", userId: users[0].id, accountId: accounts[0].id, action: "STAGE4_6_SYNTHETIC_SEED", entityType: "SyntheticStaging", entityId: "phase-7.3.6-stage4.6c1-semantic-fixtures-v2", metadata: JSON.stringify({ synthetic: true }) },
    { id: "stage4-delete-audit", userId: users[0].id, accountId: accounts[0].id, action: "DATA_MANAGEMENT_PREVIEW", entityType: "DataDeletionJob", entityId: "stage4-delete-preview", metadata: JSON.stringify({ synthetic: true, result: "PREVIEWED" }) }
  ] });

  const fixtureFiles: Record<string, string> = {
    "flipkart/product-inventory-75-column-like.csv": "Product Title,Seller SKU Id,Sub-category,Flipkart Serial Number,Listing ID,Listing Status,MRP,Your Selling Price,Live Title,Live Brand,Live Category,Live Price,Live MRP,Product Highlights,Description,All Specifications,Generated Direct Product URL,Canonical Product URL,Image URL 1,Image 1 1366 URL,System Stock count,Your Stock Count,Recommended Stock,Minimum Order Quantity,Procurement SLA,Procurement Type\nSynthetic Product,STAGE-FK-SKU-001,Synthetic Category,STAGE-FSN-001,STAGE-LISTING-001,ACTIVE,100,90,Synthetic Live Product,Synthetic Brand,Synthetic Category,90,100,Synthetic highlight,Synthetic description,Synthetic specifications,https://example.invalid/direct,https://example.invalid/canonical,https://example.invalid/image.jpg,https://example.invalid/image-1366.jpg,0,0,0,1,1,MADE_TO_ORDER\n",
    "flipkart/daily-orders-100.csv": "Order Item ID,Shipment ID,Tracking ID,Seller SKU,Quantity\n" + Array.from({ length: 100 }, (_, i) => `STAGE-ROLL-${i + 1},STAGE-SHIP-${i + 1},STAGE-TRACK-${i + 1},STAGE-FK-SKU-001,1`).join("\n") + "\n",
    "flipkart/daily-orders-rolling-150.csv": "Order Item ID,Shipment ID,Tracking ID,Seller SKU,Quantity\n" + Array.from({ length: 150 }, (_, i) => `STAGE-ROLL-${i + 1},STAGE-SHIP-${i + 1},STAGE-TRACK-${i + 1},STAGE-FK-SKU-001,1`).join("\n") + "\n",
    "flipkart/daily-orders-conflicts.csv": "Order Item ID,Shipment ID,Tracking ID,Seller SKU,Quantity\nSTAGE-DUP-1,STAGE-SHIP-DUP,STAGE-TRACK-DUP,STAGE-FK-SKU-001,1\nSTAGE-DUP-1,STAGE-SHIP-DUP,STAGE-TRACK-CHANGED,STAGE-FK-SKU-001,2\nSTAGE-MISSING-1,STAGE-SHIP-MISSING,STAGE-TRACK-MISSING,STAGE-MISSING-SKU-001,1\n",
    "flipkart/consignment-quantities.csv": "Seller SKU,Quantity Sent,Route\nSTAGE-FK-SKU-001,2,PICK_PACK\nSTAGE-FK-SKU-002,0,PICK_MARK_PACK\nSTAGE-FK-SKU-003,bad,PICK_ASSEMBLE_PACK\nSTAGE-MISSING-SKU-001,5,PICK_MARK_ASSEMBLE_PACK\n",
    "amazon/all-listings.csv": "seller-sku,asin1,fnsku,item-name,price,quantity\nSTAGE-AMZ-SKU-001,B0STAGE001,STAGEFNSKU001,Synthetic Amazon Product,120,0\n",
    "amazon/category-template.csv": "Product Name,Merchant SKU,Item Type Keyword,bullet_point1,search_terms1\nSynthetic Amazon Product,STAGE-AMZ-SKU-001,synthetic-item,Synthetic bullet,Synthetic keyword\n",
    "amazon/consignment-quantities.csv": "Merchant SKU,FNSKU,ASIN,Shipped\nSTAGE-AMZ-SKU-001,STAGEFNSKU001,B0STAGE001,3\nSTAGE-AMZ-SKU-001,STAGEFNSKU001,B0STAGE001,0\nSTAGE-AMZ-SKU-001,STAGEFNSKU001,B0STAGE001,\nSTAGE-AMZ-SKU-001,STAGEFNSKU001,B0STAGE001,-1\nSTAGE-AMZ-SKU-001,STAGEFNSKU001,B0STAGE001,1.5\nSTAGE-AMZ-SKU-001,STAGEFNSKU001,B0STAGE001,text\n"
  };
  for (const [relative, content] of Object.entries(fixtureFiles)) { const target = path.join(fixtureRoot!, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, { flag: "wx" }); }
  await writeFile(path.join(fixtureRoot!, "fixture-index.json"), `${JSON.stringify({ syntheticOnly: true, files: Object.keys(fixtureFiles), scenarios: ["repeat-refresh", "catalog-conflict", "missing-image", "rolling-orders", "exact-duplicate", "conflicting-identity", "missing-listing", "multi-item-package", "active-work-conflict", "invalid-quantity"] }, null, 2)}\n`, { flag: "wx" });
}

seed().finally(() => prisma.$disconnect());
