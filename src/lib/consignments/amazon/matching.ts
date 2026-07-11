import type { IdentifierType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import type { AmazonConsignmentSourceRow } from "./types";

type Client=PrismaClient|Prisma.TransactionClient;
export type AmazonMatchCandidate={id:string;sellerSkuId:string;sku:string;identifiers:Array<{identifierType:IdentifierType;rawValue:string;normalizedValue:string}>};
export type AmazonMatchDecision=
 | {status:"EXACT_FNSKU"|"EXACT_SKU"|"EXACT_ASIN"|"EXACT_EXTERNAL_ID"|"EXACT_BARCODE";listing:AmazonMatchCandidate;identifierType:IdentifierType;identifierValue:string;candidates:AmazonMatchCandidate[]}
 | {status:"EXACT_MULTIPLE"|"IDENTIFIER_CONFLICT"|"NOT_FOUND";listing:null;candidates:AmazonMatchCandidate[];warning:string};

const PRIORITY:[IdentifierType,(row:AmazonConsignmentSourceRow)=>Array<string|null>][]=[
 ["FNSKU",(row)=>[row.fnsku]],["SELLER_SKU",(row)=>[row.sellerSku]],["ASIN",(row)=>[row.asin]],["EXTERNAL_ID",(row)=>[row.externalId]],
 ["EAN",(row)=>[row.ean]],["UPC",(row)=>[row.upc]],["GTIN",(row)=>[row.gtin]]
];
const statusFor=(type:IdentifierType)=>type==="FNSKU"?"EXACT_FNSKU" as const:type==="SELLER_SKU"?"EXACT_SKU" as const:type==="ASIN"?"EXACT_ASIN" as const:type==="EXTERNAL_ID"?"EXACT_EXTERNAL_ID" as const:"EXACT_BARCODE" as const;
const key=(type:IdentifierType,value:string)=>`${type}:${value}`;

export async function matchAmazonConsignmentRows(accountId:string,rows:AmazonConsignmentSourceRow[],client:Client=prisma){
 const lookupEntries=rows.flatMap((row)=>PRIORITY.flatMap(([type,get])=>get(row).flatMap((raw)=>{const normalized=normalizeListingIdentifier(type,raw);return normalized?[[key(type,normalized),{type,normalized}] as const]:[]})));
 const lookups=[...new Map(lookupEntries).values()];
 const found:Array<{identifierType:IdentifierType;normalizedValue:string;marketplaceListing:AmazonMatchCandidate}>=[];
 for(let index=0;index<lookups.length;index+=400){const group=lookups.slice(index,index+400);found.push(...await client.marketplaceListingIdentifier.findMany({where:{accountId,marketplace:"AMAZON",active:true,OR:group.map((item)=>({identifierType:item.type,normalizedValue:item.normalized}))},select:{identifierType:true,normalizedValue:true,marketplaceListing:{select:{id:true,sellerSkuId:true,sku:true,identifiers:{where:{active:true},select:{identifierType:true,rawValue:true,normalizedValue:true}}}}}}));}
 const map=new Map<string,AmazonMatchCandidate[]>();for(const item of found){const identity=key(item.identifierType,item.normalizedValue);const current=map.get(identity)??[];if(!current.some((candidate)=>candidate.id===item.marketplaceListing.id))current.push(item.marketplaceListing);map.set(identity,current);}
 return rows.map((row)=>{
   const resolved=PRIORITY.flatMap(([type,get])=>get(row).flatMap((raw)=>{const normalized=normalizeListingIdentifier(type,raw);return normalized?[{type,normalized,candidates:map.get(key(type,normalized))??[]}]:[]}));
   const all=[...new Map(resolved.flatMap((item)=>item.candidates).map((candidate)=>[candidate.id,candidate])).values()];
   const matchedGroups=resolved.filter((item)=>item.candidates.length);
   if(all.length>1&&matchedGroups.some((group)=>group.candidates.length===1)&&new Set(matchedGroups.filter((group)=>group.candidates.length===1).map((group)=>group.candidates[0].id)).size>1)return{row,decision:{status:"IDENTIFIER_CONFLICT",listing:null,candidates:all,warning:"Amazon identifiers resolve different listings; owner selection is required."} as AmazonMatchDecision};
   const highest=matchedGroups[0];if(!highest)return{row,decision:{status:"NOT_FOUND",listing:null,candidates:[],warning:"No exact Amazon listing match was found in this account."} as AmazonMatchDecision};
   if(highest.candidates.length!==1)return{row,decision:{status:"EXACT_MULTIPLE",listing:null,candidates:highest.candidates,warning:"Highest-priority Amazon identifier matches multiple listings."} as AmazonMatchDecision};
   return{row,decision:{status:statusFor(highest.type),listing:highest.candidates[0],identifierType:highest.type,identifierValue:highest.normalized,candidates:highest.candidates} as AmazonMatchDecision};
 });
}
