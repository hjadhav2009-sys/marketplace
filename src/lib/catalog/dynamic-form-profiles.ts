import { createHash } from "node:crypto";
import { headerFingerprint, normalizeMarketplaceHeader } from "@/src/lib/imports/header-profiles";

export type DynamicListingFieldType = "text" | "long_text" | "number" | "integer" | "decimal" | "URL" | "boolean" | "select" | "multi_value";
export type DynamicListingField = {
  canonicalKey: string;
  originalHeader: string;
  technicalKey: string;
  label: string;
  section: "Identity" | "Basic" | "Images" | "Pricing" | "Description" | "Bullets and Keywords" | "Category Attributes" | "Advanced Fields";
  dataType: DynamicListingFieldType;
  maxLength: number;
  repeatIndex?: number;
  marketplaceRequiredGuidance: boolean;
  locallyOptional: boolean;
  commonFieldTarget?: string;
  dynamicAttributeTarget?: string;
  catalogReferenceOnly?: boolean;
};

export type DynamicListingFormSchema = {
  marketplace: "FLIPKART" | "AMAZON";
  templateKind: string;
  technicalHeaderFingerprint: string;
  humanHeaderFingerprint: string;
  fields: DynamicListingField[];
  groups: string[];
};

const sha=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalizedKey=(value:unknown)=>normalizeMarketplaceHeader(value).replace(/\s+/g,"_");
const bounded=(value:unknown,max=240)=>String(value??"").normalize("NFKC").trim().slice(0,max);

const FLIPKART_COMMON:Record<string,{key:string;target?:string;section:DynamicListingField["section"];type?:DynamicListingFieldType;referenceOnly?:boolean}>={
  product_title:{key:"productTitle",target:"productTitle",section:"Basic"},
  seller_sku_id:{key:"sellerSku",target:"sellerSkuId",section:"Identity"},seller_sku:{key:"sellerSku",target:"sellerSkuId",section:"Identity"},sku:{key:"sellerSku",target:"sellerSkuId",section:"Identity"},fsn:{key:"fsn",target:"fsn",section:"Identity"},fsp:{key:"sellingPrice",target:"sellingPrice",section:"Pricing",type:"decimal"},
  sub_category:{key:"subCategory",target:"subCategory",section:"Basic"},flipkart_serial_number:{key:"fsn",target:"fsn",section:"Identity"},
  listing_id:{key:"listingId",target:"listingId",section:"Identity"},listing_status:{key:"listingStatus",target:"listingStatus",section:"Basic"},
  mrp:{key:"mrp",target:"mrp",section:"Pricing",type:"decimal"},your_selling_price:{key:"sellingPrice",target:"sellingPrice",section:"Pricing",type:"decimal"},
  live_title:{key:"liveTitle",target:"liveTitle",section:"Basic"},live_brand:{key:"brand",target:"liveBrand",section:"Basic"},live_category:{key:"category",target:"liveCategory",section:"Basic"},
  live_price:{key:"livePrice",target:"livePrice",section:"Pricing",type:"decimal"},live_mrp:{key:"liveMrp",target:"liveMrp",section:"Pricing",type:"decimal"},
  product_highlights:{key:"productHighlights",target:"productHighlights",section:"Description",type:"long_text"},description:{key:"description",target:"description",section:"Description",type:"long_text"},all_specifications:{key:"specifications",target:"allSpecifications",section:"Description",type:"long_text"},
  generated_direct_product_url:{key:"generatedProductUrl",target:"generatedDirectProductUrl",section:"Advanced Fields",type:"URL"},canonical_product_url:{key:"canonicalProductUrl",target:"canonicalProductUrl",section:"Advanced Fields",type:"URL"},
  scrape_status:{key:"scrapeStatus",target:"scrapeStatus",section:"Advanced Fields",referenceOnly:true},scrape_error:{key:"scrapeError",target:"scrapeError",section:"Advanced Fields",referenceOnly:true},
  system_stock_count:{key:"systemStockCount",section:"Advanced Fields",type:"integer",referenceOnly:true},your_stock_count:{key:"yourStockCount",section:"Advanced Fields",type:"integer",referenceOnly:true},recommended_stock:{key:"recommendedStock",section:"Advanced Fields",type:"integer",referenceOnly:true},minimum_order_quantity:{key:"minimumOrderQuantity",section:"Advanced Fields",type:"integer",referenceOnly:true},procurement_sla:{key:"procurementSla",section:"Advanced Fields",referenceOnly:true},procurement_type:{key:"procurementType",section:"Advanced Fields",referenceOnly:true}
};

function flipkartImage(header:string){const normal=normalizeMarketplaceHeader(header),normalMatch=normal.match(/^image url (\d{1,2})$/),highMatch=normal.match(/^image (\d{1,2}) 1366 url$/);if(!normalMatch&&!highMatch)return null;const index=Number((highMatch??normalMatch)?.[1]);if(index<1||index>10)return null;const high=Boolean(highMatch);return{key:`${high?"image1366Url":"imageUrl"}${index}`,target:`${high?"image1366Url":"imageUrl"}${index}`,index};}

export function buildFlipkartListingFormSchema(headers:unknown[]):DynamicListingFormSchema|null{
  const original=headers.map(value=>bounded(value));const normalized=new Set(original.map(normalizedKey));
  const identity=["product_title","seller_sku_id","sub_category","flipkart_serial_number","listing_id","listing_status","mrp","your_selling_price"];
  const main=normalized.has("seller_sku_id")&&identity.filter(key=>normalized.has(key)).length>=6,category=["listing_id","fsn","sku","mrp","fsp"].every(key=>normalized.has(key));if(!main&&!category)return null;
  const fields=original.filter(Boolean).map((header,index):DynamicListingField=>{
    const image=flipkartImage(header),common=FLIPKART_COMMON[normalizedKey(header)];
    if(image)return{canonicalKey:image.key,originalHeader:header,technicalKey:image.key,label:header,section:"Images",dataType:"URL",maxLength:2048,repeatIndex:image.index,marketplaceRequiredGuidance:false,locallyOptional:true,commonFieldTarget:image.target};
    if(common)return{canonicalKey:common.key,originalHeader:header,technicalKey:common.key,label:header,section:common.section,dataType:common.type??"text",maxLength:common.type==="long_text"?12000:common.type==="URL"?2048:500,marketplaceRequiredGuidance:common.key==="sellerSku",locallyOptional:common.key!=="sellerSku",commonFieldTarget:common.target,catalogReferenceOnly:common.referenceOnly};
    const technicalKey=`flipkart.${normalizedKey(header)||`column_${index+1}`}`;return{canonicalKey:technicalKey,originalHeader:header,technicalKey,label:header,section:"Category Attributes",dataType:"text",maxLength:4000,marketplaceRequiredGuidance:false,locallyOptional:true,dynamicAttributeTarget:technicalKey};
  });
  return{marketplace:"FLIPKART",templateKind:main?"FLIPKART_MAIN_LISTING_REPORT":`FLIPKART_CATEGORY_ENRICHMENT_${sha(fields.filter(field=>field.dynamicAttributeTarget).map(field=>field.technicalKey)).slice(0,12)}`,technicalHeaderFingerprint:headerFingerprint(fields.map(field=>field.technicalKey)),humanHeaderFingerprint:headerFingerprint(original),fields,groups:["Identity","Basic","Images","Pricing","Description","Category Attributes","Advanced Fields"]};
}

function amazonSection(key:string):DynamicListingField["section"]{if(/sku|product_id|asin|external_id|model_number/.test(key))return"Identity";if(/image.*locator|media_location/.test(key))return"Images";if(/bullet_point|generic_keyword/.test(key))return"Bullets and Keywords";if(/description/.test(key))return"Description";if(/price|currency|mrp/.test(key))return"Pricing";if(/item_name|brand|product_type/.test(key))return"Basic";return"Category Attributes";}
function amazonType(key:string):DynamicListingFieldType{if(/image.*locator|url|media_location/.test(key))return"URL";if(/price|amount/.test(key))return"decimal";if(/bullet_point|generic_keyword/.test(key))return"multi_value";if(/description/.test(key))return"long_text";return"text";}
function amazonCommon(key:string){if(/^contribution_sku#1\.value$/i.test(key))return"sellerSkuId";if(/^item_name.*#1\.value$/i.test(key))return"productTitle";if(/^brand.*#1\.value$/i.test(key))return"liveBrand";if(/^main_product_image_locator.*media_location$/i.test(key))return"mainImageUrl";if(/^product_description.*#1\.value$/i.test(key))return"description";return undefined;}

export function detectAmazonTemplateFormSchema(rows:unknown[][],templateKind="AMAZON_CATEGORY_TEMPLATE"):DynamicListingFormSchema|null{
  let technicalIndex=-1;
  for(let index=0;index<Math.min(rows.length,80);index++){const values=rows[index].map(value=>bounded(value,1000));const score=values.filter(value=>/#\d+\.(value|media_location)$/i.test(value)||/^amzn1\.volt\./i.test(value)).length;if(score>=4){technicalIndex=index;break;}}
  if(technicalIndex<0)return null;
  const technical=rows[technicalIndex].map(value=>bounded(value,1000)),humanIndex=Math.max(0,technicalIndex-1),human=rows[humanIndex]?.map(value=>bounded(value,500))??[];
  const fields=technical.flatMap((key,index):DynamicListingField[]=>{if(!key)return[];const label=human[index]||key,section=amazonSection(key),repeat=Number(key.match(/#(\d+)\./)?.[1]??1);return[{canonicalKey:key,originalHeader:label,technicalKey:key,label,section,dataType:amazonType(key),maxLength:section==="Description"?12000:section==="Images"?2048:4000,repeatIndex:repeat,marketplaceRequiredGuidance:/^contribution_sku#1\.value$/i.test(key),locallyOptional:!/^contribution_sku#1\.value$/i.test(key),commonFieldTarget:amazonCommon(key),dynamicAttributeTarget:amazonCommon(key)?undefined:key}];});
  if(!fields.some(field=>field.commonFieldTarget==="sellerSkuId"))return null;
  return{marketplace:"AMAZON",templateKind,technicalHeaderFingerprint:sha(technical.filter(Boolean).map(value=>value.normalize("NFKC").trim().toLowerCase())),humanHeaderFingerprint:headerFingerprint(human),fields,groups:["Identity","Basic","Images","Pricing","Description","Bullets and Keywords","Category Attributes","Advanced Fields"]};
}

export function preferredFlipkartGallery(input:Record<string,unknown>){const urls:string[]=[];const add=(value:unknown)=>{const text=bounded(value,2048);if(!text||urls.includes(text))return;try{const url=new URL(text);if(url.protocol==="http:"||url.protocol==="https:")urls.push(text);}catch{}};add(input.image1366Url1);add(input.imageUrl1);for(let i=2;i<=10;i++)add(input[`image1366Url${i}`]);for(let i=2;i<=10;i++)add(input[`imageUrl${i}`]);return urls.slice(0,10);}
