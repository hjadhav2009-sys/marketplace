import type { Marketplace,MarketplaceImportPurpose,PrismaClient } from "@prisma/client";
import type { RawImportRow } from "@/lib/import/sku-mappings";
import { prisma } from "@/lib/prisma";
import { findHeaderProfile,headerFingerprint,normalizeMarketplaceHeader } from "./header-profiles";
import { importPurposeDefinition } from "./import-purpose-definitions";

export async function applyAdaptiveRows(input:{jobId:string;accountId:string;marketplace:Marketplace;purpose:MarketplaceImportPurpose;rows:RawImportRow[];layoutKnown?:boolean},client:PrismaClient=prisma){
 const resolved=await resolveAdaptiveRows({...input},client);if(resolved.state==="NEEDS_MAPPING"){await client.importJob.update({where:{id:input.jobId},data:{status:"NEEDS_MAPPING",stage:"NEEDS_MAPPING",progressJson:JSON.stringify(resolved.mappingRequest),lastError:"Owner header mapping is required.",finishedAt:null}});return null;}return resolved.rows;
}

export async function resolveAdaptiveRows(input:{accountId:string;marketplace:Marketplace;purpose:MarketplaceImportPurpose;rows:RawImportRow[];layoutKnown?:boolean},client:PrismaClient=prisma){
 const definition=importPurposeDefinition(input.marketplace,input.purpose);if(!definition||!input.rows.length)return{state:"MAPPED" as const,rows:input.rows,profileId:null};const headers=Object.keys(input.rows[0]??{}),normalized=new Set(headers.map(normalizeMarketplaceHeader)),required=definition.fields.filter(field=>field.required),known=input.layoutKnown===true||required.every(field=>normalized.has(normalizeMarketplaceHeader(field.targetHeader))),profile=await findHeaderProfile({accountId:input.accountId,marketplace:input.marketplace,importPurpose:input.purpose,headers},client);if(profile.state==="NEEDS_MAPPING"){if(known)return{state:"MAPPED" as const,rows:input.rows,profileId:null};return{state:"NEEDS_MAPPING" as const,rows:null,mappingRequest:{headers,fingerprint:headerFingerprint(headers),requiredFields:required.map(field=>field.key),optionalFields:definition.fields.filter(field=>!field.required).map(field=>field.key)}};}
 const targets=Object.fromEntries(definition.fields.map(field=>[field.key,field.targetHeader])),rows=input.rows.map(row=>{const mapped={...row};for(const [canonical,sourceHeader] of Object.entries(profile.mapping)){const target=targets[canonical];if(target)mapped[target]=row[sourceHeader]??"";}return mapped;});return{state:"MAPPED" as const,rows,profileId:profile.profile.id};
}
