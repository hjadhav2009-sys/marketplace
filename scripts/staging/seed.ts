import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type ProcessRoute, type WorkStage, type WorkTaskStatus } from "@prisma/client";
import { hashPassword } from "../../lib/password";
import { rebuildWorkGroupProjection } from "../../src/lib/workflow/work-group-projection";

const prisma = new PrismaClient();
const credentialPath = process.env.STAGING_CREDENTIAL_PATH;
const fixtureRoot = process.env.STAGING_FIXTURES_ROOT;
if (!credentialPath || !fixtureRoot || !process.env.STAGE3_SYNTHETIC_STAGING) throw new Error("Synthetic seed may run only inside the Stage 3 environment.");

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
  { id: "stage3-disabled", display: "Synthetic Disabled Worker", username: "stage3-disabled", role: "PICKER", scenario: "DISABLED", account: accounts[0].id, active: false, permissions: { canPick: true } }
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
  ["fk-locked", "STAGE-FK-SKU-010", "Synthetic Manually Locked Product", "PICK_PACK"]
] as const;

function snapshot(sku: string, title: string, route: string | null) {
  return JSON.stringify({ sellerSku: sku, productTitle: title, primaryImage: sku.endsWith("006") ? null : `/stage3/${sku}.svg`, routeRecommendation: route ?? "PICK_PACK", routeRecommendationSource: route ? "PRODUCT_RULE" : "SYSTEM_FALLBACK", hasExplicitSavedRoute: Boolean(route), savedProcessRoute: route, synthetic: true });
}

function routeSnapshot(route: string | null, currentStage: WorkStage) {
  return JSON.stringify({ version: 3, routeRecommendation: route ?? "PICK_PACK", routeRecommendationSource: route ? "EXPLICIT_PRODUCT_RULE" : "SYSTEM_FALLBACK", hasExplicitSavedRoute: Boolean(route), selectedProcessRoute: route ?? "PICK_PACK", currentStage, completedStages: [], decision: "SYNTHETIC_SEED" });
}

async function createTask(input: { id: string; accountId?: string; orderId?: string; consignmentLineId?: string; sourceType?: "ORDER" | "CONSIGNMENT"; stage: WorkStage; sequence: number; status: WorkTaskStatus; quantity?: number; completed?: number; assigned?: string; sku: string; title: string; route: string | null; problem?: string }) {
  return prisma.workTask.create({ data: {
    id: input.id, accountId: input.accountId ?? accounts[0].id, sourceType: input.sourceType ?? "ORDER", orderId: input.orderId, consignmentLineId: input.consignmentLineId,
    stage: input.stage, sequenceNumber: input.sequence, requiredQuantity: input.quantity ?? 1, completedQuantity: input.completed ?? (input.status === "COMPLETED" ? input.quantity ?? 1 : 0), status: input.status,
    assignedUserId: input.assigned, startedByUserId: input.status === "IN_PROGRESS" ? input.assigned : undefined, startedAt: input.status === "IN_PROGRESS" ? new Date() : undefined,
    completedByUserId: input.status === "COMPLETED" ? input.assigned ?? users[0].id : undefined, completedAt: input.status === "COMPLETED" ? new Date() : undefined,
    problemReason: input.problem, problemReportedAt: input.problem ? new Date() : undefined, problemReportedByUserId: input.problem ? input.assigned ?? users[0].id : undefined,
    statusBeforeProblem: input.problem ? "READY" : undefined, metadataJson: JSON.stringify({ synthetic: true, processRoute: input.route ?? "PICK_PACK", instruction: input.stage === "MARK" ? "Use synthetic marking guide." : input.stage === "ASSEMBLE" ? "Use synthetic assembly guide." : null }),
    workCardSnapshotJson: snapshot(input.sku, input.title, input.route), routeSnapshotJson: routeSnapshot(input.route, input.stage)
  } });
}

async function seed() {
  for (const account of accounts) await prisma.account.create({ data: { ...account, marketplace: account.marketplace as "FLIPKART" | "AMAZON", companyName: "Synthetic Warehouse", accountDisplayName: account.name, accountCode: account.code, notes: "SYNTHETIC STAGING ONLY" } });
  const credentialRows = [];
  for (const user of users) {
    const password = `S3!${randomBytes(18).toString("base64url")}`;
    await prisma.user.create({ data: { id: user.id, username: user.username, passwordHash: hashPassword(password), name: user.display, role: user.role as "OWNER" | "PICKER" | "PACKER", active: user.active, accountId: user.account, assignedAccounts: { connect: [{ id: user.account }] }, ...user.permissions } });
    credentialRows.push({ displayRole: user.display, username: user.username, password, assignedAccount: accounts.find((item) => item.id === user.account)?.code, permissions: user.permissions, scenario: user.scenario, active: user.active });
  }
  await writeFile(credentialPath!, `${JSON.stringify({ environment: "PRIVATE_SYNTHETIC_STAGING", generatedAt: new Date().toISOString(), users: credentialRows }, null, 2)}\n`, { flag: "wx" });

  let listingIndex = 0;
  for (const [suffix, sku, title, route] of listings) {
    const id = `stage3-listing-${suffix}`;
    await prisma.marketplaceListing.create({ data: { id, accountId: accounts[0].id, marketplace: "FLIPKART", sellerSkuId: sku, sku, productTitle: title, listingStatus: suffix === "fk-inactive" ? "INACTIVE" : "ACTIVE", fsn: `STAGE-FSN-${String(++listingIndex).padStart(3, "0")}`, listingId: `STAGE-LISTING-${String(listingIndex).padStart(3, "0")}`, mainImageUrl: suffix === "fk-missing-image" ? null : suffix === "fk-broken-image" ? "https://invalid.example.invalid/stage3-image.jpg" : `https://example.invalid/synthetic/${sku}.jpg`, imageUrl2: suffix === "fk-gallery" ? "https://example.invalid/synthetic/gallery-2.jpg" : null, imageUrl3: suffix === "fk-gallery" ? "https://example.invalid/synthetic/gallery-3.jpg" : null, manualLocksJson: suffix === "fk-locked" ? JSON.stringify({ productTitle: true }) : null, fieldProvenanceJson: JSON.stringify({ productTitle: { source: suffix === "fk-locked" ? "MANUAL_OWNER" : "SYNTHETIC_FIXTURE", manualLocked: suffix === "fk-locked" } }) } });
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

  const batchStates = ["DRAFT", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "ACTIVE", "COMPLETED"] as const;
  let batchIndex = 0;
  for (const status of batchStates) await prisma.consignmentBatch.create({ data: { id: `stage3-batch-${status.toLowerCase()}`, accountId: accounts[0].id, marketplace: "FLIPKART", externalConsignmentNumber: `STAGE-CONSIGNMENT-${++batchIndex}`, displayName: `Synthetic ${status} Consignment`, status, sourceFileName: `synthetic-${status.toLowerCase()}.csv`, sourceFileSha256: "3".repeat(64), totalSourceRows: 1, totalValidLines: 1, totalRequiredQuantity: 2, matchedLines: status === "REVIEW_REQUIRED" ? 0 : 1, unmatchedLines: status === "REVIEW_REQUIRED" ? 1 : 0, createdByUserId: users[0].id, activatedAt: ["ACTIVE", "COMPLETED"].includes(status) ? new Date() : undefined, activatedByUserId: ["ACTIVE", "COMPLETED"].includes(status) ? users[0].id : undefined, completedAt: status === "COMPLETED" ? new Date() : undefined, completedByUserId: status === "COMPLETED" ? users[0].id : undefined } });
  const routes = ["PICK_PACK", "PICK_MARK_PACK", "PICK_ASSEMBLE_PACK", "PICK_MARK_ASSEMBLE_PACK"] as const;
  for (const [index, route] of routes.entries()) {
    const lineId = `stage3-line-${route.toLowerCase()}`, batchId = "stage3-batch-active", sku = listings[index][1], stage = index === 0 ? "PACK" : index === 1 ? "MARK" : "ASSEMBLE";
    await prisma.consignmentLine.create({ data: { id: lineId, consignmentBatchId: batchId, accountId: accounts[0].id, rowNumber: index + 1, sellerSkuSource: sku, requiredQuantity: index + 1, marketplaceListingId: `stage3-listing-${listings[index][0]}`, matchStatus: "EXACT_SKU", processRoute: route, activated: true, sellerSkuSnapshot: sku, productTitleSnapshot: listings[index][2], catalogSnapshotJson: snapshot(sku, listings[index][2], route) } });
    await createTask({ id: `${lineId}-${stage.toLowerCase()}`, consignmentLineId: lineId, sourceType: "CONSIGNMENT", stage, sequence: stage === "PACK" ? 4 : 2, status: "READY", quantity: index + 1, assigned: stage === "PACK" ? users[6].id : stage === "MARK" ? users[4].id : users[5].id, sku, title: listings[index][2], route });
  }
  await prisma.consignmentLine.create({ data: { id: "stage3-line-held-missing", consignmentBatchId: "stage3-batch-review_required", accountId: accounts[0].id, rowNumber: 1, sellerSkuSource: "STAGE-MISSING-SKU-001", requiredQuantity: 5, matchStatus: "NOT_FOUND", activated: false } });
  await prisma.consignmentImportIssue.create({ data: { id: "stage3-consignment-missing-issue", consignmentBatchId: "stage3-batch-review_required", consignmentLineId: "stage3-line-held-missing", severity: "ERROR", issueType: "MISSING_LISTING", message: "Synthetic missing listing requires owner resolution.", rowNumber: 2, safeDataJson: JSON.stringify({ sourceFileName: "synthetic-missing.csv", sourceTableName: "Synthetic", sellerSku: "STAGE-MISSING-SKU-001" }) } });

  for (const account of accounts.filter((item) => item.active)) for (const sourceType of ["ORDER", "CONSIGNMENT"] as const) for (const stage of ["PICK", "MARK", "ASSEMBLE", "PACK"] as const) {
    await rebuildWorkGroupProjection({ accountId: account.id, sourceType, stage }, prisma);
  }
  await prisma.auditLog.create({ data: { id: "stage3-seed-audit", userId: users[0].id, accountId: accounts[0].id, action: "STAGE3_SYNTHETIC_SEED", entityType: "SyntheticStaging", entityId: "phase-7.3.6-stage3-v1", metadata: JSON.stringify({ synthetic: true }) } });

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
