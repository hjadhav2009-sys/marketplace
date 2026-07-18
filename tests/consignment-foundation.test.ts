import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasWorkPermission } from "../lib/work-permissions";
import { createConsignmentTaskPlan } from "../src/lib/workflow/task-store";
import { sanitizeImportJobError } from "../src/lib/import-jobs/safe-error";

const read=(...parts:string[])=>readFileSync(join(process.cwd(),...parts),"utf8");
const permissions={canPick:false,canMark:false,canAssemble:false,canPack:false,canReportProblem:false,canManageMarkingLibrary:false,canManageProcessRules:false,canViewAllWork:false,canViewConsignments:false,canImportConsignments:false,canManageConsignments:false};
assert.equal(hasWorkPermission({role:"OWNER",...permissions},"canManageConsignments"),true);
assert.equal(hasWorkPermission({role:"PACKER",...permissions,canViewConsignments:true},"canViewConsignments"),true);
assert.equal(hasWorkPermission({role:"PACKER",...permissions},"canManageConsignments"),false);
const ready=createConsignmentTaskPlan({lineId:"line_fake",accountId:"account_fake",route:"PICK_PACK",requiredQuantity:5});assert.deepEqual(ready.map((task)=>[task.stage,task.status,task.sequenceNumber]),[["PICK","READY",1],["PACK","LOCKED",2]]);
const marking=createConsignmentTaskPlan({lineId:"line_fake",accountId:"account_fake",route:"PICK_MARK_PACK",requiredQuantity:5});assert.deepEqual(marking.map((task)=>task.stage),["PICK","MARK","PACK"]);assert.equal(marking[0].requiredQuantity,5);
assert.throws(()=>createConsignmentTaskPlan({lineId:"line_fake",accountId:"account_fake",route:"PICK_PACK",requiredQuantity:1.5}),/positive whole/i);

const schema=read("prisma","schema.prisma");const migration=read("prisma","migrations","20260711000200_flipkart_consignment_activation","migration.sql");const nav=read("components","AppShell.tsx");const actions=read("app","owner","consignments","actions.ts");const review=read("app","owner","consignments","[batchId]","review","page.tsx");const archive=read("src","lib","consignments","flipkart","archive.ts");const activation=read("src","lib","workflow","task-store.ts");const labels=read("src","lib","consignments","flipkart","parser.ts");const flipkartImport=read("src","lib","consignments","import-service.ts");const amazonImport=read("src","lib","consignments","amazon","import-service.ts");
assert.match(migration,/WorkTask_source_check/);assert.match(migration,/WorkTask_quantity_check/);assert.match(migration,/WorkTask_consignmentLineId_stage_key/);assert.doesNotMatch(migration,/ALTER TABLE "Order"|UPDATE "Order"/,"Order table is not changed");
assert.match(nav,/hasWorkPermission\(user, "canPick"\)/);assert.match(nav,/hasWorkPermission\(user, "canPack"\)/);assert.match(nav,/owner\/consignments/);
assert.match(actions,/requireWorkPermission\("canManageConsignments"\)/);assert.match(actions,/requireAccount\(user\)/);
assert.match(actions,/safeConsignmentError\(error,/,"Owner Consignment redirects sanitize failures");assert.doesNotMatch(actions,/encodeURIComponent\(error instanceof Error \? error\.message/,"Owner redirects never expose raw internal messages");assert.match(activation,/reason: sanitizeImportJobError\(error, 200\)/,"Activation failure audit metadata is sanitized");
assert.doesNotMatch(actions,/try\s*\{(?:(?!\}\s*catch)[\s\S])*\bredirect\(/,"Successful Consignment redirects stay outside service-error catch scopes");
for(const route of ["PICK_PACK","PICK_MARK_PACK","PICK_ASSEMBLE_PACK","PICK_MARK_ASSEMBLE_PACK"]){assert.ok(actions.includes(`"${route}"`),`Server route correction accepts ${route}`);assert.ok(review.includes(`value="${route}"`),`Owner review offers ${route}`);}
assert.match(actions,/route === "PICK_MARK_PACK" \|\| route === "PICK_MARK_ASSEMBLE_PACK"/,"Both Marking routes require a linked Marking asset");assert.match(actions,/assemblyTitle:[\s\S]{0,500}assemblyInstructions:/,"Assembly route fields reach the authoritative process-rule service");assert.doesNotMatch(review,/Assembly routing is not enabled|activation is blocked|will arrive in Phase/i,"Owner review no longer claims supported Assembly routes are blocked");
assert.match(archive,/generalPurposeBitFlag & 1/);assert.match(archive,/symlink/i);assert.match(archive,/CONSIGNMENT_ZIP_MAX_EXTRACTED_BYTES/);
assert.match(activation,/status: "READY_TO_ACTIVATE"/);assert.match(activation,/status: "ACTIVATING"/);assert.match(activation,/workTask\.createMany/);assert.doesNotMatch(activation,/sourceType: "ORDER"/,"Consignment activation never creates Order tasks");
assert.doesNotMatch(labels,/upsertListingIdentifier|MarketplaceListingIdentifier/,"Labels references do not create barcode identifiers");
for(const source of [flipkartImport,amazonImport]){assert.match(source,/sanitizeImportJobError\(error\)/,"Stored Consignment import errors use the shared privacy sanitizer");assert.doesNotMatch(source,/message:\s*error instanceof Error\s*\?\s*error\.message/,"Raw internal Consignment errors are not persisted");assert.doesNotMatch(source,/catch\s*\(error\)[\s\S]{0,800}throw error[;\s]/,"Raw internal Consignment errors are not returned to the owner UI");}
for(const source of [flipkartImport,amazonImport]){assert.doesNotMatch(source,/ensureMinimalCatalogPlaceholder|CONSIGNMENT_PLACEHOLDER/,"Missing Consignment listings stay held for explicit owner resolution");}
const sensitiveErrors=["C:\\private data\\orders.db failed","\\\\server\\private share\\source.xlsx failed","file:///private/source.csv failed","/home/private/source.csv failed","PrismaClientKnownRequestError P2002","SQLITE_CONSTRAINT: database is locked","SELECT secret FROM User"];
for(const message of sensitiveErrors){const safe=sanitizeImportJobError(new Error(message));assert.equal(safe,"Import failed. Review the job and retry when safe.");assert.ok(!safe?.includes(message));}
assert.equal(sanitizeImportJobError(new Error("Select one account listing before activation.")),"Select one account listing before activation.","Safe domain guidance remains visible");
assert.doesNotMatch(schema,/model (InventoryBalance|InventoryLedger|BranchStock|WarehouseStock|AvailableQuantity|ReservedQuantity|DestinationReceiving|QualityCheck|StockAdjustment|StockValuation|InTransitInventory)/);
assert.match(read(".gitignore"),/storage\/consignment-imports\//);
assert.equal(read("package.json").includes('"react-native-webview"'),false);
console.log("Consignment foundation source and permission tests passed.");
