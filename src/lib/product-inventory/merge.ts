import { randomUUID } from "node:crypto";
import type { IdentifierType, Marketplace, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import { IDENTIFIER_FIELDS, normalizeCatalogRow, type CatalogConflict, type CatalogMergeResult, type MarketplaceCatalogRowV1 } from "./catalog";

type Client=PrismaClient|Prisma.TransactionClient;
const chunks=<T>(items:T[],size=250)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,(index+1)*size));
const identityEntries=(row:MarketplaceCatalogRowV1)=>IDENTIFIER_FIELDS.flatMap(([type,key])=>{const raw=row[key];const normalized=normalizeListingIdentifier(type,raw);return typeof raw==="string"&&normalized?[{type,raw,normalized}]:[];});
const key=(type:IdentifierType,value:string)=>`${type}:${value}`;
const cleanJson=(row:MarketplaceCatalogRowV1)=>{const values={productType:row.productType,material:row.material,color:row.color,size:row.size,modelNumber:row.modelNumber,bulletPoints:row.bulletPoints,specifications:row.specifications};return Object.values(values).some(Boolean)?JSON.stringify(values):null;};

export async function mergeMarketplaceCatalogRows(input:{accountId:string;marketplace:Marketplace;rows:MarketplaceCatalogRowV1[];chunkSize?:number},client:Client=prisma):Promise<CatalogMergeResult>{
 const result:CatalogMergeResult={processed:0,inserted:0,enriched:0,unchanged:0,conflicts:[],warnings:[]};
 const seenSellerSkus=new Set<string>();
 for(const sourceChunk of chunks(input.rows,input.chunkSize??250)){
  const rows=sourceChunk.map(normalizeCatalogRow).filter(row=>row.accountId===input.accountId&&row.marketplace===input.marketplace);result.processed+=rows.length;
  const sellerSkus=[...new Set(rows.map(row=>row.sellerSku).filter((v):v is string=>Boolean(v)))];const identifiers=rows.flatMap(identityEntries);
  const [bySkuRows,idRows]=await Promise.all([
   client.marketplaceListing.findMany({where:{accountId:input.accountId,marketplace:input.marketplace,sellerSkuId:{in:sellerSkus}},include:{identifiers:{where:{active:true}}}}),
   identifiers.length?client.marketplaceListingIdentifier.findMany({where:{accountId:input.accountId,marketplace:input.marketplace,active:true,OR:[...new Map(identifiers.map(item=>[key(item.type,item.normalized),{identifierType:item.type,normalizedValue:item.normalized}])).values()]},select:{marketplaceListingId:true,identifierType:true,normalizedValue:true}}):[]
  ]);
  const bySku=new Map(bySkuRows.map(item=>[normalizeListingIdentifier("SELLER_SKU",item.sellerSkuId)!,item]));const byIdentifier=new Map<string,Set<string>>();for(const item of idRows){const k=key(item.identifierType,item.normalizedValue);const set=byIdentifier.get(k)??new Set<string>();set.add(item.marketplaceListingId);byIdentifier.set(k,set);}
  for(const row of rows){const entries=identityEntries(row);const normalizedSellerSku=row.sellerSku?normalizeListingIdentifier("SELLER_SKU",row.sellerSku):null;if(normalizedSellerSku&&seenSellerSkus.has(normalizedSellerSku))result.warnings.push(conflict(row,"Duplicate Seller SKU source row was safely merged into the canonical account-scoped listing.","Nonblank existing information and identifiers were preserved."));if(normalizedSellerSku)seenSellerSkus.add(normalizedSellerSku);let listing=normalizedSellerSku?bySku.get(normalizedSellerSku):undefined;const exactIds=[...new Set(entries.flatMap(item=>[...(byIdentifier.get(key(item.type,item.normalized))??[])]))];
   if(listing&&exactIds.some(id=>id!==listing!.id)){result.conflicts.push(conflict(row,"Identifiers resolve to a different same-account product.","Existing products were preserved; owner review is required."));continue;}
   if(!listing&&exactIds.length===1)listing=await client.marketplaceListing.findFirst({where:{id:exactIds[0],accountId:input.accountId,marketplace:input.marketplace},include:{identifiers:{where:{active:true}}}})??undefined;
   if(!listing&&exactIds.length>1){result.conflicts.push(conflict(row,"Identifiers resolve to multiple same-account products.","No merge was applied."));continue;}
   const canCreate=Boolean(row.sellerSku)&&(input.marketplace==="FLIPKART"||row.sourceProfile==="AMAZON_ALL_LISTINGS");
   if(!listing&&!canCreate){result.warnings.push(conflict(row,"No authoritative creation identity or unique exact product match.","Enrichment row did not create a product."));continue;}
   if(!listing){const id=`cat_${randomUUID().replace(/-/g,"")}`;listing=await client.marketplaceListing.create({data:{id,accountId:input.accountId,marketplace:input.marketplace,sellerSkuId:row.sellerSku!,sku:row.internalSku??row.sellerSku!,productTitle:row.title,fsn:row.fsn,listingId:row.listingId??row.lid,listingStatus:row.listingStatus,liveBrand:row.brand,liveCategory:row.category,subCategory:row.subCategory,description:row.description,allSpecifications:cleanJson(row),mrp:row.mrp,sellingPrice:row.sellingPrice,mainImageUrl:row.mainImageUrl,...gallery(row.imageUrls),lastImportedAt:new Date()},include:{identifiers:{where:{active:true}}}});result.inserted++;bySku.set(normalizeListingIdentifier("SELLER_SKU",listing.sellerSkuId)!,listing);}
   else{const data:Prisma.MarketplaceListingUpdateInput={lastImportedAt:new Date()};let changed=false;const fill=(field:keyof Prisma.MarketplaceListingUpdateInput,current:unknown,incoming:unknown)=>{if((current===null||current==="")&&incoming!==null&&incoming!==undefined&&incoming!==""){(data as Record<string,unknown>)[field]=incoming;changed=true;}else if(current&&incoming&&String(current)!==String(incoming))result.conflicts.push(conflict(row,`Incoming ${String(field)} conflicts with an existing nonblank value.`,"Existing value was preserved."));};
    fill("productTitle",listing.productTitle,row.title);fill("fsn",listing.fsn,row.fsn);fill("listingId",listing.listingId,row.listingId??row.lid);fill("listingStatus",listing.listingStatus,row.listingStatus);fill("liveBrand",listing.liveBrand,row.brand);fill("liveCategory",listing.liveCategory,row.category);fill("subCategory",listing.subCategory,row.subCategory);fill("description",listing.description,row.description);fill("allSpecifications",listing.allSpecifications,cleanJson(row));fill("mainImageUrl",listing.mainImageUrl,row.mainImageUrl);fill("mrp",listing.mrp,row.mrp);fill("sellingPrice",listing.sellingPrice,row.sellingPrice);
    const images=gallery(row.imageUrls);for(const [field,value] of Object.entries(images))fill(field as keyof Prisma.MarketplaceListingUpdateInput,(listing as unknown as Record<string,unknown>)[field],value);await client.marketplaceListing.update({where:{id:listing.id},data});if(changed)result.enriched++;else result.unchanged++;}
   const proposed=entries.filter(item=>!(byIdentifier.get(key(item.type,item.normalized))?.size));if(proposed.length){await client.marketplaceListingIdentifier.createMany({data:proposed.map(item=>({accountId:input.accountId,marketplaceListingId:listing!.id,marketplace:input.marketplace,identifierType:item.type,rawValue:item.raw,normalizedValue:item.normalized,source:`CATALOG_${row.sourceProfile}`,active:true}))});for(const item of proposed)byIdentifier.set(key(item.type,item.normalized),new Set([listing.id]));}
  }
 }
 return result;
}
function gallery(urls:string[]|undefined){return Object.fromEntries((urls??[]).slice(0,10).map((url,index)=>[`imageUrl${index+1}`,url]));}
function conflict(row:MarketplaceCatalogRowV1,reason:string,action:string):CatalogConflict{return{sourceFileId:row.sourceFileId,sourceTable:row.sourceTable,sourceRow:row.sourceRow,identifier:row.sellerSku??row.asin??row.externalId??undefined,reason,action};}
