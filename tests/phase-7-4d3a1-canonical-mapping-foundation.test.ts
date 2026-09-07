import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AMAZON_PRODUCT_CATALOG_REGISTRY,FLIPKART_PRODUCT_CATALOG_REGISTRY,MEESHO_PRODUCT_CATALOG_REGISTRY } from "../src/lib/imports/canonical-field-registry";
import { findHeaderProfile,profileFieldMapping,profileMapping,saveHeaderProfile } from "../src/lib/imports/header-profiles";
import { parseHeaderMappingRequest } from "../src/lib/imports/mapping-request";
import { decodeCanonicalFieldMapping,decodeSourceColumnRef,detectCanonicalColumns,encodeSourceColumnRef,mapPositionalSourceRows,mappingFromDetections,sourceColumnFingerprint,sourceColumnsFromHeaders } from "../src/lib/imports/source-column-mapping";
import { resolveAdaptiveRows } from "../src/lib/imports/adaptive-rows";
import { amazonMappedCatalogRows } from "../src/lib/product-inventory/classifier";
import { createTempWorkflowDb } from "./temp-workflow-db";

const amazon=AMAZON_PRODUCT_CATALOG_REGISTRY;
assert.equal(amazon.fields.length,16,"Amazon compact mapping exposes only the frozen 16 useful fields.");
assert.deepEqual(amazon.fields.filter(field=>field.required).map(field=>field.key),["SELLER_SKU"]);
assert.equal(amazon.fields.find(field=>field.key==="ASIN")?.required,false);
assert.ok(!amazon.fields.find(field=>field.key==="SELLER_SKU")?.approvedAliases.some(alias=>["Code","Item","Reference"].includes(alias)));
assert.ok(FLIPKART_PRODUCT_CATALOG_REGISTRY.fields.some(field=>field.key==="PRODUCT_RATING"));
assert.ok(FLIPKART_PRODUCT_CATALOG_REGISTRY.fields.some(field=>field.mappingKey==="sellingPrice"));
assert.equal(MEESHO_PRODUCT_CATALOG_REGISTRY.fields.find(field=>field.key==="SELLER_SKU")?.targetHeader,"Style ID/Sku");
assert.ok(MEESHO_PRODUCT_CATALOG_REGISTRY.fields.some(field=>field.mappingKey==="productId"));
assert.ok(MEESHO_PRODUCT_CATALOG_REGISTRY.fields.some(field=>field.mappingKey==="catalogId"));

const human=Array.from({length:900},(_,index)=>`Ignored ${index+1}`),technical=Array.from({length:900},()=>"");
human[2]="SKU";technical[2]="contribution_sku#1.value";
human[7]="Other Image URL";human[8]="Other Image URL";human[9]="Other Image URL";
human[10]="Other Image URL";human[11]="Other Image URL";human[12]="Other Image URL";
human[13]="Other Image URL";human[14]="Other Image URL";
const columns=sourceColumnsFromHeaders({sheetId:"Template",tableId:"Catalog",humanHeaders:human,technicalHeaders:technical});
assert.equal(columns.length,900,"A normal compact scan safely retains positional identity across a 900-column source.");
assert.equal(columns[7].excelColumn,"H");
assert.notEqual(encodeSourceColumnRef(columns[7]),encodeSourceColumnRef(columns[8]));
assert.deepEqual(decodeSourceColumnRef(encodeSourceColumnRef(columns[8])),columns[8]);
const detections=detectCanonicalColumns({registry:amazon,sourceColumns:columns});
assert.equal(detections.find(item=>item.field.key==="SELLER_SKU")?.state,"TECHNICAL_KEY");
for(let ordinal=1;ordinal<=8;ordinal+=1)assert.equal(detections.find(item=>item.field.key===`OTHER_IMAGE_URL_${ordinal}`)?.sourceColumn?.columnIndex,ordinal+6,`Repeated image ${ordinal} retains its exact source position.`);
const compact=mappingFromDetections(detections);
assert.equal(Object.keys(compact.fields).length,9,"Only useful detected columns are retained; unrelated wide columns are discarded.");
const ambiguousTitle=detectCanonicalColumns({registry:amazon,sourceColumns:sourceColumnsFromHeaders({humanHeaders:["SKU","Title","Title"]})});assert.equal(ambiguousTitle.find(item=>item.field.key==="TITLE")?.state,"AMBIGUOUS","A repeated non-multiplicity field requires owner review.");
const positionalRows=mapPositionalSourceRows({rows:[[...Array.from({length:900},()=>""),]],mapping:compact,targetHeaders:Object.fromEntries(amazon.fields.map(field=>[field.mappingKey,field.targetHeader]))});
assert.equal(positionalRows.length,1);
const row=Array.from({length:900},()=>"");row[2]="SKU-POSITIONAL";for(let index=7;index<=14;index+=1)row[index]=`https://example.test/${index}.jpg`;
const mapped=mapPositionalSourceRows({rows:[row],mapping:compact,targetHeaders:Object.fromEntries(amazon.fields.map(field=>[field.mappingKey,field.targetHeader]))})[0];
assert.equal(mapped.SKU,"SKU-POSITIONAL");assert.equal(mapped["Other Image URL 1"],"https://example.test/7.jpg");assert.equal(mapped["Other Image URL 8"],"https://example.test/14.jpg");
const request=parseHeaderMappingRequest({version:2,headers:technical,sourceColumns:columns,requiredFields:["sellerSku"],optionalFields:amazon.fields.slice(1).map(field=>field.mappingKey),usefulFieldCount:16});
assert.equal(request?.sourceColumns.length,900);assert.equal(request?.ignoredColumnCount,884);assert.equal(request?.fingerprint,sourceColumnFingerprint(columns));
assert.throws(()=>sourceColumnsFromHeaders({humanHeaders:Array.from({length:2001},()=>"x")}),/too many columns/i);
assert.equal(decodeCanonicalFieldMapping({sellerSku:"SKU"}).version,1,"Legacy string mappings remain readable.");

// Partial repeated galleries must never reuse a column for missing image slots.
for (const count of [1, 2, 3, 7]) {
 const partial=detectCanonicalColumns({registry:amazon,sourceColumns:sourceColumnsFromHeaders({humanHeaders:["SKU",...Array(count).fill("Other Image URL")]})});
 for(let ordinal=1;ordinal<=8;ordinal++)assert.equal(partial.find(item=>item.field.key===`OTHER_IMAGE_URL_${ordinal}`)?.sourceColumn?.columnIndex,ordinal<=count?ordinal:undefined);
}
const late=sourceColumnsFromHeaders({humanHeaders:Array.from({length:900},(_,i)=>i===899?"SKU":`Unused ${i}`)});
assert.equal(detectCanonicalColumns({registry:amazon,sourceColumns:late})[0].sourceColumn?.columnIndex,899);
for(const headers of [["Code","Item","Reference"],["SKU","SKU"]])assert.equal(detectCanonicalColumns({registry:amazon,sourceColumns:sourceColumnsFromHeaders({humanHeaders:headers})})[0].sourceColumn,null);
assert.equal(detectCanonicalColumns({registry:MEESHO_PRODUCT_CATALOG_REGISTRY,sourceColumns:sourceColumnsFromHeaders({humanHeaders:["Style ID/Sku","Image 1 URL","Image 2 URL"]})}).find(item=>item.field.key==="OTHER_IMAGE_URL_1")?.sourceColumn?.columnIndex,2);
assert.throws(()=>sourceColumnFingerprint([columns[0],columns[0]]),/duplicate positions/);
assert.equal(decodeSourceColumnRef(encodeSourceColumnRef(columns[0]).slice(0,-4)),null);

const {db,cleanup}=createTempWorkflowDb("d3a1-canonical-mapping");
try{
 await db.account.create({data:{id:"amazon",name:"Amazon",code:"D3A1-AMZ",marketplace:"AMAZON"}});await db.user.create({data:{id:"owner",username:"d3a1-owner",passwordHash:"x",name:"Owner",role:"OWNER"}});
 await db.account.create({data:{id:"amazon-other",name:"Other Amazon",code:"D3A1-OTHER",marketplace:"AMAZON"}});
 const saved=await saveHeaderProfile({actorUserId:"owner",accountId:"amazon",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",profileName:"900-column compact category",headers:technical,sourceColumns:columns,mapping:compact,requiredFields:["sellerSku"],optionalFields:amazon.fields.slice(1).map(field=>field.mappingKey)},db);
 assert.equal(profileFieldMapping(saved).version,2);assert.equal(profileMapping(saved).otherImageUrl1,"Other Image URL");
 const found=await findHeaderProfile({accountId:"amazon",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headers:technical,sourceColumns:columns},db);assert.equal(found.state,"MATCHED");assert.equal(found.fieldMapping?.version,2);
 await assert.rejects(()=>saveHeaderProfile({actorUserId:"owner",accountId:"amazon",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",profileName:"tampered",headers:technical,sourceColumns:columns,mapping:{version:2,fields:{sellerSku:{...columns[2],columnIndex:3,excelColumn:"D"}}},requiredFields:["sellerSku"]},db),/does not match the source columns/i);
 assert.equal((await findHeaderProfile({accountId:"amazon-other",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headers:technical,sourceColumns:columns},db)).state,"NEEDS_MAPPING");
 assert.equal((await findHeaderProfile({accountId:"amazon",marketplace:"FLIPKART",importPurpose:"PRODUCT_CATALOG",headers:technical,sourceColumns:columns},db)).state,"NEEDS_MAPPING");
 const casingChanged=columns.map((column,index)=>index===2?{...column,rawHumanHeader:"sku"}:column);
 assert.equal((await findHeaderProfile({accountId:"amazon",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headers:technical,sourceColumns:casingChanged},db)).state,"NEEDS_MAPPING","Normalized fingerprint cannot authorize stale raw positional references.");
 const changed=columns.map((column,index)=>index===2?{...column,rawHumanHeader:"Changed SKU"}:column);
 assert.equal((await findHeaderProfile({accountId:"amazon",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headers:technical,sourceColumns:changed},db)).state,"NEEDS_MAPPING");
 await assert.rejects(()=>saveHeaderProfile({actorUserId:"owner",accountId:"amazon",marketplace:"FLIPKART",importPurpose:"PRODUCT_CATALOG",profileName:"Wrong marketplace",headers:["SKU"],mapping:{sellerSku:"SKU"},requiredFields:["sellerSku"]},db),/marketplace does not match/);
 for(const row of [{Code:"x"},{SKU:"x","Seller SKU":"y"}] as Record<string,string>[]){
  const result=await resolveAdaptiveRows({accountId:"amazon-other",marketplace:"AMAZON",purpose:"PRODUCT_CATALOG",rows:[row]},db);
  // Exact SKU has priority over an approved alias; unknown identity never guesses.
  assert.equal(result.state,"Code" in row?"NEEDS_MAPPING":"MAPPED");
 }
 const legacyHeaders=["Unknown identity","Unknown title","Unknown ASIN"];
 await saveHeaderProfile({actorUserId:"owner",accountId:"amazon",marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",profileName:"Legacy",headers:legacyHeaders,mapping:{sellerSku:legacyHeaders[0],productTitle:legacyHeaders[1],asin:legacyHeaders[2]},requiredFields:["sellerSku"]},db);
 const legacyResult=await resolveAdaptiveRows({accountId:"amazon",marketplace:"AMAZON",purpose:"PRODUCT_CATALOG",rows:[{[legacyHeaders[0]]:"LEGACY-1",[legacyHeaders[1]]:"Legacy title",[legacyHeaders[2]]:"B012345678"}]},db);
 assert.equal(legacyResult.state,"MAPPED");
 const parsed=amazonMappedCatalogRows(legacyResult.rows!,"amazon","synthetic")[0];
 assert.equal(parsed.sellerSku,"LEGACY-1");assert.equal(parsed.title,"Legacy title");assert.equal(parsed.asin,"B012345678");
 const compactResult=await resolveAdaptiveRows({accountId:"amazon-other",marketplace:"AMAZON",purpose:"PRODUCT_CATALOG",rows:[{SKU:"COMPACT-1",Title:"Compact title"}]},db);
 assert.equal(amazonMappedCatalogRows(compactResult.rows!,"amazon-other","synthetic")[0].sellerSku,"COMPACT-1");
 await assert.rejects(()=>resolveAdaptiveRows({accountId:"amazon",marketplace:"AMAZON",purpose:"PRODUCT_CATALOG",sourceColumns:columns,rows:[{SKU:"COLLAPSED","Other Image URL":"lost duplicates"}]},db),/positional rows/);
}finally{await cleanup();}

const page=readFileSync(resolve("app/owner/imports/[jobId]/mapping/page.tsx"),"utf8"),action=readFileSync(resolve("app/owner/imports/[jobId]/mapping/actions.ts"),"utf8"),profiles=readFileSync(resolve("src/lib/imports/header-profiles.ts"),"utf8");
assert.match(page,/Map File Columns/);assert.match(page,/sourceColumnLabel/);assert.match(page,/including files with repeated header names/);assert.doesNotMatch(page,/<option key=\{header\}/);
assert.match(action,/decodeSourceColumnRef/);assert.match(action,/sourceColumns:request\.sourceColumns/);assert.doesNotMatch(action,/headers\.includes\(source\)/);
assert.match(profiles,/technicalHeaders\.length>250/,"The generic detected-form engine keeps its independent 250-column boundary.");
console.log("Phase 7.4D3A.1 canonical registry, wide-source, positional mapping, legacy compatibility, and mapping UI tests passed.");
