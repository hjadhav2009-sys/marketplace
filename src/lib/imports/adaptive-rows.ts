import type { Marketplace,MarketplaceImportPurpose,PrismaClient } from "@prisma/client";
import type { RawImportRow } from "@/lib/import/sku-mappings";
import { prisma } from "@/lib/prisma";
import { findHeaderProfile,headerFingerprint,normalizeMarketplaceHeader } from "./header-profiles";
import { importPurposeDefinition } from "./import-purpose-definitions";

export async function applyAdaptiveRows(input:{jobId:string;accountId:string;marketplace:Marketplace;purpose:MarketplaceImportPurpose;rows:RawImportRow[];layoutKnown?:boolean},client:PrismaClient=prisma){
 const definition=importPurposeDefinition(input.marketplace,input.purpose);if(!definition||!input.rows.length)return input.rows;const headers=Object.keys(input.rows[0]??{}),normalized=new Set(headers.map(normalizeMarketplaceHeader)),required=definition.fields.filter(field=>field.required),known=input.layoutKnown===true||required.every(field=>normalized.has(normalizeMarketplaceHeader(field.targetHeader))),profile=await findHeaderProfile({accountId:input.accountId,marketplace:input.marketplace,importPurpose:input.purpose,headers},client);
 if(profile.state==="NEEDS_MAPPING"){if(known)return input.rows;await client.importJob.update({where:{id:input.jobId},data:{status:"NEEDS_MAPPING",stage:"NEEDS_MAPPING",progressJson:JSON.stringify({headers,fingerprint:headerFingerprint(headers),requiredFields:required.map(field=>field.key),optionalFields:definition.fields.filter(field=>!field.required).map(field=>field.key)}),lastError:"Owner header mapping is required.",finishedAt:null}});return null;}
 const targets=Object.fromEntries(definition.fields.map(field=>[field.key,field.targetHeader]));return input.rows.map(row=>{const mapped={...row};for(const [canonical,sourceHeader] of Object.entries(profile.mapping)){const target=targets[canonical];if(target)mapped[target]=row[sourceHeader]??"";}return mapped;});
}
