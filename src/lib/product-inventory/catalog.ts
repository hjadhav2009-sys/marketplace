import type { IdentifierType, Marketplace } from "@prisma/client";

export type CatalogSourceProfile = "FLIPKART_LISTING_IDENTITY"|"FLIPKART_CATEGORY_CATALOG"|"FLIPKART_IMAGE_ENRICHMENT"|"AMAZON_ALL_LISTINGS"|"AMAZON_CATEGORY_CATALOG"|"AMAZON_PRODUCT_CATALOG"|"CATALOG_SUPPORTING";
export type MarketplaceCatalogRowV1 = {
  version:1; marketplace:Marketplace; accountId:string; sourceFileId:string; sourceTable:string; sourceRow:number; sourceProfile:CatalogSourceProfile; sourceAuthority:number;
  sellerSku?:string|null; internalSku?:string|null; fsn?:string|null; listingId?:string|null; lid?:string|null; asin?:string|null; fnsku?:string|null; externalId?:string|null; ean?:string|null; upc?:string|null; gtin?:string|null; modelNumber?:string|null;
  title?:string|null; brand?:string|null; category?:string|null; subCategory?:string|null; productType?:string|null; material?:string|null; color?:string|null; size?:string|null; description?:string|null; bulletPoints?:string[]; specifications?:Record<string,string>;
  listingStatus?:string|null; mrp?:number|null; sellingPrice?:number|null; mainImageUrl?:string|null; imageUrls?:string[];
};
export type CatalogConflict={sourceFileId:string;sourceTable:string;sourceRow:number;identifier?:string;reason:string;action:string};
export type CatalogMergeResult={processed:number;inserted:number;enriched:number;unchanged:number;conflicts:CatalogConflict[];warnings:CatalogConflict[]};

const MAX:Record<string,number>={identifier:160,title:500,brand:160,category:200,attribute:200,description:4000,status:100};
export function bounded(value:unknown,max:number){const text=String(value??"").normalize("NFKC").trim();return !text||/[\u0000-\u001f\u007f]/.test(text)?null:text.slice(0,max);}
export function safeCatalogImageUrl(value:unknown){const text=bounded(value,2048);if(!text)return null;try{const url=new URL(text);return url.protocol==="http:"||url.protocol==="https:"?url.toString():null;}catch{return null;}}
export function normalizeCatalogRow(row:MarketplaceCatalogRowV1):MarketplaceCatalogRowV1{return{...row,
 sellerSku:bounded(row.sellerSku,MAX.identifier),internalSku:bounded(row.internalSku,MAX.identifier),fsn:bounded(row.fsn,MAX.identifier),listingId:bounded(row.listingId,MAX.identifier),lid:bounded(row.lid,MAX.identifier),asin:bounded(row.asin,MAX.identifier),fnsku:bounded(row.fnsku,MAX.identifier),externalId:bounded(row.externalId,MAX.identifier),ean:bounded(row.ean,MAX.identifier),upc:bounded(row.upc,MAX.identifier),gtin:bounded(row.gtin,MAX.identifier),modelNumber:bounded(row.modelNumber,MAX.identifier),
 title:bounded(row.title,MAX.title),brand:bounded(row.brand,MAX.brand),category:bounded(row.category,MAX.category),subCategory:bounded(row.subCategory,MAX.category),productType:bounded(row.productType,MAX.category),material:bounded(row.material,MAX.attribute),color:bounded(row.color,MAX.attribute),size:bounded(row.size,MAX.attribute),description:bounded(row.description,MAX.description),listingStatus:bounded(row.listingStatus,MAX.status),mainImageUrl:safeCatalogImageUrl(row.mainImageUrl),imageUrls:[...new Set([row.mainImageUrl,...(row.imageUrls??[])].map(safeCatalogImageUrl).filter((item):item is string=>Boolean(item)))].slice(0,10),bulletPoints:(row.bulletPoints??[]).map(item=>bounded(item,500)).filter((item):item is string=>Boolean(item)).slice(0,5)};}
export const IDENTIFIER_FIELDS:Array<[IdentifierType,keyof MarketplaceCatalogRowV1]>=[["SELLER_SKU","sellerSku"],["INTERNAL_SKU","internalSku"],["FSN","fsn"],["LISTING_ID","listingId"],["LID","lid"],["ASIN","asin"],["FNSKU","fnsku"],["EXTERNAL_ID","externalId"],["EAN","ean"],["UPC","upc"],["GTIN","gtin"],["MODEL_NUMBER","modelNumber"]];
