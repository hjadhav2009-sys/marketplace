import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasWorkPermission } from "../lib/work-permissions";
import { createConsignmentTaskPlan } from "../src/lib/workflow/task-store";

const read=(...parts:string[])=>readFileSync(join(process.cwd(),...parts),"utf8");
const permissions={canPick:false,canMark:false,canAssemble:false,canPack:false,canReportProblem:false,canManageMarkingLibrary:false,canManageProcessRules:false,canViewAllWork:false,canViewConsignments:false,canImportConsignments:false,canManageConsignments:false};
assert.equal(hasWorkPermission({role:"OWNER",...permissions},"canManageConsignments"),true);
assert.equal(hasWorkPermission({role:"PACKER",...permissions,canViewConsignments:true},"canViewConsignments"),true);
assert.equal(hasWorkPermission({role:"PACKER",...permissions},"canManageConsignments"),false);
const ready=createConsignmentTaskPlan({lineId:"line_fake",accountId:"account_fake",route:"PICK_PACK",requiredQuantity:5});assert.deepEqual(ready.map((task)=>[task.stage,task.status,task.sequenceNumber]),[["PICK","READY",1],["PACK","LOCKED",2]]);
const marking=createConsignmentTaskPlan({lineId:"line_fake",accountId:"account_fake",route:"PICK_MARK_PACK",requiredQuantity:5});assert.deepEqual(marking.map((task)=>task.stage),["PICK","MARK","PACK"]);assert.equal(marking[0].requiredQuantity,5);
assert.throws(()=>createConsignmentTaskPlan({lineId:"line_fake",accountId:"account_fake",route:"PICK_PACK",requiredQuantity:1.5}),/positive whole/i);

const schema=read("prisma","schema.prisma");const migration=read("prisma","migrations","20260711000200_flipkart_consignment_activation","migration.sql");const nav=read("components","AppShell.tsx");const actions=read("app","owner","consignments","actions.ts");const archive=read("src","lib","consignments","flipkart","archive.ts");const activation=read("src","lib","workflow","task-store.ts");const labels=read("src","lib","consignments","flipkart","parser.ts");
assert.match(migration,/WorkTask_source_check/);assert.match(migration,/WorkTask_quantity_check/);assert.match(migration,/WorkTask_consignmentLineId_stage_key/);assert.doesNotMatch(migration,/ALTER TABLE "Order"|UPDATE "Order"/,"Order table is not changed");
assert.match(nav,/hasWorkPermission\(user, "canPick"\)/);assert.match(nav,/hasWorkPermission\(user, "canPack"\)/);assert.match(nav,/owner\/consignments/);
assert.match(actions,/requireWorkPermission\("canManageConsignments"\)/);assert.match(actions,/requireAccount\(user\)/);
assert.match(archive,/generalPurposeBitFlag & 1/);assert.match(archive,/symlink/i);assert.match(archive,/CONSIGNMENT_ZIP_MAX_EXTRACTED_BYTES/);
assert.match(activation,/status: "READY_TO_ACTIVATE"/);assert.match(activation,/status: "ACTIVATING"/);assert.match(activation,/workTask\.createMany/);assert.doesNotMatch(activation,/sourceType: "ORDER"/,"Consignment activation never creates Order tasks");
assert.doesNotMatch(labels,/upsertListingIdentifier|MarketplaceListingIdentifier/,"Labels references do not create barcode identifiers");
assert.doesNotMatch(schema,/model (InventoryBalance|InventoryLedger|BranchStock|WarehouseStock|AvailableQuantity|ReservedQuantity|DestinationReceiving|QualityCheck|StockAdjustment|StockValuation|InTransitInventory)/);
assert.match(read(".gitignore"),/storage\/consignment-imports\//);
assert.equal(read("package.json").includes('"react-native-webview"'),false);
console.log("Consignment foundation source and permission tests passed.");
