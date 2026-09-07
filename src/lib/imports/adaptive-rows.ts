import type { Marketplace,MarketplaceImportPurpose,PrismaClient } from "@prisma/client";
import type { RawImportRow } from "@/lib/import/sku-mappings";
import { prisma } from "@/lib/prisma";
import { findHeaderProfile,normalizeMarketplaceHeader } from "./header-profiles";
import { importPurposeDefinition } from "./import-purpose-definitions";
import { productCatalogRegistry } from "./canonical-field-registry";
import { detectCanonicalColumns, mappingFromDetections, sourceColumnsFromHeaders, sourceColumnFingerprint, type SourceColumnRefV2 } from "./source-column-mapping";

export async function applyAdaptiveRows(input:{jobId:string;accountId:string;marketplace:Marketplace;purpose:MarketplaceImportPurpose;rows:RawImportRow[];layoutKnown?:boolean;sourceColumns?:SourceColumnRefV2[]},client:PrismaClient=prisma){
 const resolved=await resolveAdaptiveRows({...input},client);if(resolved.state==="NEEDS_MAPPING"){await client.importJob.update({where:{id:input.jobId},data:{status:"NEEDS_MAPPING",stage:"NEEDS_MAPPING",progressJson:JSON.stringify(resolved.mappingRequest),lastError:"Owner header mapping is required.",finishedAt:null}});return null;}return resolved.rows;
}

export async function resolveAdaptiveRows(input:{accountId:string;marketplace:Marketplace;purpose:MarketplaceImportPurpose;rows:RawImportRow[];layoutKnown?:boolean;sourceColumns?:SourceColumnRefV2[]},client:PrismaClient=prisma){
 const definition=importPurposeDefinition(input.marketplace,input.purpose);if(!definition||!input.rows.length)return{state:"MAPPED" as const,rows:input.rows,profileId:null};const headers=Object.keys(input.rows[0]??{}),sourceColumns=input.sourceColumns?.length?input.sourceColumns:sourceColumnsFromHeaders({humanHeaders:headers}),normalized=new Set(headers.map(normalizeMarketplaceHeader)),required=definition.fields.filter(field=>field.required),known=input.layoutKnown===true||required.every(field=>normalized.has(normalizeMarketplaceHeader(field.targetHeader))),profile=await findHeaderProfile({accountId:input.accountId,marketplace:input.marketplace,importPurpose:input.purpose,headers,sourceColumns},client),registry=input.purpose==="PRODUCT_CATALOG"?productCatalogRegistry(input.marketplace):null;
 let positionalMapping=profile.state==="MATCHED"&&profile.fieldMapping?.version===2?profile.fieldMapping:null;
 if(profile.state==="NEEDS_MAPPING"&&registry){const detections=detectCanonicalColumns({registry,sourceColumns}),blocking=detections.some(item=>item.state==="MISSING_REQUIRED"||item.state==="AMBIGUOUS"||item.state==="MISSING_PREVIOUSLY_MAPPED_OPTIONAL");if(!blocking)positionalMapping=mappingFromDetections(detections);}
 if(profile.state==="NEEDS_MAPPING"&&!positionalMapping){if(input.layoutKnown===true||!registry&&known)return{state:"MAPPED" as const,rows:input.rows,profileId:null};return{state:"NEEDS_MAPPING" as const,rows:null,mappingRequest:{version:2 as const,headers,sourceColumns,fingerprint:sourceColumnFingerprint(sourceColumns),requiredFields:required.map(field=>field.key),optionalFields:definition.fields.filter(field=>!field.required).map(field=>field.key),usefulFieldCount:definition.fields.length,ignoredColumnCount:Math.max(0,sourceColumns.length-definition.fields.length)}};}
 const targets:Record<string,string>=Object.fromEntries(definition.fields.map(field=>[field.key,field.targetHeader]));
 // Keep the existing Amazon mapped parser contract until D3A.2 replaces it.
 if(input.marketplace==="AMAZON"&&input.purpose==="PRODUCT_CATALOG")Object.assign(targets,{sellerSku:"Merchant SKU",asin:"ASIN",title:"Item Name",productTitle:"Item Name",fnsku:"FNSKU",mainImageUrl:"Main Product Image"});
 if(positionalMapping&&Object.values(positionalMapping.fields).some(ref=>sourceColumns.filter(column=>(column.technicalKey||column.rawHumanHeader)===(ref.technicalKey||ref.rawHumanHeader)).length!==1))throw new Error("Repeated source headers require positional rows; header-keyed rows cannot resolve them safely.");
 const rows=input.rows.map(row=>{const mapped={...row};if(positionalMapping){for(const[canonical,ref]of Object.entries(positionalMapping.fields)){const target=targets[canonical],sourceHeader=ref.technicalKey&&Object.hasOwn(row,ref.technicalKey)?ref.technicalKey:ref.rawHumanHeader;if(target)mapped[target]=row[sourceHeader]??"";}}else if(profile.state==="MATCHED"){for(const [canonical,sourceHeader] of Object.entries(profile.mapping)){const target=targets[canonical];if(target)mapped[target]=row[sourceHeader]??"";}}return mapped;});return{state:"MAPPED" as const,rows,profileId:profile.state==="MATCHED"?profile.profile.id:null};
}
