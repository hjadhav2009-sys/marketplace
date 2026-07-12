import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { matchConsignmentLines } from "../src/lib/consignments/import-service";
import { activateConsignmentBatch, isConsignmentRouteCurrentlyEnabled, validateConsignmentActivation } from "../src/lib/workflow/task-store";

const tempRoot=resolve(process.cwd(),".codex-tmp");mkdirSync(tempRoot,{recursive:true});const file=resolve(tempRoot,"consignment-integration.db");rmSync(file,{force:true});
const sqlite=new DatabaseSync(file);sqlite.exec("PRAGMA foreign_keys=ON;");const migrations=resolve(process.cwd(),"prisma","migrations");for(const name of readdirSync(migrations,{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort())sqlite.exec(readFileSync(join(migrations,name,"migration.sql"),"utf8"));sqlite.close();
const db=new PrismaClient({datasourceUrl:`file:${file.replace(/\\/g,"/")}`});
try {
 await db.account.createMany({data:[{id:"acct-a",name:"Fake A",code:"FAKEA",companyName:"Fake Co",marketplace:"FLIPKART",active:true},{id:"acct-b",name:"Fake B",code:"FAKEB",companyName:"Fake Co",marketplace:"FLIPKART",active:true}]});
 await db.user.create({data:{id:"owner-fake",username:"owner-fake",passwordHash:"fake-hash",name:"Fake Owner",role:"OWNER",active:true}});
 await db.marketplaceListing.createMany({data:[
  {id:"listing-a",accountId:"acct-a",marketplace:"FLIPKART",sellerSkuId:"SKU-A",sku:"SKU-A",fsn:"FSN-A",listingId:"L-A",productTitle:"Fake Product A",mainImageUrl:"https://example.invalid/fake-a.png"},
  {id:"listing-c",accountId:"acct-a",marketplace:"FLIPKART",sellerSkuId:"SKU-C",sku:"SKU-C",fsn:"FSN-C",listingId:"L-C",productTitle:"Fake Product C"},
  {id:"listing-b",accountId:"acct-b",marketplace:"FLIPKART",sellerSkuId:"SKU-A",sku:"SKU-A",fsn:"FSN-A",listingId:"L-B",productTitle:"Other Account Product"}
 ]});
 await db.marketplaceListingIdentifier.createMany({data:[
  {accountId:"acct-a",marketplaceListingId:"listing-a",marketplace:"FLIPKART",identifierType:"SELLER_SKU",rawValue:"SKU-A",normalizedValue:"SKU-A"},
  {accountId:"acct-a",marketplaceListingId:"listing-a",marketplace:"FLIPKART",identifierType:"FSN",rawValue:"FSN-A",normalizedValue:"FSN-A"},
  {accountId:"acct-a",marketplaceListingId:"listing-c",marketplace:"FLIPKART",identifierType:"FSN",rawValue:"FSN-C",normalizedValue:"FSN-C"},
  {accountId:"acct-b",marketplaceListingId:"listing-b",marketplace:"FLIPKART",identifierType:"SELLER_SKU",rawValue:"SKU-A",normalizedValue:"SKU-A"},
  {accountId:"acct-b",marketplaceListingId:"listing-b",marketplace:"FLIPKART",identifierType:"FSN",rawValue:"FSN-A",normalizedValue:"FSN-A"}
 ]});
 const fakeLine={rowNumber:2,productNameSource:"Fake",sellerSkuSource:"SKU-A",fsnSource:"FSN-A",brandSource:null,sizeSource:null,colorSource:null,modelIdSource:null,requiredQuantity:5,costPriceReference:null,lengthCmReference:null,breadthCmReference:null,heightCmReference:null,weightKgReference:null};
 const scoped=await matchConsignmentLines("acct-a",[fakeLine],db);assert.equal(scoped[0].decision.listing?.id,"listing-a","Selected account only listing matching");
 const conflicted=await matchConsignmentLines("acct-a",[{...fakeLine,fsnSource:"FSN-C"}],db);assert.equal(conflicted[0].decision.status,"IDENTIFIER_CONFLICT","SKU and FSN conflict blocks selection");
 const ambiguousIdentifier={accountId:"acct-a",marketplaceListingId:"listing-c",marketplace:"FLIPKART" as const,identifierType:"SELLER_SKU" as const,rawValue:"SKU-A",normalizedValue:"SKU-A"};await db.marketplaceListingIdentifier.create({data:ambiguousIdentifier});const ambiguous=await matchConsignmentLines("acct-a",[fakeLine],db);assert.equal(ambiguous[0].decision.status,"EXACT_MULTIPLE");await db.marketplaceListingIdentifier.deleteMany({where:{marketplaceListingId:"listing-c",identifierType:"SELLER_SKU"}});
 const rule=await db.productProcessRule.create({data:{id:"rule-a",accountId:"acct-a",marketplaceListingId:"listing-a",route:"PICK_PACK",active:true,createdByUserId:"owner-fake",updatedByUserId:"owner-fake"}});
 await db.consignmentBatch.create({data:{id:"batch-a",accountId:"acct-a",marketplace:"FLIPKART",externalConsignmentNumber:"CN-A",displayName:"Fake A",status:"READY_TO_ACTIVATE",sourceFileName:"fake.csv",sourceFileSha256:"sha-a",totalSourceRows:1,totalValidLines:1,totalRequiredQuantity:5,matchedLines:1,readyMadeLines:1,createdByUserId:"owner-fake"}});
 await db.consignmentLine.create({data:{id:"line-a",consignmentBatchId:"batch-a",accountId:"acct-a",rowNumber:2,productNameSource:"Fake",sellerSkuSource:"SKU-A",fsnSource:"FSN-A",requiredQuantity:5,marketplaceListingId:"listing-a",matchStatus:"EXACT_SKU",processRoute:"PICK_PACK",processRuleId:rule.id}});
 await db.consignmentImportFile.create({data:{consignmentBatchId:"batch-a",fileType:"QUALITY_CHECK_REFERENCE",originalFileName:"Quality_Check_fake.csv",fileSizeBytes:20,sha256:"qc-sha",parsed:false,rowCount:0,notes:"Reference only"}});
 const validation=await validateConsignmentActivation("batch-a","acct-a",db);assert.equal(validation.problems.length,0);
 const results=await Promise.all([activateConsignmentBatch({batchId:"batch-a",accountId:"acct-a",actorUserId:"owner-fake"},db),activateConsignmentBatch({batchId:"batch-a",accountId:"acct-a",actorUserId:"owner-fake"},db)]);
 assert.equal(results.filter((result)=>result.activated).length,1,"Concurrent activation activates once");
 const tasks=await db.workTask.findMany({where:{consignmentLineId:"line-a"},orderBy:{sequenceNumber:"asc"}});assert.deepEqual(tasks.map((task)=>[task.stage,task.status,task.requiredQuantity]),[["PICK","READY",5],["PACK","LOCKED",5]]);assert.equal(await db.workTask.count({where:{consignmentLineId:"line-a"}}),2,"Double activation creates one task plan");
 const snapshot=await db.consignmentLine.findUniqueOrThrow({where:{id:"line-a"}});assert.equal(snapshot.productTitleSnapshot,"Fake Product A");assert.equal(snapshot.sellerSkuSnapshot,"SKU-A");
 assert.equal(await db.workTask.count({where:{sourceType:"ORDER"}}),0,"No customer Order WorkTasks were created");
 const second=await activateConsignmentBatch({batchId:"batch-a",accountId:"acct-a",actorUserId:"owner-fake"},db);assert.equal(second.alreadyActive,true);assert.equal(second.taskCount,2);
 await db.markingAsset.create({data:{id:"asset-no-file",name:"Fake Marking",status:"ACTIVE",active:true,instructions:"Use the fake operational settings."}});
 const markRule=await db.productProcessRule.create({data:{id:"rule-c",accountId:"acct-a",marketplaceListingId:"listing-c",route:"PICK_MARK_PACK",markingRequired:true,markingAssetId:"asset-no-file",active:true}});
 await db.consignmentBatch.create({data:{id:"batch-mark",accountId:"acct-a",marketplace:"FLIPKART",externalConsignmentNumber:"CN-MARK",displayName:"Fake Mark",status:"READY_TO_ACTIVATE",sourceFileName:"fake.csv",sourceFileSha256:"sha-mark"}});
 await db.consignmentLine.create({data:{id:"line-mark",consignmentBatchId:"batch-mark",accountId:"acct-a",rowNumber:2,sellerSkuSource:"SKU-C",fsnSource:"FSN-C",requiredQuantity:1,marketplaceListingId:"listing-c",matchStatus:"EXACT_SKU",processRoute:"PICK_MARK_PACK",processRuleId:markRule.id,markingAssetId:"asset-no-file"}});
 const markValidation=await validateConsignmentActivation("batch-mark","acct-a",db);assert.ok(!markValidation.problems.some((problem)=>problem.code==="MISSING_MARKING_FILE"),"A worker marking file is not required in Phase 6");
 assert.ok(markValidation.warnings.some((warning)=>warning.code==="MISSING_IMAGE"),"Missing product image is a visible nonblocking warning");
 await db.consignmentBatch.create({data:{id:"batch-saved-default",accountId:"acct-a",marketplace:"FLIPKART",externalConsignmentNumber:"CN-SAVED",displayName:"Fake Saved Default",status:"READY_TO_ACTIVATE",sourceFileName:"fake-saved.csv",sourceFileSha256:"sha-saved",totalRequiredQuantity:1}});
 await db.consignmentLine.create({data:{id:"line-saved-default",consignmentBatchId:"batch-saved-default",accountId:"acct-a",rowNumber:2,sellerSkuSource:"SKU-C",requiredQuantity:1,marketplaceListingId:"listing-c",matchStatus:"EXACT_SKU"}});
 const savedValidation=await validateConsignmentActivation("batch-saved-default","acct-a",db);assert.equal(savedValidation.problems.length,0);assert.ok(!savedValidation.warnings.some((warning)=>warning.code==="NO_SAVED_DEFAULT"),"Active saved listing rule is authoritative");
 await activateConsignmentBatch({batchId:"batch-saved-default",accountId:"acct-a",actorUserId:"owner-fake"},db);
 const savedTasks=await db.workTask.findMany({where:{consignmentLineId:"line-saved-default"},orderBy:{sequenceNumber:"asc"}});assert.deepEqual(savedTasks.map((task)=>task.stage),["PICK","MARK","PACK"]);
 await db.consignmentBatch.create({data:{id:"batch-default",accountId:"acct-a",marketplace:"FLIPKART",externalConsignmentNumber:"CN-DEFAULT",displayName:"Fake Default",status:"READY_TO_ACTIVATE",sourceFileName:"fake-default.csv",sourceFileSha256:"sha-default",totalRequiredQuantity:2}});
 await db.consignmentLine.create({data:{id:"line-default",consignmentBatchId:"batch-default",accountId:"acct-a",rowNumber:2,sellerSkuSource:"SKU-C",requiredQuantity:2,marketplaceListingId:"listing-c",matchStatus:"EXACT_SKU"}});
 await db.productProcessRule.update({where:{id:markRule.id},data:{active:false}});
 const defaultValidation=await validateConsignmentActivation("batch-default","acct-a",db);assert.equal(defaultValidation.problems.length,0,"Missing process rule is not blocking");assert.ok(defaultValidation.warnings.some((warning)=>warning.code==="NO_SAVED_DEFAULT"));
 await activateConsignmentBatch({batchId:"batch-default",accountId:"acct-a",actorUserId:"owner-fake"},db);
 const defaultLine=await db.consignmentLine.findUniqueOrThrow({where:{id:"line-default"}});assert.equal(defaultLine.processRuleId,null);assert.equal(defaultLine.processRoute,"PICK_PACK");
 const defaultTasks=await db.workTask.findMany({where:{consignmentLineId:"line-default"},orderBy:{sequenceNumber:"asc"}});assert.deepEqual(defaultTasks.map((task)=>task.stage),["PICK","PACK"]);
 assert.equal(isConsignmentRouteCurrentlyEnabled("PICK_PACK"),true);assert.equal(isConsignmentRouteCurrentlyEnabled("PICK_MARK_PACK"),true);assert.equal(isConsignmentRouteCurrentlyEnabled("PICK_ASSEMBLE_PACK"),false);assert.equal(isConsignmentRouteCurrentlyEnabled("PICK_MARK_ASSEMBLE_PACK"),false);
 await db.productProcessRule.update({where:{id:markRule.id},data:{active:true,route:"PICK_ASSEMBLE_PACK",markingRequired:false,assemblyRequired:true}});
 await db.consignmentBatch.create({data:{id:"batch-assembly-blocked",accountId:"acct-a",marketplace:"FLIPKART",externalConsignmentNumber:"CN-ASSEMBLY",displayName:"Fake Assembly",status:"READY_TO_ACTIVATE",sourceFileName:"fake-assembly.csv",sourceFileSha256:"sha-assembly",totalRequiredQuantity:1}});
 await db.consignmentLine.create({data:{id:"line-assembly-blocked",consignmentBatchId:"batch-assembly-blocked",accountId:"acct-a",rowNumber:2,sellerSkuSource:"SKU-C",requiredQuantity:1,marketplaceListingId:"listing-c",matchStatus:"EXACT_SKU"}});
 const assemblyValidation=await validateConsignmentActivation("batch-assembly-blocked","acct-a",db);assert.ok(assemblyValidation.problems.some((problem)=>problem.code==="CONSIGNMENT_ASSEMBLY_NOT_ENABLED"));
 await assert.rejects(()=>activateConsignmentBatch({batchId:"batch-assembly-blocked",accountId:"acct-a",actorUserId:"owner-fake"},db),/Consignment Assembly routing is not enabled yet/);
 assert.equal(await db.workTask.count({where:{consignmentLineId:"line-assembly-blocked"}}),0,"Blocked Assembly route creates no task");
 await db.productProcessRule.update({where:{id:markRule.id},data:{route:"PICK_MARK_ASSEMBLE_PACK",markingRequired:true,assemblyRequired:true}});
 await db.consignmentBatch.create({data:{id:"batch-mark-assembly-blocked",accountId:"acct-a",marketplace:"FLIPKART",externalConsignmentNumber:"CN-MARK-ASSEMBLY",displayName:"Fake Mark Assembly",status:"READY_TO_ACTIVATE",sourceFileName:"fake-mark-assembly.csv",sourceFileSha256:"sha-mark-assembly",totalRequiredQuantity:1}});
 await db.consignmentLine.create({data:{id:"line-mark-assembly-blocked",consignmentBatchId:"batch-mark-assembly-blocked",accountId:"acct-a",rowNumber:2,sellerSkuSource:"SKU-C",requiredQuantity:1,marketplaceListingId:"listing-c",matchStatus:"EXACT_SKU"}});
 const markAssemblyValidation=await validateConsignmentActivation("batch-mark-assembly-blocked","acct-a",db);assert.ok(markAssemblyValidation.problems.some((problem)=>problem.code==="CONSIGNMENT_MARK_ASSEMBLY_NOT_ENABLED"));
 await assert.rejects(()=>activateConsignmentBatch({batchId:"batch-mark-assembly-blocked",accountId:"acct-a",actorUserId:"owner-fake"},db),/Consignment Marking \+ Assembly routing is not enabled yet/);
 assert.equal(await db.workTask.count({where:{stage:"ASSEMBLE",sourceType:"CONSIGNMENT"}}),0,"No consignment Assembly task is created");
} finally { await db.$disconnect(); rmSync(file,{force:true}); }
console.log("Consignment temporary-database integration tests passed.");
