import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { applyAdaptiveRows } from "../src/lib/imports/adaptive-rows";
import { IMPORT_PURPOSE_DEFINITIONS,importPurposeDefinition } from "../src/lib/imports/import-purpose-definitions";
import { saveHeaderProfile } from "../src/lib/imports/header-profiles";
import { assertMarketplaceCapability } from "../src/lib/marketplace-capabilities";

const expected=[["FLIPKART","PRODUCT_CATALOG"],["FLIPKART","DAILY_ORDER"],["FLIPKART","CONSIGNMENT_QUANTITY"],["FLIPKART","CONSIGNMENT_ENRICHMENT"],["AMAZON","PRODUCT_CATALOG"],["AMAZON","CONSIGNMENT_QUANTITY"],["AMAZON","CONSIGNMENT_ENRICHMENT"]] as const;
for(const key of expected)assert.ok(importPurposeDefinition(key[0],key[1]));assert.ok(IMPORT_PURPOSE_DEFINITIONS.every(definition=>definition.fields.some(field=>field.required)));assert.throws(()=>assertMarketplaceCapability("AMAZON","dailyOrders"),/disabled/i);
const {db,cleanup}=createTempWorkflowDb("adaptive-profile-integration");
try{
 await db.account.createMany({data:[{id:"flipkart",name:"Flipkart",code:"FK",marketplace:"FLIPKART"},{id:"amazon",name:"Amazon",code:"AZ",marketplace:"AMAZON"}]});await db.user.create({data:{id:"owner",username:"adaptive-profile-owner",passwordHash:"x",name:"Owner",role:"OWNER"}});
 for(const [index,definition] of IMPORT_PURPOSE_DEFINITIONS.entries()){
  const accountId=definition.marketplace==="AMAZON"?"amazon":"flipkart",jobId=`job-${index}`,headers=definition.fields.map((_,fieldIndex)=>`Unknown column ${fieldIndex+1}`),row=Object.fromEntries(headers.map((header,fieldIndex)=>[header,`value-${fieldIndex+1}`]));await db.importJob.create({data:{id:jobId,accountId,createdByUserId:"owner",marketplace:definition.marketplace,importType:definition.marketplace==="AMAZON"?"AMAZON_PRODUCT_INVENTORY":"FLIPKART_PRODUCT_INVENTORY",fileName:"retained.xlsx",filePath:"retained-test-path",status:"RUNNING",stage:"CLASSIFYING"}});
  assert.equal(await applyAdaptiveRows({jobId,accountId,marketplace:definition.marketplace,purpose:definition.purpose,rows:[row]},db),null);const needs=await db.importJob.findUniqueOrThrow({where:{id:jobId}});assert.equal(needs.status,"NEEDS_MAPPING");assert.match(needs.progressJson??"",/Unknown column/);
  const mapping=Object.fromEntries(definition.fields.map((field,fieldIndex)=>[field.key,headers[fieldIndex]]));await saveHeaderProfile({actorUserId:"owner",accountId,marketplace:definition.marketplace,importPurpose:definition.purpose,profileName:`${definition.label} test`,headers,mapping,requiredFields:definition.fields.filter(field=>field.required).map(field=>field.key),optionalFields:definition.fields.filter(field=>!field.required).map(field=>field.key)},db);await db.importJob.update({where:{id:jobId},data:{status:"QUEUED",stage:"QUEUED"}});const mapped=await applyAdaptiveRows({jobId,accountId,marketplace:definition.marketplace,purpose:definition.purpose,rows:[row]},db);assert.ok(mapped);for(const [fieldIndex,field] of definition.fields.entries())assert.equal(mapped![0][field.targetHeader],`value-${fieldIndex+1}`);const repeated=await applyAdaptiveRows({jobId,accountId,marketplace:definition.marketplace,purpose:definition.purpose,rows:[row]},db);assert.deepEqual(repeated,mapped,"Repeated fingerprint reuses the saved profile without re-upload.");
 }
 const page=readFileSync(resolve("app/owner/imports/[jobId]/mapping/page.tsx"),"utf8"),action=readFileSync(resolve("app/owner/imports/[jobId]/mapping/actions.ts"),"utf8"),runner=readFileSync(resolve("src/lib/import-jobs/runner.ts"),"utf8"),productJobs=readFileSync(resolve("src/lib/product-inventory/jobs.ts"),"utf8");assert.match(page,/definitionForImportJob/);assert.doesNotMatch(page,/const FIELDS/);assert.match(action,/definition\.purpose/);assert.match(action,/startProductInventoryJob/);assert.match(runner,/applyAdaptiveRows/);assert.match(productJobs,/applyAdaptiveRows/);
}finally{await cleanup();}
console.log("Adaptive profile NEEDS_MAPPING, retained retry, and reuse tests passed for every supported purpose.");
