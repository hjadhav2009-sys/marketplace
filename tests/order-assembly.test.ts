import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeListingIdentifier } from "../src/lib/marking/identifiers";
import { markCustomerOrdersPickedSafely } from "../src/lib/workflow/order-picking";
import { canOfferManualAssemblyDiversion, claimOrderAssemblyTask, completeOrderAssemblyTask, getOrderAssemblyPackingGate, reportOrderAssemblyProblem, resolveOrderAssemblyProblem, sendOrderToAssembly, skipOrderAssemblyTask } from "../src/lib/workflow/order-assembly";
import { parseOrderAssemblyMetadata } from "../src/lib/workflow/order-assembly-metadata";
import { resolveOrderAssemblyPolicy } from "../src/lib/workflow/order-assembly-policy";
import { packCustomerOrderShipmentSafely } from "../src/lib/workflow/order-pack-scope";
import { resolveUniversalWork } from "../src/lib/workflow/universal-resolver";

const tempDirectory = resolve(process.cwd(), ".codex-tmp");
mkdirSync(tempDirectory, { recursive: true });
const databaseFile = resolve(tempDirectory, "order-assembly.db");
rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 });
const sqlite = new DatabaseSync(databaseFile);
sqlite.exec("PRAGMA foreign_keys=ON;");
for (const name of readdirSync(resolve(process.cwd(), "prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) sqlite.exec(readFileSync(join(process.cwd(), "prisma", "migrations", name, "migration.sql"), "utf8"));
sqlite.close();
const db = new PrismaClient({ datasourceUrl: `file:${databaseFile.replace(/\\/g, "/")}` });

function order(id: string, sku: string, pickStatus: "READY" | "PICKED" = "READY", trackingId = `TRACK-${id}`) {
  return { id, accountId: "account", batchId: "upload", marketplace: "FLIPKART", awb: `AWB-${id}`, trackingId, shipmentId: `SHIP-${trackingId}`, orderItemId: `ITEM-${id}`, sku, qty: 1, orderNo: `ORDER-${id}`, productDescription: `Fake ${sku}`, pickStatus, packStatus: "READY" as const, status: "READY" as const };
}

async function listing(id: string, sellerSkuId: string, route: "PICK_PACK" | "PICK_ASSEMBLE_PACK" | "PICK_MARK_ASSEMBLE_PACK", assemblyRequired: boolean) {
  await db.marketplaceListing.create({ data: { id, accountId: "account", marketplace: "FLIPKART", sellerSkuId, sku: sellerSkuId, productTitle: `Fake ${sellerSkuId}`, mainImageUrl: "https://example.com/fake.png" } });
  await db.marketplaceListingIdentifier.create({ data: { id: `identifier-${id}`, accountId: "account", marketplaceListingId: id, marketplace: "FLIPKART", identifierType: "SELLER_SKU", rawValue: sellerSkuId, normalizedValue: normalizeListingIdentifier("SELLER_SKU", sellerSkuId)! } });
  await db.productProcessRule.create({ data: { id: `rule-${id}`, accountId: "account", marketplaceListingId: id, route, markingRequired: route === "PICK_MARK_ASSEMBLE_PACK", assemblyRequired, assemblyTitle: assemblyRequired ? "Attach fake part" : null, assemblyInstructions: assemblyRequired ? "Attach the fake part securely." : null, active: true } });
}

try {
  await db.account.create({ data: { id: "account", name: "Fake Account", code: "FAKE", companyName: "Fake Company", marketplace: "FLIPKART", active: true } });
  await db.user.createMany({ data: [
    { id: "owner", username: "owner", passwordHash: "fake", name: "Owner", role: "OWNER", active: true, accountId: "account" },
    { id: "picker", username: "picker", passwordHash: "fake", name: "Picker", role: "PACKER", active: true, accountId: "account", canPick: true },
    { id: "packer", username: "packer", passwordHash: "fake", name: "Packer", role: "PICKER", active: true, accountId: "account", canPack: true },
    { id: "assembler-a", username: "assembler-a", passwordHash: "fake", name: "Assembler A", role: "PICKER", active: true, accountId: "account", canAssemble: true, canReportProblem: true },
    { id: "assembler-b", username: "assembler-b", passwordHash: "fake", name: "Assembler B", role: "PICKER", active: true, accountId: "account", canAssemble: true, canReportProblem: true },
    { id: "viewer", username: "viewer", passwordHash: "fake", name: "Viewer", role: "PICKER", active: true, accountId: "account", canViewAllWork: true }
  ] });
  await db.uploadBatch.create({ data: { id: "upload", accountId: "account", fileName: "fake.csv" } });
  await listing("listing-assembly", "ASSEMBLY-SKU", "PICK_ASSEMBLE_PACK", true);
  await listing("listing-ready", "READY-SKU", "PICK_PACK", false);
  await listing("listing-unsupported", "UNSUPPORTED-SKU", "PICK_MARK_ASSEMBLE_PACK", true);
  await db.marketplaceListing.create({ data: { id: "listing-ambiguous", accountId: "account", marketplace: "FLIPKART", sellerSkuId: "OTHER-SKU", sku: "OTHER-SKU" } });
  await db.marketplaceListingIdentifier.create({ data: { id: "identifier-ambiguous", accountId: "account", marketplaceListingId: "listing-ambiguous", marketplace: "FLIPKART", identifierType: "SELLER_SKU", rawValue: "ASSEMBLY-SKU", normalizedValue: normalizeListingIdentifier("SELLER_SKU", "ASSEMBLY-SKU")! } });

  const readyPolicyOrder = order("policy-ready", "READY-SKU");
  const unsupportedPolicyOrder = order("policy-unsupported", "UNSUPPORTED-SKU");
  assert.equal((await resolveOrderAssemblyPolicy(readyPolicyOrder, db)).state, "READY_MADE");
  assert.equal((await resolveOrderAssemblyPolicy(unsupportedPolicyOrder, db)).state, "UNSUPPORTED_ROUTE");
  assert.equal((await resolveOrderAssemblyPolicy(order("policy-none", "NO-RULE-SKU"), db)).state, "NO_RULE");
  assert.equal((await resolveOrderAssemblyPolicy(order("policy-ambiguous", "ASSEMBLY-SKU"), db)).state, "AMBIGUOUS_LISTING");
  for (const state of ["NO_RULE", "READY_MADE", "REQUIRED_NO_TASK", "AMBIGUOUS_LISTING"] as const) assert.equal(canOfferManualAssemblyDiversion(state), true);
  for (const state of ["READY", "IN_PROGRESS", "PROBLEM", "COMPLETED", "SKIPPED", "LOCKED", "CANCELLED", "UNSUPPORTED_ROUTE", "INVALID_RULE"] as const) assert.equal(canOfferManualAssemblyDiversion(state), false);

  await db.marketplaceListingIdentifier.delete({ where: { id: "identifier-ambiguous" } });
  await db.order.createMany({ data: [order("auto", "ASSEMBLY-SKU"), order("ready", "READY-SKU"), order("manual", "NO-RULE-SKU", "PICKED"), order("problem", "NO-RULE-PROBLEM", "PICKED"), order("concurrent-claim", "NO-RULE-CLAIM", "PICKED"), order("concurrent-complete", "NO-RULE-COMPLETE", "PICKED"), order("concurrent-problem", "NO-RULE-PROBLEM-REPLAY", "PICKED"), order("ship-a", "ASSEMBLY-SKU", "PICKED", "TRACK-SHIP"), order("ship-b", "READY-SKU", "PICKED", "TRACK-SHIP")] });
  await db.workTask.createMany({ data: ["ship-a", "ship-b"].flatMap(id => [
    { id: `${id}-pick`, accountId: "account", sourceType: "ORDER", orderId: id, stage: "PICK", sequenceNumber: 10, requiredQuantity: 1, completedQuantity: 1, status: "COMPLETED", completedAt: new Date() },
    { id: `${id}-pack`, accountId: "account", sourceType: "ORDER", orderId: id, stage: "PACK", sequenceNumber: 11, requiredQuantity: 1, status: "READY" }
  ]) });

  const picked = await markCustomerOrdersPickedSafely({ actorUserId: "picker", accountId: "account", where: { id: { in: ["auto", "ready"] } }, source: "picker-card", expectedStatus: "READY" }, db);
  assert.equal(picked.updatedCount, 2);
  assert.equal(picked.assemblyTaskCount, 1, "Only PICK_ASSEMBLE_PACK creates a task after Pick");
  assert.equal(await db.workTask.count({ where: { orderId: "ready", stage: "ASSEMBLE" } }), 0);
  const autoTask = await db.workTask.findUniqueOrThrow({ where: { orderId_stage: { orderId: "auto", stage: "ASSEMBLE" } } });
  const snapshot = parseOrderAssemblyMetadata(autoTask.metadataJson);
  assert.equal(snapshot?.assemblyInstructions, "Attach the fake part securely.");
  await db.productProcessRule.update({ where: { id: "rule-listing-assembly" }, data: { assemblyInstructions: "Changed later" } });
  assert.equal(parseOrderAssemblyMetadata((await db.workTask.findUniqueOrThrow({ where: { id: autoTask.id } })).metadataJson)?.assemblyInstructions, "Attach the fake part securely.", "Task metadata is immutable");

  const manual = await sendOrderToAssembly({ actorUserId: "packer", accountId: "account", orderId: "manual", manualInstructions: "Use the fake attachment.", clientRequestId: "manual-send" }, db);
  const manualReplay = await sendOrderToAssembly({ actorUserId: "packer", accountId: "account", orderId: "manual", manualInstructions: "Different ignored text", clientRequestId: "manual-send-2" }, db);
  assert.equal(manual.task.id, manualReplay.task.id);
  assert.equal(await db.workTask.count({ where: { orderId: "manual", stage: "ASSEMBLE" } }), 1);
  await claimOrderAssemblyTask({ actorUserId: "assembler-a", accountId: "account", taskId: manual.task.id, clientRequestId: "claim-a" }, db);
  await assert.rejects(() => claimOrderAssemblyTask({ actorUserId: "assembler-b", accountId: "account", taskId: manual.task.id, clientRequestId: "claim-b" }, db), /another worker/i);
  await assert.rejects(() => completeOrderAssemblyTask({ actorUserId: "packer", accountId: "account", taskId: manual.task.id, expectedStatus: "IN_PROGRESS", clientRequestId: "bad-complete" }, db), /assembly permission/i);
  await completeOrderAssemblyTask({ actorUserId: "assembler-a", accountId: "account", taskId: manual.task.id, expectedStatus: "IN_PROGRESS", clientRequestId: "complete-a" }, db);
  const completeReplay = await completeOrderAssemblyTask({ actorUserId: "assembler-a", accountId: "account", taskId: manual.task.id, expectedStatus: "IN_PROGRESS", clientRequestId: "complete-a" }, db);
  assert.equal(completeReplay.idempotent, true);

  const claimTask=(await sendOrderToAssembly({actorUserId:"packer",accountId:"account",orderId:"concurrent-claim",manualInstructions:"Fake concurrent claim."},db)).task;
  const claims=await Promise.all([claimOrderAssemblyTask({actorUserId:"assembler-a",accountId:"account",taskId:claimTask.id,clientRequestId:"claim-same"},db),claimOrderAssemblyTask({actorUserId:"assembler-a",accountId:"account",taskId:claimTask.id,clientRequestId:"claim-same"},db)]);
  assert.equal(claims.filter((result)=>!result.idempotent).length,1);assert.ok(claims.every((result)=>result.status==="IN_PROGRESS"));
  const completeTask=(await sendOrderToAssembly({actorUserId:"packer",accountId:"account",orderId:"concurrent-complete",manualInstructions:"Fake concurrent completion."},db)).task;
  const completions=await Promise.all([completeOrderAssemblyTask({actorUserId:"assembler-a",accountId:"account",taskId:completeTask.id,expectedStatus:"READY",clientRequestId:"complete-same"},db),completeOrderAssemblyTask({actorUserId:"assembler-a",accountId:"account",taskId:completeTask.id,expectedStatus:"READY",clientRequestId:"complete-same"},db)]);
  assert.equal(completions.filter((result)=>!result.idempotent).length,1);assert.ok(completions.every((result)=>result.status==="COMPLETED"));
  const concurrentProblemTask=(await sendOrderToAssembly({actorUserId:"packer",accountId:"account",orderId:"concurrent-problem",manualInstructions:"Fake concurrent problem."},db)).task;
  const problemInput={actorUserId:"assembler-a",accountId:"account",taskId:concurrentProblemTask.id,expectedStatus:"READY",reason:"PART_MISSING",note:"Fake missing part",clientRequestId:"problem-same"};
  const reports=await Promise.all([reportOrderAssemblyProblem(problemInput,db),reportOrderAssemblyProblem(problemInput,db)]);
  assert.equal(reports.filter((result)=>!result.idempotent).length,1);assert.ok(reports.every((result)=>result.status==="PROBLEM"));
  await assert.rejects(()=>reportOrderAssemblyProblem({...problemInput,note:"Changed replay payload"},db),/different payload/i);
  await assert.rejects(()=>reportOrderAssemblyProblem({...problemInput,actorUserId:"assembler-b"},db),/another worker/i);
  await db.user.update({where:{id:"assembler-a"},data:{active:false}});await assert.rejects(()=>reportOrderAssemblyProblem(problemInput,db),/inactive|unavailable|access/i);await db.user.update({where:{id:"assembler-a"},data:{active:true}});

  const problemTask = (await sendOrderToAssembly({ actorUserId: "packer", accountId: "account", orderId: "problem", manualInstructions: "Fake problem task." }, db)).task;
  await reportOrderAssemblyProblem({ actorUserId: "assembler-a", accountId: "account", taskId: problemTask.id, expectedStatus: "READY", reason: "PART_MISSING", note: "Fake part missing", clientRequestId: "problem-1" }, db);
  assert.equal((await getOrderAssemblyPackingGate({ accountId: "account", orders: [{ id: "problem", accountId: "account", sku: "NO-RULE-PROBLEM" }] }, db)).allowed, false);
  await resolveOrderAssemblyProblem({ actorUserId: "owner", accountId: "account", taskId: problemTask.id, resolutionNote: "Fake part supplied." }, db);
  await skipOrderAssemblyTask({ actorUserId: "owner", accountId: "account", taskId: problemTask.id, reason: "Approved fake exception." }, db);
  assert.equal((await getOrderAssemblyPackingGate({ accountId: "account", orders: [{ id: "problem", accountId: "account", sku: "NO-RULE-PROBLEM" }] }, db)).allowed, true);

  await sendOrderToAssembly({ actorUserId: "packer", accountId: "account", orderId: "ship-a" }, db);
  await assert.rejects(() => packCustomerOrderShipmentSafely({ actorUserId: "packer", accountId: "account", orderId: "ship-b", source: "packing-detail" }, db), /assembly/i, "One pending assembly row blocks the whole shipment");
  const shipTask = await db.workTask.findUniqueOrThrow({ where: { orderId_stage: { orderId: "ship-a", stage: "ASSEMBLE" } } });
  await completeOrderAssemblyTask({ actorUserId: "assembler-a", accountId: "account", taskId: shipTask.id, expectedStatus: "READY", clientRequestId: "ship-complete" }, db);
  const packed = await packCustomerOrderShipmentSafely({ actorUserId: "packer", accountId: "account", orderId: "ship-b", source: "packing-detail" }, db);
  assert.equal(packed.packedCount, 2);

  const scan = await resolveUniversalWork({ actorUserId: "assembler-a", code: "AWB-auto", intent: "ASSEMBLE" }, db);
  assert.ok(scan.candidates.some((candidate) => candidate.actionType === "ORDER_ASSEMBLY"));
  const packerScan = await resolveUniversalWork({ actorUserId: "packer", code: "AWB-auto", intent: "ASSEMBLE" }, db);
  assert.ok(packerScan.candidates.some((candidate) => candidate.actionType === "ORDER_WAITING_ASSEMBLY"));
} finally {
  await db.$disconnect();
  try { rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
}

console.log("Customer order assembly integration tests passed.");
